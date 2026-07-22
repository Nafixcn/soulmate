use dashmap::DashMap;
use serde::Serialize;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::{credentials, AppState};

#[derive(Debug, Serialize, Clone)]
pub struct AiChunk {
    pub content: String,
    pub thinking: String,
    pub done: bool,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    state: tauri::State<'_, AppState>,
    messages_json: String,
    endpoint: String,
    model: String,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    request_id: String,
    on_chunk: Channel<AiChunk>,
) -> Result<(), String> {
    validate_endpoint(&endpoint)?;
    let api_key = credentials::load_api_key()?.ok_or_else(|| "请先配置 API Key".to_string())?;

    let messages: Vec<serde_json::Value> =
        serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;

    let client = &state.http_client;
    let cancelled: Arc<DashMap<String, bool>> = state.cancelled_requests.clone();
    cancelled.insert(request_id.clone(), false);

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.85),
        "max_tokens": max_tokens.unwrap_or(512),
        "stream": true,
    });

    let result = stream_response(
        client,
        &endpoint,
        &api_key,
        &body,
        &request_id,
        &cancelled,
        &on_chunk,
    )
    .await;

    cancelled.remove(&request_id);
    result
}

async fn stream_response(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &serde_json::Value,
    request_id: &str,
    cancelled: &Arc<DashMap<String, bool>>,
    on_chunk: &Channel<AiChunk>,
) -> Result<(), String> {
    let mut response = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("API 请求失败: {e}"))?;

    let mut buf = Vec::with_capacity(4096);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if is_cancelled(cancelled, request_id) {
            let _ = on_chunk.send(AiChunk {
                content: String::new(),
                thinking: String::new(),
                done: true,
            });
            return Ok(());
        }

        buf.extend_from_slice(&chunk);
        while let Some(pos) = find_newline(&buf) {
            let line = String::from_utf8_lossy(&buf[..pos]).to_string();
            buf.drain(..pos + 1);
            if send_stream_line(&line, on_chunk) {
                return Ok(());
            }
        }
    }

    if !buf.is_empty() {
        let line = String::from_utf8_lossy(&buf);
        if send_stream_line(&line, on_chunk) {
            return Ok(());
        }
    }

    let _ = on_chunk.send(AiChunk {
        content: String::new(),
        thinking: String::new(),
        done: true,
    });
    Ok(())
}

fn is_cancelled(cancelled: &Arc<DashMap<String, bool>>, request_id: &str) -> bool {
    cancelled.get(request_id).map(|v| *v).unwrap_or(true)
}

#[tauri::command]
pub fn cancel_request(state: tauri::State<'_, AppState>, request_id: String) -> Result<(), String> {
    state.cancelled_requests.insert(request_id, true);
    Ok(())
}

fn find_newline(buf: &[u8]) -> Option<usize> {
    buf.iter().position(|&b| b == b'\n')
}

fn send_stream_line(line: &str, on_chunk: &Channel<AiChunk>) -> bool {
    let Some(chunk) = parse_stream_line(line) else {
        return false;
    };
    let done = chunk.done;
    let _ = on_chunk.send(chunk);
    done
}

fn parse_stream_line(line: &str) -> Option<AiChunk> {
    let data = line.trim().strip_prefix("data:")?.trim_start();
    if data == "[DONE]" {
        return Some(AiChunk {
            content: String::new(),
            thinking: String::new(),
            done: true,
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(data).ok()?;
    let delta = parsed["choices"].as_array()?.first()?.get("delta")?;
    let content = delta["content"].as_str().unwrap_or("").to_string();
    let thinking = delta["reasoning_content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if content.is_empty() && thinking.is_empty() {
        None
    } else {
        Some(AiChunk {
            content,
            thinking,
            done: false,
        })
    }
}

#[tauri::command]
pub async fn evaluate_relationship(
    state: tauri::State<'_, AppState>,
    endpoint: String,
    model: String,
    messages_json: String,
) -> Result<String, String> {
    validate_endpoint(&endpoint)?;
    let api_key = credentials::load_api_key()?.ok_or_else(|| "请先配置 API Key".to_string())?;

    let client = &state.http_client;

    let eval_prompt = "你是一个情感分析专家。分析以下聊天记录，判断两人的亲密关系处于哪个阶段。\
        只回复五个词之一，不要任何其他文字：刚认识,朋友,暧昧,热恋,老夫老妻。\
        判断标准：刚认识=还很客气生疏；朋友=轻松自然但无浪漫感；暧昧=互有好感有暗示；热恋=主动表达爱意撒娇；老夫老妻=像家人般随意亲密。";

    let msgs: Vec<serde_json::Value> =
        serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;
    let mut all_messages: Vec<serde_json::Value> =
        vec![serde_json::json!({"role": "system", "content": eval_prompt})];
    all_messages.extend(
        msgs.iter()
            .map(|m| serde_json::json!({"role": m["role"], "content": m["content"]})),
    );

    let body = serde_json::json!({
        "model": model,
        "messages": all_messages,
        "temperature": 0.3,
        "max_tokens": 20,
        "stream": false,
    });

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

    Ok(content.to_string())
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

#[cfg(test)]
mod tests {
    use super::{parse_stream_line, validate_endpoint};

    #[test]
    fn accepts_https_and_exact_loopback_hosts() {
        assert!(validate_endpoint("https://api.example.com/v1/chat").is_ok());
        assert!(validate_endpoint("http://localhost:11434/v1/chat").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8080/v1/chat").is_ok());
        assert!(validate_endpoint("http://[::1]:8080/v1/chat").is_ok());
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
        .expect("parse stream chunk");
        let without_space = parse_stream_line(r#"data:{"choices":[{"delta":{"content":"世界"}}]}"#)
            .expect("parse stream chunk");

        assert_eq!(with_space.content, "你好");
        assert_eq!(with_space.thinking, "思考");
        assert_eq!(without_space.content, "世界");
    }

    #[test]
    fn parses_done_and_ignores_invalid_events() {
        assert!(parse_stream_line("data: [DONE]").expect("parse done").done);
        assert!(parse_stream_line("event: ping").is_none());
        assert!(parse_stream_line("data: not-json").is_none());
    }
}
