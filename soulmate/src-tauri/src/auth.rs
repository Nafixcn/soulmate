use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct WeChatUser {
    pub openid: String,
    pub nickname: String,
    pub avatar: String,
}

pub struct AuthServer {
    port: u16,
    shutdown: Arc<AtomicBool>,
}

impl AuthServer {
    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for AuthServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

fn generate_state() -> String {
    use rand::Rng;
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn drain_headers(reader: &mut impl BufRead) {
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
    }
}

pub fn start_auth_server(app: AppHandle) -> Result<AuthServer, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown.clone();
    let valid_states = Arc::new(std::sync::Mutex::new(HashMap::new()));
    let valid_states_clone = valid_states.clone();

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(stream) = stream {
                let app = app.clone();
                let states = valid_states_clone.clone();
                std::thread::spawn(move || handle_request(stream, app, states));
            }
        }
    });

    Ok(AuthServer { port, shutdown: shutdown_clone })
}

fn handle_request(mut stream: TcpStream, app: AppHandle, valid_states: Arc<std::sync::Mutex<HashMap<String, i64>>>) {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).ok();

    let Ok(cloned) = stream.try_clone() else { return };
    let mut reader = BufReader::new(cloned);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let path = parts[1];

    if path.starts_with("/callback") {
        drain_headers(&mut reader);

        let params = if let Some(query) = path.split('?').nth(1) {
            parse_query(query)
        } else {
            HashMap::new()
        };

        let state = params.get("state").cloned().unwrap_or_default();
        if state.is_empty() {
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMissing state parameter");
            return;
        }

        {
            let mut states = valid_states.lock().unwrap();
            if let Some(created_at) = states.remove(&state) {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                if now - created_at > 300 {
                    let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nState expired");
                    return;
                }
            } else {
                let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nInvalid state parameter");
                return;
            }
        }

        let code = params.get("code").cloned().unwrap_or_default();
        if code.is_empty() {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMissing authorization code");
            return;
        }

        let openid = params.get("openid").cloned().unwrap_or_default();
        let nickname = params.get("nickname").cloned().unwrap_or_else(|| "微信用户".into());
        let avatar = params.get("avatar").cloned().unwrap_or_default();

        let user = WeChatUser {
            openid: openid.clone(),
            nickname: nickname.clone(),
            avatar: avatar.clone(),
        };

        let _ = app.emit("auth-success", &user);

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
             <!DOCTYPE html><html><body style=\"text-align:center;padding-top:60px;font-family:sans-serif\">\
             <h2>✅ 登录成功</h2><p>{}，欢迎回来！</p><p style=\"color:#999\">可以关闭本页面了</p>\
             <script>setTimeout(()=>window.close(),2000)</script></body></html>",
            html_escape(&nickname)
        );
        let _ = stream.write_all(response.as_bytes());
    } else if path.starts_with("/auth-url") {
        drain_headers(&mut reader);
        let state = generate_state();
        {
            let mut states = valid_states.lock().unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            states.insert(state.clone(), now);
            states.retain(|_, v| now - *v < 600);
        }
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n{}",
            state
        );
        let _ = stream.write_all(response.as_bytes());
    } else {
        drain_headers(&mut reader);
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    }
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let key = urlencoding::decode(k).unwrap_or_else(|_| k.into()).into_owned();
            let val = urlencoding::decode(v).unwrap_or_else(|_| v.into()).into_owned();
            map.insert(key, val);
        }
    }
    map
}
