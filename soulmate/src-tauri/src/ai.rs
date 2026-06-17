use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Debug, Serialize, Clone)]
pub struct AiChunk {
    pub content: String,
    pub thinking: String,
    pub done: bool,
}

#[tauri::command]
pub async fn send_message(
    messages_json: String,
    api_key: String,
    endpoint: String,
    model: String,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    on_chunk: Channel<AiChunk>,
) -> Result<(), String> {
    let messages: Vec<serde_json::Value> = serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
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

    let mut buf = String::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                let _ = on_chunk.send(AiChunk { content: String::new(), thinking: String::new(), done: true });
                return Ok(());
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                let delta = &parsed["choices"][0]["delta"];
                let content = delta["content"].as_str().unwrap_or("").to_string();
                let thinking = delta["reasoning_content"].as_str().unwrap_or("").to_string();
                if !content.is_empty() || !thinking.is_empty() {
                    let _ = on_chunk.send(AiChunk { content, thinking, done: false });
                }
            }
        }
    }

    let _ = on_chunk.send(AiChunk { content: String::new(), thinking: String::new(), done: true });
    Ok(())
}
