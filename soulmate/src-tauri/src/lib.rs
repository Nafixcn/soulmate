#![allow(unexpected_cfgs)]

mod ai;
mod app_error;
mod credentials;
mod db;
mod search;

use dashmap::DashMap;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub startup_warning: Mutex<Option<db::StartupWarning>>,
    pub http_client: reqwest::Client,
    pub cancelled_requests: std::sync::Arc<DashMap<String, tokio::sync::watch::Sender<bool>>>,
    pub app_lock_throttle: Mutex<credentials::AppLockThrottle>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("无法获取应用数据目录: {error}"))?;
            std::fs::create_dir_all(&app_dir)
                .map_err(|error| format!("创建数据目录失败: {error}"))?;
            let (conn, startup_warning) =
                db::init_db_with_recovery(&app_dir.join("soulmate.db"))
                    .map_err(|error| format!("数据库初始化及恢复失败: {error}"))?;

            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .connect_timeout(std::time::Duration::from_secs(15))
                .build()
                .map_err(|error| format!("HTTP 客户端初始化失败: {error}"))?;

            let state = AppState {
                db: Mutex::new(conn),
                startup_warning: Mutex::new(startup_warning),
                http_client,
                cancelled_requests: std::sync::Arc::new(DashMap::new()),
                app_lock_throttle: Mutex::new(credentials::AppLockThrottle::default()),
            };
            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::send_message,
            ai::cancel_request,
            ai::evaluate_relationship,
            ai::test_ai_connection,
            ai::extract_memories,
            ai::discover_local_models,
            credentials::has_api_key,
            credentials::save_api_key,
            credentials::has_app_lock,
            credentials::set_app_lock,
            credentials::verify_app_lock,
            db::get_messages,
            db::get_messages_from,
            db::get_all_messages,
            db::save_message,
            db::save_message_if_source_exists,
            db::clear_messages,
            db::delete_messages_from,
            db::search_messages,
            db::list_memories,
            db::get_memory_snapshot,
            db::apply_extracted_memories,
            db::upsert_memory,
            db::delete_memory,
            db::set_memory_pinned,
            db::take_startup_warning,
            db::get_settings,
            db::save_settings,
            db::delete_persona,
            db::export_database_backup,
            db::import_database_backup,
            search::search_web,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("应用启动失败: {error}"));
}
