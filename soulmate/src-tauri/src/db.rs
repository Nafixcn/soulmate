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
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            timestamp INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);"
    )?;
    Ok(conn)
}

#[tauri::command]
pub fn get_messages(state: State<AppState>, limit: Option<i64>, before: Option<i64>) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let n = limit.unwrap_or(200);

    let msgs = if let Some(before_ts) = before {
        let mut stmt = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages \
             WHERE timestamp < ?1 ORDER BY timestamp DESC LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![before_ts, n], |row| {
            Ok(Message {
                id: row.get(0)?, role: row.get(1)?, content: row.get(2)?,
                thinking: row.get(3)?, timestamp: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut v: Vec<Message> = Vec::new();
        for row in rows { v.push(row.map_err(|e| e.to_string())?); }
        v.reverse();
        v
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages \
             ORDER BY timestamp DESC LIMIT ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![n], |row| {
            Ok(Message {
                id: row.get(0)?, role: row.get(1)?, content: row.get(2)?,
                thinking: row.get(3)?, timestamp: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut v: Vec<Message> = Vec::new();
        for row in rows { v.push(row.map_err(|e| e.to_string())?); }
        v.reverse();
        v
    };
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

#[tauri::command]
pub fn delete_messages_from(state: State<AppState>, from_timestamp: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM messages WHERE timestamp >= ?1",
        rusqlite::params![from_timestamp],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn search_messages(state: State<AppState>, query: String) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, role, content, thinking, timestamp FROM messages WHERE content LIKE ?1 ORDER BY timestamp DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![pattern], |row| {
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
