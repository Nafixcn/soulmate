use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::AppState;

const DEFAULT_PAGE_SIZE: i64 = 200;
const MAX_PAGE_SIZE: i64 = 500;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub timestamp: i64,
}

pub fn init_db(path: &Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

#[tauri::command]
pub fn get_messages(
    state: State<AppState>,
    persona_id: String,
    limit: Option<i64>,
    before: Option<i64>,
) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_messages(&conn, &persona_id, limit, before).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_message(
    state: State<AppState>,
    persona_id: String,
    message: Message,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    save_message_to_db(&conn, &persona_id, &message).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_messages(state: State<AppState>, persona_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM messages WHERE persona_id = ?1",
        rusqlite::params![persona_id],
    )
    .map(|_| ())
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_messages_from(
    state: State<AppState>,
    persona_id: String,
    from_message_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_messages_from_db(&conn, &persona_id, &from_message_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_messages(
    state: State<AppState>,
    persona_id: String,
    query: String,
) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    search_messages_in_db(&conn, &persona_id, &query).map_err(|error| error.to_string())
}

fn initialize_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            persona_id TEXT NOT NULL DEFAULT 'default',
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            timestamp INTEGER NOT NULL
         );",
    )?;

    if !has_column(conn, "messages", "persona_id")? {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN persona_id TEXT NOT NULL DEFAULT 'default'",
            [],
        )?;
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_messages_persona_timestamp
         ON messages(persona_id, timestamp);",
    )
}

fn query_messages(
    conn: &Connection,
    persona_id: &str,
    limit: Option<i64>,
    before: Option<i64>,
) -> rusqlite::Result<Vec<Message>> {
    let page_size = normalize_page_size(limit);
    let mut messages = if let Some(before_timestamp) = before {
        let mut statement = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages
             WHERE persona_id = ?1 AND timestamp < ?2
             ORDER BY timestamp DESC, rowid DESC LIMIT ?3",
        )?;
        let rows = statement.query_map(
            rusqlite::params![persona_id, before_timestamp, page_size],
            map_message,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        let mut statement = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages
             WHERE persona_id = ?1 ORDER BY timestamp DESC, rowid DESC LIMIT ?2",
        )?;
        let rows = statement.query_map(rusqlite::params![persona_id, page_size], map_message)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    messages.reverse();
    Ok(messages)
}

fn save_message_to_db(
    conn: &Connection,
    persona_id: &str,
    message: &Message,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO messages (id, persona_id, role, content, thinking, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            message.id,
            persona_id,
            message.role,
            message.content,
            message.thinking,
            message.timestamp
        ],
    )?;
    Ok(())
}

fn delete_messages_from_db(
    conn: &Connection,
    persona_id: &str,
    from_message_id: &str,
) -> rusqlite::Result<()> {
    let target = conn
        .query_row(
            "SELECT timestamp, rowid FROM messages WHERE persona_id = ?1 AND id = ?2",
            rusqlite::params![persona_id, from_message_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?;

    let Some((timestamp, row_id)) = target else {
        return Ok(());
    };

    conn.execute(
        "DELETE FROM messages
         WHERE persona_id = ?1
           AND (timestamp > ?2 OR (timestamp = ?2 AND rowid >= ?3))",
        rusqlite::params![persona_id, timestamp, row_id],
    )?;
    Ok(())
}

fn search_messages_in_db(
    conn: &Connection,
    persona_id: &str,
    query: &str,
) -> rusqlite::Result<Vec<Message>> {
    let pattern = format!("%{}%", escape_like_pattern(query));
    let mut statement = conn.prepare(
        "SELECT id, role, content, thinking, timestamp FROM messages
         WHERE persona_id = ?1 AND content LIKE ?2 ESCAPE '\\'
         ORDER BY timestamp DESC, rowid DESC LIMIT 50",
    )?;
    let rows = statement.query_map(rusqlite::params![persona_id, pattern], map_message)?;
    rows.collect()
}

fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = statement.query_map([], |row| row.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn normalize_page_size(limit: Option<i64>) -> i64 {
    limit.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE)
}

fn escape_like_pattern(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn map_message(row: &Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        role: row.get(1)?,
        content: row.get(2)?,
        thinking: row.get(3)?,
        timestamp: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        initialize_schema(&conn).expect("initialize schema");
        conn
    }

    fn message(id: &str, content: &str, timestamp: i64) -> Message {
        Message {
            id: id.into(),
            role: "user".into(),
            content: content.into(),
            thinking: None,
            timestamp,
        }
    }

    #[test]
    fn returns_latest_page_in_chronological_order() {
        let conn = test_connection();
        for timestamp in 1..=4 {
            save_message_to_db(
                &conn,
                "persona-a",
                &message(&timestamp.to_string(), "message", timestamp),
            )
            .expect("save message");
        }

        let latest =
            query_messages(&conn, "persona-a", Some(2), None).expect("load latest messages");
        let earlier =
            query_messages(&conn, "persona-a", Some(2), Some(3)).expect("load earlier messages");

        assert_eq!(
            latest.iter().map(|item| item.timestamp).collect::<Vec<_>>(),
            vec![3, 4]
        );
        assert_eq!(
            earlier
                .iter()
                .map(|item| item.timestamp)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );
    }

    #[test]
    fn clamps_invalid_page_sizes() {
        assert_eq!(normalize_page_size(Some(-1)), 1);
        assert_eq!(normalize_page_size(Some(0)), 1);
        assert_eq!(normalize_page_size(Some(9999)), MAX_PAGE_SIZE);
        assert_eq!(normalize_page_size(None), DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn deletes_selected_message_and_everything_after_it() {
        let conn = test_connection();
        let first = message("first", "message", 1);
        let same_time_before = message("same-time-before", "message", 2);
        let target = message("target", "message", 2);
        let same_time_after = message("same-time-after", "message", 2);
        let later = message("later", "message", 3);
        for item in [&first, &same_time_before, &target, &same_time_after, &later] {
            save_message_to_db(&conn, "persona-a", item).expect("save message");
        }

        delete_messages_from_db(&conn, "persona-a", "target").expect("delete messages");

        assert_eq!(
            query_messages(&conn, "persona-a", None, None).expect("load messages"),
            vec![first, same_time_before]
        );
    }

    #[test]
    fn treats_search_wildcards_as_literal_text() {
        let conn = test_connection();
        save_message_to_db(&conn, "persona-a", &message("percent", "完成 100%", 1))
            .expect("save message");
        save_message_to_db(&conn, "persona-a", &message("plain", "普通内容", 2))
            .expect("save message");

        let results = search_messages_in_db(&conn, "persona-a", "%").expect("search messages");

        assert_eq!(results, vec![message("percent", "完成 100%", 1)]);
    }

    #[test]
    fn keeps_persona_conversations_isolated() {
        let conn = test_connection();
        save_message_to_db(&conn, "persona-a", &message("a", "甲的消息", 1)).expect("save message");
        save_message_to_db(&conn, "persona-b", &message("b", "乙的消息", 2)).expect("save message");

        assert_eq!(
            query_messages(&conn, "persona-a", None, None).expect("load messages"),
            vec![message("a", "甲的消息", 1)]
        );
        assert_eq!(
            search_messages_in_db(&conn, "persona-b", "消息").expect("search messages"),
            vec![message("b", "乙的消息", 2)]
        );
    }

    #[test]
    fn migrates_existing_messages_to_the_legacy_persona() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                timestamp INTEGER NOT NULL
             );
             INSERT INTO messages (id, role, content, timestamp)
             VALUES ('legacy', 'user', '旧消息', 1);",
        )
        .expect("create legacy schema");

        initialize_schema(&conn).expect("migrate schema");

        assert_eq!(
            query_messages(&conn, "default", None, None).expect("load migrated messages"),
            vec![message("legacy", "旧消息", 1)]
        );
    }
}
