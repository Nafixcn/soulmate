use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::sync::watch;

use crate::{app_error::AppError, credentials, AppState};

type AiResult<T> = Result<T, AppError>;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApiMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiChunk {
    pub content: String,
    pub thinking: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCandidate {
    pub category: String,
    pub content: String,
    pub source_message_id: Option<String>,
    pub confidence: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RelationshipEvaluation {
    pub stage: String,
    pub reason: String,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    state: tauri::State<'_, AppState>,
    messages: Vec<ApiMessage>,
    endpoint: String,
    model: String,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    request_id: String,
    on_chunk: Channel<AiChunk>,
) -> AiResult<()> {
    validate_messages("消息上下文", &messages, 2 * 1024 * 1024)?;
    validate_text_size("API 端点", &endpoint, 2_048)?;
    validate_text_size("模型名称", &model, 256)?;
    validate_text_size("请求标识", &request_id, 128)?;
    validate_endpoint(&endpoint)?;
    let api_key = api_key_for_endpoint(&endpoint)?;

    let client = &state.http_client;
    let cancelled: Arc<DashMap<String, watch::Sender<bool>>> = state.cancelled_requests.clone();
    let (cancel_tx, cancel_rx) = watch::channel(false);
    cancelled.insert(request_id.clone(), cancel_tx);

    let body = build_chat_body(
        &endpoint,
        &model,
        serde_json::json!(messages),
        temperature.unwrap_or(0.85),
        max_tokens.unwrap_or(512),
        true,
    );

    let result = stream_response(client, &endpoint, &api_key, &body, cancel_rx, &on_chunk).await;

    cancelled.remove(&request_id);
    result.map_err(AppError::from)
}

fn build_chat_body(
    endpoint: &str,
    model: &str,
    messages: serde_json::Value,
    temperature: f64,
    max_tokens: u32,
    stream: bool,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": stream,
    });
    let host = reqwest::Url::parse(endpoint)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned));
    let is_openai_reasoning = host.as_deref() == Some("api.openai.com")
        && (model.starts_with("gpt-5") || model.starts_with("gpt-6") || model.starts_with('o'));
    let is_kimi = matches!(host.as_deref(), Some("api.moonshot.cn" | "api.moonshot.ai"))
        && model.starts_with("kimi-");

    if is_openai_reasoning || is_kimi {
        body["max_completion_tokens"] = serde_json::json!(max_tokens);
        if is_openai_reasoning {
            body["reasoning_effort"] = serde_json::json!(if model == "gpt-6-astra" {
                "low"
            } else {
                "none"
            });
        } else if model == "kimi-k3" {
            body["reasoning_effort"] = serde_json::json!("low");
        }
    } else {
        body["temperature"] = serde_json::json!(temperature);
        body["max_tokens"] = serde_json::json!(max_tokens);
        if host.as_deref() == Some("open.bigmodel.cn") && model.starts_with("glm-5.3") {
            body["reasoning_effort"] = serde_json::json!("low");
        }
    }
    body
}

async fn stream_response(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &serde_json::Value,
    mut cancelled: watch::Receiver<bool>,
    on_chunk: &Channel<AiChunk>,
) -> Result<(), String> {
    let request = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(body)
        .send();
    let response = tokio::select! {
        changed = cancelled.changed() => {
            let _ = changed;
            send_done(on_chunk)?;
            return Ok(());
        }
        response = request => response.map_err(|e| e.to_string())?,
    };
    let mut response = response
        .error_for_status()
        .map_err(|e| format!("API 请求失败: {e}"))?;

    let mut buf = Vec::with_capacity(4096);
    let mut error_event = false;
    loop {
        let chunk = tokio::select! {
            changed = cancelled.changed() => {
                let _ = changed;
                send_done(on_chunk)?;
                return Ok(());
            }
            chunk = response.chunk() => chunk.map_err(|e| e.to_string())?,
        };
        let Some(chunk) = chunk else { break };

        buf.extend_from_slice(&chunk);
        while let Some(pos) = find_newline(&buf) {
            let line = String::from_utf8_lossy(&buf[..pos]).to_string();
            buf.drain(..pos + 1);
            if send_stream_line(&line, on_chunk, &mut error_event)? {
                return Ok(());
            }
        }
    }

    if !buf.is_empty() {
        let line = String::from_utf8_lossy(&buf);
        if send_stream_line(&line, on_chunk, &mut error_event)? {
            return Ok(());
        }
    }

    Err("模型回复在完成前中断，请重试".into())
}

fn send_done(on_chunk: &Channel<AiChunk>) -> Result<(), String> {
    on_chunk
        .send(AiChunk {
            content: String::new(),
            thinking: String::new(),
            done: true,
        })
        .map_err(|error| format!("回复通道已关闭: {error}"))
}

#[tauri::command]
pub fn cancel_request(state: tauri::State<'_, AppState>, request_id: String) -> Result<(), String> {
    if let Some(cancelled) = state.cancelled_requests.get(&request_id) {
        let _ = cancelled.send(true);
    }
    Ok(())
}

fn find_newline(buf: &[u8]) -> Option<usize> {
    buf.iter().position(|&b| b == b'\n')
}

fn send_stream_line(
    line: &str,
    on_chunk: &Channel<AiChunk>,
    error_event: &mut bool,
) -> Result<bool, String> {
    let line = line.trim();
    if line.is_empty() {
        *error_event = false;
        return Ok(false);
    }
    if let Some(event) = line.strip_prefix("event:") {
        *error_event = event.trim() == "error";
        return Ok(false);
    }
    if *error_event {
        if let Some(data) = line.strip_prefix("data:") {
            return Err(format!(
                "模型流式回复失败: {}",
                stream_error_message(data.trim())
            ));
        }
    }
    let Some(mut chunk) = parse_stream_line(line)? else {
        return Ok(false);
    };
    let done = chunk.done;
    // A finish_reason may accompany the final text. The frontend consumes text
    // only from non-terminal chunks, so keep it before the separate done event.
    if !chunk.content.is_empty() || !chunk.thinking.is_empty() {
        chunk.done = false;
        on_chunk
            .send(chunk)
            .map_err(|error| format!("回复通道已关闭: {error}"))?;
    }
    if done {
        send_done(on_chunk)?;
    }
    Ok(done)
}

fn stream_error_message(data: &str) -> String {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else {
        return data.to_owned();
    };
    parsed["error"]["message"]
        .as_str()
        .or_else(|| parsed["error"].as_str())
        .or_else(|| parsed["message"].as_str())
        .unwrap_or(data)
        .to_owned()
}

fn parse_stream_line(line: &str) -> Result<Option<AiChunk>, String> {
    let Some(data) = line.trim().strip_prefix("data:").map(str::trim_start) else {
        return Ok(None);
    };
    if data == "[DONE]" {
        return Ok(Some(AiChunk {
            content: String::new(),
            thinking: String::new(),
            done: true,
        }));
    }

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else {
        return Ok(None);
    };
    if parsed.get("error").is_some_and(|error| !error.is_null()) || parsed["type"] == "error" {
        return Err(format!("模型流式回复失败: {}", stream_error_message(data)));
    }
    let Some(choice) = parsed["choices"]
        .as_array()
        .and_then(|choices| choices.first())
    else {
        return Ok(None);
    };
    let done = choice["finish_reason"]
        .as_str()
        .is_some_and(|reason| !reason.is_empty());
    let delta = &choice["delta"];
    let content = delta["content"].as_str().unwrap_or("").to_string();
    let thinking = delta["reasoning_content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if content.is_empty() && thinking.is_empty() && !done {
        Ok(None)
    } else {
        Ok(Some(AiChunk {
            content,
            thinking,
            done,
        }))
    }
}

#[tauri::command]
pub async fn evaluate_relationship(
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
    messages: Vec<ApiMessage>,
) -> AiResult<RelationshipEvaluation> {
    validate_messages("关系评估上下文", &messages, 512 * 1024)?;
    validate_endpoint(&endpoint)?;
    let api_key = api_key_for_endpoint(&endpoint)?;

    let client = &state.http_client;

    let eval_prompt = "你是一个情感分析专家。分析以下聊天记录，判断两人的亲密关系处于哪个阶段。\
        只返回 JSON：{\"stage\":\"阶段\",\"reason\":\"不超过30字的依据\"}。\
        stage 只能是：刚认识,朋友,暧昧,热恋,老夫老妻。\
        判断标准：刚认识=还很客气生疏；朋友=轻松自然但无浪漫感；暧昧=互有好感有暗示；热恋=主动表达爱意撒娇；老夫老妻=像家人般随意亲密。\
        reason 只能概括聊天中真实出现的互动，不得编造。";

    let mut all_messages: Vec<serde_json::Value> =
        vec![serde_json::json!({"role": "system", "content": eval_prompt})];
    all_messages.extend(
        messages
            .iter()
            .map(|message| serde_json::json!({"role": message.role, "content": message.content})),
    );

    let body = build_chat_body(
        &endpoint,
        &model,
        serde_json::json!(all_messages),
        0.3,
        512,
        false,
    );

    let response = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("关系评估请求失败: {e}"))?;

    let text = response.text().await.map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "关系评估响应缺少有效内容".to_string())?;

    parse_relationship_evaluation(content).map_err(AppError::from)
}

fn parse_relationship_evaluation(content: &str) -> Result<RelationshipEvaluation, String> {
    let trimmed = content.trim();
    let parsed = serde_json::from_str::<RelationshipEvaluation>(trimmed).unwrap_or_else(|_| {
        RelationshipEvaluation {
            stage: trimmed.to_string(),
            reason: "根据近期互动判断".into(),
        }
    });
    if !matches!(
        parsed.stage.as_str(),
        "刚认识" | "朋友" | "暧昧" | "热恋" | "老夫老妻"
    ) {
        return Err("关系评估返回了未知阶段".into());
    }
    Ok(RelationshipEvaluation {
        stage: parsed.stage,
        reason: parsed.reason.trim().chars().take(30).collect(),
    })
}

#[tauri::command]
pub async fn test_ai_connection(
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
) -> AiResult<()> {
    validate_endpoint(&endpoint)?;
    let api_key = api_key_for_endpoint(&endpoint)?;
    let body = build_chat_body(
        &endpoint,
        &model,
        serde_json::json!([{"role": "user", "content": "只回复 OK"}]),
        0.0,
        512,
        false,
    );
    let content = request_text_completion(&state.http_client, &endpoint, &api_key, &body).await?;
    if content.trim().is_empty() {
        Err("模型返回了空响应".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn extract_memories(
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
    messages: Vec<ApiMessage>,
) -> AiResult<Vec<MemoryCandidate>> {
    validate_messages("记忆提取上下文", &messages, 512 * 1024)?;
    validate_endpoint(&endpoint)?;
    let api_key = api_key_for_endpoint(&endpoint)?;
    let source = serde_json::to_string(&messages).map_err(|error| error.to_string())?;
    let prompt = format!(
        "从以下用户消息中提取最多 3 条值得长期记住的信息。\
         只能提取用户明确说出的稳定资料、偏好、重要事件或交流边界；\
         不推断，不记录暂时情绪，不记录助手说的话。\
         仅返回 JSON 数组，每项包含 category、content、sourceMessageId、confidence。\
         category 只能是 profile、preference、event、boundary；confidence 为 0 到 1。\
         没有适合的信息时返回 []。\n消息：{source}"
    );
    let body = build_chat_body(
        &endpoint,
        &model,
        serde_json::json!([{"role": "user", "content": prompt}]),
        0.0,
        1024,
        false,
    );
    let content = request_text_completion(&state.http_client, &endpoint, &api_key, &body).await?;
    parse_memory_candidates(&content).map_err(AppError::from)
}

async fn request_text_completion(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> Result<String, String> {
    let response = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(body)
        .send()
        .await
        .map_err(|error| format!("无法连接模型服务: {error}"))?
        .error_for_status()
        .map_err(|error| format!("模型服务请求失败: {error}"))?;
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("模型响应格式无效: {error}"))?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "模型响应缺少有效内容".to_string())
}

fn parse_memory_candidates(content: &str) -> Result<Vec<MemoryCandidate>, String> {
    let trimmed = content.trim();
    let json = if trimmed.starts_with("```") {
        trimmed
            .strip_prefix("```json")
            .or_else(|| trimmed.strip_prefix("```"))
            .and_then(|value| value.strip_suffix("```"))
            .unwrap_or(trimmed)
            .trim()
    } else {
        trimmed
    };
    let candidates: Vec<MemoryCandidate> = serde_json::from_str(json)
        .map_err(|error| format!("记忆提取响应不是有效 JSON: {error}"))?;
    Ok(candidates
        .into_iter()
        .filter(|candidate| {
            matches!(
                candidate.category.as_str(),
                "profile" | "preference" | "event" | "boundary"
            ) && !candidate.content.trim().is_empty()
                && candidate.content.chars().count() <= 500
                && candidate.confidence.is_finite()
                && (0.0..=1.0).contains(&candidate.confidence)
        })
        .take(3)
        .collect())
}

fn validate_endpoint(endpoint: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "API 端点格式无效".to_string())?;
    let is_local = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "::1" | "[::1]")
    );

    if url.scheme() == "https" || (url.scheme() == "http" && is_local) {
        Ok(())
    } else {
        Err("API 端点必须使用 HTTPS 协议（本地开发地址除外）以确保安全".into())
    }
}

fn validate_text_size(label: &str, value: &str, max_bytes: usize) -> Result<(), String> {
    if value.len() <= max_bytes {
        Ok(())
    } else {
        Err(format!("{label}超过安全大小限制"))
    }
}

fn validate_messages(label: &str, messages: &[ApiMessage], max_bytes: usize) -> Result<(), String> {
    if messages.len() > 200 {
        return Err(format!("{label}包含过多消息"));
    }
    if messages.iter().any(|message| {
        !matches!(message.role.as_str(), "system" | "user" | "assistant")
            || message.content.len() > 256 * 1024
            || message.id.as_ref().is_some_and(|id| id.len() > 128)
    }) {
        return Err(format!("{label}包含无效消息"));
    }
    let size = serde_json::to_vec(messages)
        .map_err(|error| format!("{label}格式无效: {error}"))?
        .len();
    if size > max_bytes {
        Err(format!("{label}超过安全大小限制"))
    } else {
        Ok(())
    }
}

fn is_local_endpoint(endpoint: &str) -> bool {
    reqwest::Url::parse(endpoint)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .is_some_and(|host| matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1" | "[::1]"))
}

fn api_key_for_endpoint(endpoint: &str) -> Result<String, String> {
    if is_local_endpoint(endpoint) {
        return Ok("local".into());
    }
    credentials::load_api_key(endpoint)?.ok_or_else(|| "请先配置 API Key".to_string())
}

#[tauri::command]
pub async fn discover_local_models(
    state: tauri::State<'_, AppState>,
    provider: String,
) -> AiResult<Vec<String>> {
    let (url, list_path) = match provider.as_str() {
        "ollama" => ("http://localhost:11434/api/tags", "models"),
        "lmstudio" => ("http://localhost:1234/v1/models", "data"),
        _ => return Err("未知的本地模型服务".into()),
    };
    let response = state
        .http_client
        .get(url)
        .send()
        .await
        .map_err(|_| {
            format!(
                "未发现正在运行的{}服务",
                if provider == "ollama" {
                    " Ollama "
                } else {
                    " LM Studio "
                }
            )
        })?
        .error_for_status()
        .map_err(|error| format!("本地模型服务响应失败: {error}"))?;
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("本地模型列表格式无效: {error}"))?;
    let models = value[list_path]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            if provider == "ollama" {
                item["name"].as_str()
            } else {
                item["id"].as_str()
            }
        })
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if models.is_empty() {
        Err("服务已连接，但没有可用模型".into())
    } else {
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_chat_body, parse_memory_candidates, parse_relationship_evaluation, parse_stream_line,
        stream_response, validate_endpoint, validate_messages, validate_text_size, AiChunk,
        ApiMessage,
    };
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use tauri::ipc::{Channel, InvokeResponseBody};
    use tokio::sync::watch;

    async fn receive_test_stream(body: &str) -> (Result<(), String>, Vec<serde_json::Value>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test server");
        let endpoint = format!(
            "http://{}/chat",
            listener.local_addr().expect("server address")
        );
        let response_body = body.to_owned();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("accept request");
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .expect("set request timeout");
            let mut request = Vec::new();
            let mut buffer = [0; 1024];
            while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                let size = socket.read(&mut buffer).expect("read request");
                assert!(size > 0);
                request.extend_from_slice(&buffer[..size]);
            }
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(), response_body
            )
            .expect("write event stream");
        });
        let chunks = Arc::new(Mutex::new(Vec::new()));
        let recorded = chunks.clone();
        let channel = Channel::<AiChunk>::new(move |body| {
            let InvokeResponseBody::Json(json) = body else {
                panic!("expected JSON chunk")
            };
            recorded
                .lock()
                .expect("record chunk")
                .push(serde_json::from_str(&json).expect("parse chunk"));
            Ok(())
        });
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let result = stream_response(
            &reqwest::Client::new(),
            &endpoint,
            "test",
            &serde_json::json!({}),
            cancel_rx,
            &channel,
        )
        .await;
        server.join().expect("join event server");
        let events = chunks.lock().expect("read chunks").clone();
        (result, events)
    }

    #[tokio::test]
    async fn rejects_explicit_sse_errors_after_partial_content() {
        let (result, chunks) = receive_test_stream(
            "data: {\"choices\":[{\"delta\":{\"content\":\"半截回复\"}}]}\n\nevent: error\ndata: {\"error\":{\"message\":\"model overloaded\"}}\n\n",
        ).await;
        assert!(result
            .expect_err("reject SSE error")
            .contains("model overloaded"));
        assert_eq!(chunks[0]["content"], "半截回复");
        assert!(chunks.iter().all(|chunk| chunk["done"] == false));
    }

    #[tokio::test]
    async fn rejects_eof_without_a_completion_marker() {
        let (result, chunks) =
            receive_test_stream("data: {\"choices\":[{\"delta\":{\"content\":\"半截回复\"}}]}\n\n")
                .await;
        assert!(result.is_err(), "EOF must not complete a partial response");
        assert!(chunks.iter().all(|chunk| chunk["done"] == false));
    }

    #[tokio::test]
    async fn rejects_error_payloads_without_event_names_and_plain_error_events() {
        for payload in [
            "data: {\"error\":{\"message\":\"provider failed\"}}\n\n",
            "event: error\ndata: provider failed\n\n",
        ] {
            let (result, chunks) = receive_test_stream(payload).await;
            assert!(result
                .expect_err("reject provider error")
                .contains("provider failed"));
            assert!(chunks.is_empty());
        }
    }

    #[tokio::test]
    async fn accepts_done_and_finish_reason_and_keeps_final_content() {
        for ending in [
            "data: [DONE]\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"完成\"},\"finish_reason\":\"stop\"}]}\n\n",
        ] {
            let (result, chunks) = receive_test_stream(&format!(
                "data: {{\"choices\":[{{\"delta\":{{\"content\":\"回复\"}}}}]}}\n\n{ending}",
            )).await;
            result.expect("accept completed stream");
            assert_eq!(chunks.last().expect("completion chunk")["done"], true);
            let content = chunks.iter().filter(|chunk| chunk["done"] == false)
                .map(|chunk| chunk["content"].as_str().expect("content")).collect::<String>();
            assert_eq!(content, if ending.contains("finish_reason") { "回复完成" } else { "回复" });
        }
    }

    #[test]
    fn uses_current_token_parameters_for_new_chat_models() {
        let messages = serde_json::json!([{"role": "user", "content": "你好"}]);
        let openai = build_chat_body(
            "https://api.openai.com/v1/chat/completions",
            "gpt-6-luna",
            messages.clone(),
            0.6,
            1024,
            true,
        );
        assert_eq!(openai["max_completion_tokens"], 1024);
        assert_eq!(openai["reasoning_effort"], "none");
        assert!(openai.get("temperature").is_none());
        assert!(openai.get("max_tokens").is_none());

        let kimi = build_chat_body(
            "https://api.moonshot.cn/v1/chat/completions",
            "kimi-k3",
            messages.clone(),
            0.6,
            1024,
            true,
        );
        assert_eq!(kimi["max_completion_tokens"], 1024);
        assert_eq!(kimi["reasoning_effort"], "low");

        let deepseek = build_chat_body(
            "https://api.deepseek.com/v1/chat/completions",
            "deepseek-flash",
            messages,
            0.6,
            1024,
            true,
        );
        assert_eq!(deepseek["max_tokens"], 1024);
        assert!(deepseek.get("max_completion_tokens").is_none());
    }

    #[test]
    fn accepts_https_and_exact_loopback_hosts() {
        assert!(validate_endpoint("https://api.example.com/v1/chat").is_ok());
        assert!(validate_endpoint("http://localhost:11434/v1/chat").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8080/v1/chat").is_ok());
        assert!(validate_endpoint("http://[::1]:8080/v1/chat").is_ok());
    }

    #[test]
    fn rejects_oversized_ipc_text_inputs() {
        assert!(validate_text_size("消息", "1234", 4).is_ok());
        assert_eq!(
            validate_text_size("消息", "12345", 4).expect_err("oversized"),
            "消息超过安全大小限制"
        );
        assert!(validate_messages(
            "消息",
            &[ApiMessage {
                id: None,
                role: "tool".into(),
                content: "invalid".into(),
            }],
            1_024,
        )
        .is_err());
    }

    #[test]
    fn rejects_insecure_or_lookalike_hosts() {
        assert!(validate_endpoint("http://api.example.com/v1/chat").is_err());
        assert!(validate_endpoint("http://localhost.evil.example/v1/chat").is_err());
        assert!(validate_endpoint("not a url").is_err());
    }

    #[test]
    fn parses_sse_with_or_without_space_after_prefix() {
        let with_space = parse_stream_line(
            r#"data: {"choices":[{"delta":{"content":"你好","reasoning_content":"思考"}}]}"#,
        )
        .expect("valid stream chunk")
        .expect("parse stream chunk");
        let without_space = parse_stream_line(r#"data:{"choices":[{"delta":{"content":"世界"}}]}"#)
            .expect("valid stream chunk")
            .expect("parse stream chunk");

        assert_eq!(with_space.content, "你好");
        assert_eq!(with_space.thinking, "思考");
        assert_eq!(without_space.content, "世界");
    }

    #[test]
    fn parses_done_and_ignores_invalid_events() {
        assert!(
            parse_stream_line("data: [DONE]")
                .expect("valid done")
                .expect("parse done")
                .done
        );
        assert!(parse_stream_line("event: ping")
            .expect("ignore metadata")
            .is_none());
        assert!(parse_stream_line("data: not-json")
            .expect("ignore invalid data")
            .is_none());
    }

    #[test]
    fn parses_and_filters_memory_candidates() {
        let candidates = parse_memory_candidates(
            r#"```json
            [
              {"category":"preference","content":"用户喜欢爵士乐","sourceMessageId":"m1","confidence":0.9},
              {"category":"guess","content":"推断内容","sourceMessageId":"m2","confidence":0.8}
            ]
            ```"#,
        )
        .expect("parse memory candidates");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].content, "用户喜欢爵士乐");
    }

    #[test]
    fn parses_explainable_relationship_evaluations_and_legacy_labels() {
        let evaluation =
            parse_relationship_evaluation(r#"{"stage":"朋友","reason":"开始自然分享日常"}"#)
                .expect("parse evaluation");
        assert_eq!(evaluation.stage, "朋友");
        assert_eq!(evaluation.reason, "开始自然分享日常");

        assert_eq!(
            parse_relationship_evaluation("暧昧")
                .expect("parse legacy label")
                .stage,
            "暧昧"
        );
    }
}
