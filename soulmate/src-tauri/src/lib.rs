mod db;
mod ai;
mod auth;
mod speech;

use std::sync::Mutex;
use tauri::Manager;
use auth::AuthServer;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub auth_server: Mutex<Option<AuthServer>>,
}

#[tauri::command]
fn get_auth_port(state: tauri::State<AppState>) -> Result<u16, String> {
    let guard = state.auth_server.lock().map_err(|e| e.to_string())?;
    guard.as_ref().map(|s| s.port()).ok_or("auth not started".into())
}

#[tauri::command]
fn speech_to_text(audio: Vec<u8>) -> Result<String, String> {
    speech::recognize_speech(audio, "zh-CN")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            std::fs::create_dir_all(&app_dir).ok();
            let conn = db::init_db(&app_dir.join("soulmate.db"))
                .expect("数据库初始化失败");
            let state = AppState {
                db: Mutex::new(conn),
                auth_server: Mutex::new(None),
            };
            app.manage(state);

            let server = auth::start_auth_server(app.handle().clone())
                .expect("认证服务启动失败");
            *app.state::<AppState>().auth_server.lock()
                .expect("认证服务锁获取失败") = Some(server);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::send_message,
            db::get_messages,
            db::save_message,
            db::clear_messages,
            get_auth_port,
            speech_to_text,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
