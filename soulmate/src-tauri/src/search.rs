use crate::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct WikiResponse {
    query: WikiQuery,
}

#[derive(Debug, Deserialize)]
struct WikiQuery {
    search: Vec<WikiPage>,
}

#[derive(Debug, Deserialize)]
struct WikiPage {
    title: String,
    snippet: String,
    #[serde(rename = "pageid")]
    _pageid: u64,
}

#[tauri::command]
pub async fn search_web(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let client = &state.http_client;

    let wiki_url = format!(
        "https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&format=json&srlimit=5&srprop=snippet",
        urlencoding::encode(&query)
    );

    let resp = client
        .get(&wiki_url)
        .header("User-Agent", "SoulMate/2.0 (Desktop App)")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {}", e))?;

    let text = resp.text().await.map_err(|e| e.to_string())?;

    let data: WikiResponse = serde_json::from_str(&text).map_err(|e| format!("解析失败: {}", e))?;

    let results: Vec<SearchResult> = data
        .query
        .search
        .into_iter()
        .map(|page| {
            let clean_snippet = strip_html(&page.snippet);
            let title = page.title;
            let url = format!("https://zh.wikipedia.org/wiki/{}", title);
            SearchResult {
                title,
                snippet: clean_snippet.chars().take(300).collect(),
                url,
            }
        })
        .collect();

    if results.is_empty() {
        Err("未找到相关结果".into())
    } else {
        Ok(results)
    }
}

fn strip_html(s: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
}
