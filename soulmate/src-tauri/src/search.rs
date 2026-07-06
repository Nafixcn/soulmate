use crate::AppState;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub url: String,
}

#[tauri::command]
pub async fn search_web(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let client = &state.http_client;
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(&query)
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {}", e))?;

    let html = resp.text().await.map_err(|e| e.to_string())?;

    parse_ddg_html(&html)
}

fn parse_ddg_html(html: &str) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();

    let chunks: Vec<&str> = html.split("result__body").collect();
    if chunks.len() < 2 {
        return Ok(results);
    }

    for chunk in chunks.iter().skip(1) {
        if results.len() >= 5 {
            break;
        }

        let title = extract_between(chunk, "result__a", "</a>")
            .unwrap_or_default()
            .split('>')
            .last()
            .unwrap_or("")
            .trim()
            .to_string();

        let url = extract_between(chunk, "result__url", "</a>")
            .unwrap_or_default()
            .split('>')
            .last()
            .unwrap_or("")
            .trim()
            .to_string();

        let snippet = extract_between(chunk, "result__snippet", "</a>")
            .unwrap_or_else(|| {
                extract_between(chunk, "</span>", "</div>").unwrap_or("")
            })
            .split('>')
            .last()
            .unwrap_or("")
            .trim()
            .to_string();

        if !title.is_empty() && title.len() < 200 {
            let clean_url = if url.starts_with("http") {
                url.to_string()
            } else {
                String::new()
            };
            results.push(SearchResult {
                title,
                snippet: snippet.chars().take(300).collect(),
                url: clean_url,
            });
        }
    }

    if results.is_empty() {
        Err("未找到搜索结果".into())
    } else {
        Ok(results)
    }
}

fn extract_between<'a>(source: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_idx = source.find(start)? + start.len();
    let end_idx = source[start_idx..].find(end)? + start_idx;
    Some(&source[start_idx..end_idx])
}
