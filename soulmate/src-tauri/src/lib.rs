#![allow(unexpected_cfgs)]

mod ai;
mod credentials;
mod db;
mod search;

use dashmap::DashMap;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub http_client: reqwest::Client,
    pub cancelled_requests: std::sync::Arc<DashMap<String, bool>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
            std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
            let conn = db::init_db(&app_dir.join("soulmate.db")).expect("数据库初始化失败");

            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .connect_timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("HTTP 客户端初始化失败");

            let state = AppState {
                db: Mutex::new(conn),
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
            credentials::has_api_key,
            credentials::save_api_key,
            db::get_messages,
            db::get_messages_from,
            db::get_all_messages,
            db::save_message,
            db::clear_messages,
            db::delete_messages_from,
            db::search_messages,
            db::get_settings,
            db::save_settings,
            db::delete_persona,
            search::search_web,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
