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
        "https://lite.duckduckgo.com/lite/?q={}",
        urlencoding::encode(&query)
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let html = resp.text().await.map_err(|e| e.to_string())?;

    let results = parse_ddg_lite(&html);
    Ok(results)
}

fn parse_ddg_lite(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut lines = html.lines();

    while let Some(line) = lines.next() {
        if !line.contains("result-link") && !line.contains("result-snippet") {
            continue;
        }

        let url = if line.contains("result-link") {
            line.trim()
                .replace("<td class=\"result-link\"><a rel=\"nofollow\" href=\"", "")
                .split('"')
                .next()
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };

        let title = if let Some(title_line) = lines.next() {
            title_line.trim()
                .replace("<td class=\"result-snippet\">", "")
                .replace("</td>", "")
                .to_string()
        } else {
            String::new()
        };

        if !title.is_empty() && !url.is_empty() && url.starts_with("http") {
            let snippet = if let Some(snippet_line) = lines.next() {
                snippet_line.trim()
                    .replace("<td class=\"result-snippet\">", "")
                    .replace("</td>", "")
                    .to_string()
            } else {
                String::new()
            };

            results.push(SearchResult { title, snippet, url });
            if results.len() >= 5 {
                break;
            }
        }
    }

    results
}
