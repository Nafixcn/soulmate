mod db;
mod ai;
mod auth;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_dir).ok();
            let conn = db::init_db(&app_dir.join("soulmate.db")).map_err(|e| e.to_string()).unwrap();
            let state = AppState {
                db: Mutex::new(conn),
                auth_server: Mutex::new(None),
            };
            app.manage(state);

            let server = auth::start_auth_server(app.handle().clone())
                .map_err(|e| e.to_string()).unwrap();
            *app.state::<AppState>().auth_server.lock().unwrap() = Some(server);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::send_message,
            db::get_messages,
            db::clear_messages,
            get_auth_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
