#![allow(unexpected_cfgs)]

mod db;
mod ai;
mod auth;
mod search;
// mod speech; — disabled: ObjC FFI causes SIGBUS on macOS 26

use std::sync::Mutex;
use dashmap::DashMap;
use tauri::Manager;
use auth::AuthServer;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub auth_server: Mutex<Option<AuthServer>>,
    pub http_client: reqwest::Client,
    pub cancelled_requests: std::sync::Arc<DashMap<String, bool>>,
}

#[tauri::command]
fn get_auth_port(state: tauri::State<AppState>) -> Result<u16, String> {
    let guard = state.auth_server.lock().map_err(|e| e.to_string())?;
    guard.as_ref().map(|s| s.port()).ok_or("auth not started".into())
}

#[tauri::command]
fn start_auth_server(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<u16, String> {
    let mut guard = state.auth_server.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(guard.as_ref().unwrap().port());
    }
    let server = auth::start_auth_server(app).map_err(|e| e.to_string())?;
    let port = server.port();
    *guard = Some(server);
    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
            let conn = db::init_db(&app_dir.join("soulmate.db"))
                .expect("数据库初始化失败");

            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .connect_timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("HTTP 客户端初始化失败");

            let state = AppState {
                db: Mutex::new(conn),
                auth_server: Mutex::new(None),
                http_client,
                cancelled_requests: std::sync::Arc::new(DashMap::new()),
            };
            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::send_message,
            ai::cancel_request,
            ai::evaluate_relationship,
            db::get_messages,
            db::save_message,
            db::clear_messages,
            db::delete_messages_from,
            db::search_messages,
            get_auth_port,
            start_auth_server,
            search::search_web,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
