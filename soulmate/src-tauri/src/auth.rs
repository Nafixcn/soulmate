use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::net::TcpStream;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct WeChatUser {
    pub openid: String,
    pub nickname: String,
    pub avatar: String,
}

pub struct AuthServer {
    port: u16,
}

impl AuthServer {
    pub fn port(&self) -> u16 {
        self.port
    }
}

pub fn start_auth_server(app: AppHandle) -> Result<AuthServer, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let app = app.clone();
                std::thread::spawn(move || handle_request(stream, app));
            }
        }
    });

    Ok(AuthServer { port })
}

fn handle_request(mut stream: TcpStream, app: AppHandle) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
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
        let params = if let Some(query) = path.split('?').nth(1) {
            parse_query(query)
        } else {
            std::collections::HashMap::new()
        };

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
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
             <!DOCTYPE html><html><body style=\"text-align:center;padding-top:60px;font-family:sans-serif\">\
             <h2>✅ 登录成功</h2><p>{}，欢迎回来！</p><p style=\"color:#999\">可以关闭本页面了</p>\
             <script>setTimeout(()=>window.close(),2000)</script></body></html>",
            nickname
        );
        let _ = stream.write_all(response.as_bytes());
    } else {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\n\r\n");
    }
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let key = urlencoding::decode(k).unwrap_or_else(|_| k.into()).into_owned();
            let val = urlencoding::decode(v).unwrap_or_else(|_| v.into()).into_owned();
            map.insert(key, val);
        }
    }
    map
}
