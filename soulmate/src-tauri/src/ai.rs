use serde::Serialize;
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
    on_chunk: Channel<AiChunk>,
) -> Result<(), String> {
    if !endpoint.starts_with("https://") {
        return Err("API 端点必须使用 HTTPS 协议以确保安全".into());
    }

    let messages: Vec<serde_json::Value> = serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;

    let client = state.http_client.lock().map_err(|e| e.to_string())?.clone();

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.85),
        "max_tokens": max_tokens.unwrap_or(512),
        "stream": true,
    });

    let mut response = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut buf = Vec::with_capacity(4096);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
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

fn find_newline(buf: &[u8]) -> Option<usize> {
    buf.iter().position(|&b| b == b'\n')
}
