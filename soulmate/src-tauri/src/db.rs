use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub timestamp: i64,
}

pub fn init_db(path: &Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );"
    )?;
    Ok(conn)
}

#[tauri::command]
pub fn get_messages(state: State<AppState>) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, role, content, thinking, timestamp FROM messages ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Message {
            id: row.get(0)?,
            role: row.get(1)?,
            content: row.get(2)?,
            thinking: row.get(3)?,
            timestamp: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut msgs = Vec::new();
    for row in rows {
        msgs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(msgs)
}

#[tauri::command]
pub fn save_message(state: State<AppState>, message: Message) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, role, content, thinking, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![message.id, message.role, message.content, message.thinking, message.timestamp],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_messages(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
    Ok(())
}
