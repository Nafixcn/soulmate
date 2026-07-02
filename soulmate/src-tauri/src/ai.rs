use dashmap::DashMap;
use serde::Serialize;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::AppState;

#[derive(Debug, Serialize, Clone)]
pub struct AiChunk {
    pub content: String,
    pub thinking: String,
    pub done: bool,
}

#[tauri::command]
pub async fn send_message(
    state: tauri::State<'_, AppState>,
    messages_json: String,
    api_key: String,
    endpoint: String,
    model: String,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    request_id: String,
    on_chunk: Channel<AiChunk>,
) -> Result<(), String> {
    if !endpoint.starts_with("https://")
        && !endpoint.starts_with("http://localhost")
        && !endpoint.starts_with("http://127.0.0.1")
    {
        return Err("API 端点必须使用 HTTPS 协议（本地开发地址除外）以确保安全".into());
    }

    let messages: Vec<serde_json::Value> = serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;

    let client = state.http_client.lock().map_err(|e| e.to_string())?.clone();
    let cancelled: Arc<DashMap<String, bool>> = state.cancelled_requests.clone();
    cancelled.insert(request_id.clone(), false);

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.85),
        "max_tokens": max_tokens.unwrap_or(512),
        "stream": true,
    });

    let result = stream_response(&client, &endpoint, &api_key, &body, &request_id, &cancelled, &on_chunk).await;

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
        .map_err(|e| e.to_string())?;

    let mut buf = Vec::with_capacity(4096);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if is_cancelled(cancelled, request_id) {
            let _ = on_chunk.send(AiChunk { content: String::new(), thinking: String::new(), done: true });
            return Ok(());
        }

        buf.extend_from_slice(&chunk);
        while let Some(pos) = find_newline(&buf) {
            let line = String::from_utf8_lossy(&buf[..pos]).trim().to_string();
            buf.drain(..pos + 1);
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                let _ = on_chunk.send(AiChunk { content: String::new(), thinking: String::new(), done: true });
                return Ok(());
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(first) = choices.first() {
                        let delta = &first["delta"];
                        let content = delta["content"].as_str().unwrap_or("").to_string();
                        let thinking = delta["reasoning_content"].as_str().unwrap_or("").to_string();
                        if !content.is_empty() || !thinking.is_empty() {
                            let _ = on_chunk.send(AiChunk { content, thinking, done: false });
                        }
                    }
                }
            }
        }
    }

    let _ = on_chunk.send(AiChunk { content: String::new(), thinking: String::new(), done: true });
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

#[tauri::command]
pub async fn evaluate_relationship(
    state: tauri::State<'_, AppState>,
    api_key: String,
    endpoint: String,
    model: String,
    messages_json: String,
) -> Result<String, String> {
    if !endpoint.starts_with("https://")
        && !endpoint.starts_with("http://localhost")
        && !endpoint.starts_with("http://127.0.0.1")
    {
        return Err("API 端点必须使用 HTTPS 协议（本地开发地址除外）以确保安全".into());
    }

    let client = state.http_client.lock().map_err(|e| e.to_string())?.clone();

    let eval_prompt = "你是一个情感分析专家。分析以下聊天记录，判断两人的亲密关系处于哪个阶段。\
        只回复五个词之一，不要任何其他文字：刚认识,朋友,暧昧,热恋,老夫老妻。\
        判断标准：刚认识=还很客气生疏；朋友=轻松自然但无浪漫感；暧昧=互有好感有暗示；热恋=主动表达爱意撒娇；老夫老妻=像家人般随意亲密。";

    let msgs: Vec<serde_json::Value> = serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;
    let mut all_messages: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": eval_prompt})];
    all_messages.extend(msgs.iter().map(|m| {
        serde_json::json!({"role": m["role"], "content": m["content"]})
    }));

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
        .map_err(|e| e.to_string())?;

    let text = response.text().await.map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    Ok(content)
}
