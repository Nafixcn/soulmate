use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::AppState;

const DEFAULT_PAGE_SIZE: i64 = 200;
const MAX_PAGE_SIZE: i64 = 500;
const SETTINGS_ID: i64 = 1;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    pub messages: Vec<Message>,
    pub has_more: bool,
    pub user_message_count: i64,
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
    before_id: Option<String>,
) -> Result<MessagePage, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_message_page(&conn, &persona_id, limit, before_id.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_messages_from(
    state: State<AppState>,
    persona_id: String,
    message_id: String,
) -> Result<MessagePage, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_messages_from(&conn, &persona_id, &message_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_all_messages(
    state: State<AppState>,
    persona_id: String,
) -> Result<Vec<Message>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_all_messages(&conn, &persona_id).map_err(|error| error.to_string())
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
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_messages_from_db(&conn, &persona_id, &from_message_id)
        .and_then(|()| count_user_messages(&conn, &persona_id))
        .map_err(|error| error.to_string())
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

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_settings_json(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings_json: String) -> Result<(), String> {
    validate_settings_json(&settings_json)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    save_settings_json(&conn, &settings_json).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_persona(
    state: State<AppState>,
    persona_id: String,
    settings_json: String,
) -> Result<(), String> {
    validate_settings_json(&settings_json)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_persona_with_settings(&mut conn, &persona_id, &settings_json)
        .map_err(|error| error.to_string())
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
         );
         CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
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
         ON messages(persona_id, timestamp);
         PRAGMA user_version = 2;",
    )
}

fn query_message_page(
    conn: &Connection,
    persona_id: &str,
    limit: Option<i64>,
    before_id: Option<&str>,
) -> rusqlite::Result<MessagePage> {
    let page_size = normalize_page_size(limit);
    let query_limit = page_size + 1;
    let mut messages = if let Some(message_id) = before_id {
        let target = message_position(conn, persona_id, message_id)?;
        let Some((timestamp, row_id)) = target else {
            return Ok(MessagePage {
                messages: Vec::new(),
                has_more: false,
                user_message_count: count_user_messages(conn, persona_id)?,
            });
        };
        let mut statement = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages
             WHERE persona_id = ?1
               AND (timestamp < ?2 OR (timestamp = ?2 AND rowid < ?3))
             ORDER BY timestamp DESC, rowid DESC LIMIT ?4",
        )?;
        let rows = statement.query_map(
            rusqlite::params![persona_id, timestamp, row_id, query_limit],
            map_message,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        let mut statement = conn.prepare(
            "SELECT id, role, content, thinking, timestamp FROM messages
             WHERE persona_id = ?1 ORDER BY timestamp DESC, rowid DESC LIMIT ?2",
        )?;
        let rows = statement.query_map(rusqlite::params![persona_id, query_limit], map_message)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let has_more = messages.len() as i64 > page_size;
    messages.truncate(page_size as usize);
    messages.reverse();

    Ok(MessagePage {
        messages,
        has_more,
        user_message_count: count_user_messages(conn, persona_id)?,
    })
}

fn query_messages_from(
    conn: &Connection,
    persona_id: &str,
    message_id: &str,
) -> rusqlite::Result<MessagePage> {
    let Some((timestamp, row_id)) = message_position(conn, persona_id, message_id)? else {
        return Ok(MessagePage {
            messages: Vec::new(),
            has_more: false,
            user_message_count: count_user_messages(conn, persona_id)?,
        });
    };

    let mut statement = conn.prepare(
        "SELECT id, role, content, thinking, timestamp FROM messages
         WHERE persona_id = ?1
           AND (timestamp > ?2 OR (timestamp = ?2 AND rowid >= ?3))
         ORDER BY timestamp ASC, rowid ASC",
    )?;
    let rows = statement.query_map(
        rusqlite::params![persona_id, timestamp, row_id],
        map_message,
    )?;

    Ok(MessagePage {
        messages: rows.collect::<rusqlite::Result<Vec<_>>>()?,
        has_more: has_messages_before(conn, persona_id, timestamp, row_id)?,
        user_message_count: count_user_messages(conn, persona_id)?,
    })
}

fn query_all_messages(conn: &Connection, persona_id: &str) -> rusqlite::Result<Vec<Message>> {
    let mut statement = conn.prepare(
        "SELECT id, role, content, thinking, timestamp FROM messages
         WHERE persona_id = ?1 ORDER BY timestamp ASC, rowid ASC",
    )?;
    let rows = statement.query_map([persona_id], map_message)?;
    rows.collect()
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
    let target = message_position(conn, persona_id, from_message_id)?;
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

fn message_position(
    conn: &Connection,
    persona_id: &str,
    message_id: &str,
) -> rusqlite::Result<Option<(i64, i64)>> {
    conn.query_row(
        "SELECT timestamp, rowid FROM messages WHERE persona_id = ?1 AND id = ?2",
        rusqlite::params![persona_id, message_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

fn has_messages_before(
    conn: &Connection,
    persona_id: &str,
    timestamp: i64,
    row_id: i64,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM messages
            WHERE persona_id = ?1
              AND (timestamp < ?2 OR (timestamp = ?2 AND rowid < ?3))
         )",
        rusqlite::params![persona_id, timestamp, row_id],
        |row| row.get(0),
    )
}

fn count_user_messages(conn: &Connection, persona_id: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE persona_id = ?1 AND role = 'user'",
        [persona_id],
        |row| row.get(0),
    )
}

fn load_settings_json(conn: &Connection) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT json FROM app_settings WHERE id = ?1",
        [SETTINGS_ID],
        |row| row.get(0),
    )
    .optional()
}

fn save_settings_json(conn: &Connection, settings_json: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_settings (id, json, updated_at) VALUES (?1, ?2, unixepoch())
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        rusqlite::params![SETTINGS_ID, settings_json],
    )?;
    Ok(())
}

fn delete_persona_with_settings(
    conn: &mut Connection,
    persona_id: &str,
    settings_json: &str,
) -> rusqlite::Result<()> {
    let transaction = conn.transaction()?;
    transaction.execute("DELETE FROM messages WHERE persona_id = ?1", [persona_id])?;
    save_settings_json(&transaction, settings_json)?;
    transaction.commit()
}

fn validate_settings_json(settings_json: &str) -> Result<(), String> {
    let value: serde_json::Value =
        serde_json::from_str(settings_json).map_err(|error| format!("设置格式无效: {error}"))?;
    if !value.is_object() {
        return Err("设置必须是 JSON 对象".into());
    }
    Ok(())
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
            query_message_page(&conn, "persona-a", Some(2), None).expect("load latest messages");
        let earlier = query_message_page(&conn, "persona-a", Some(2), Some("3"))
            .expect("load earlier messages");

        assert_eq!(
            latest
                .messages
                .iter()
                .map(|item| item.timestamp)
                .collect::<Vec<_>>(),
            vec![3, 4]
        );
        assert!(latest.has_more);
        assert_eq!(
            earlier.messages,
            vec![message("1", "message", 1), message("2", "message", 2)]
        );
        assert!(!earlier.has_more);
        assert_eq!(latest.user_message_count, 4);
    }

    #[test]
    fn paginates_messages_with_identical_timestamps_without_skipping() {
        let conn = test_connection();
        for id in 1..=4 {
            save_message_to_db(&conn, "persona-a", &message(&id.to_string(), "message", 10))
                .expect("save message");
        }

        let latest = query_message_page(&conn, "persona-a", Some(2), None).expect("latest");
        let earlier = query_message_page(
            &conn,
            "persona-a",
            Some(2),
            latest.messages.first().map(|item| item.id.as_str()),
        )
        .expect("earlier");

        assert_eq!(
            latest
                .messages
                .iter()
                .map(|item| &item.id)
                .collect::<Vec<_>>(),
            vec!["3", "4"]
        );
        assert_eq!(
            earlier
                .messages
                .iter()
                .map(|item| &item.id)
                .collect::<Vec<_>>(),
            vec!["1", "2"]
        );
    }

    #[test]
    fn loads_messages_from_a_search_result_to_the_latest_message() {
        let conn = test_connection();
        for timestamp in 1..=4 {
            save_message_to_db(
                &conn,
                "persona-a",
                &message(&timestamp.to_string(), "message", timestamp),
            )
            .expect("save message");
        }

        let page = query_messages_from(&conn, "persona-a", "2").expect("load context");

        assert_eq!(
            page.messages
                .iter()
                .map(|item| &item.id)
                .collect::<Vec<_>>(),
            vec!["2", "3", "4"]
        );
        assert!(page.has_more);
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
            query_all_messages(&conn, "persona-a").expect("load messages"),
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
            query_all_messages(&conn, "persona-a").expect("load messages"),
            vec![message("a", "甲的消息", 1)]
        );
        assert_eq!(
            search_messages_in_db(&conn, "persona-b", "消息").expect("search messages"),
            vec![message("b", "乙的消息", 2)]
        );
    }

    #[test]
    fn stores_settings_and_deletes_persona_data_atomically() {
        let mut conn = test_connection();
        save_settings_json(&conn, r#"{"personas":["a","b"]}"#).expect("save settings");
        save_message_to_db(&conn, "persona-a", &message("a", "甲的消息", 1)).expect("save message");

        delete_persona_with_settings(&mut conn, "persona-a", r#"{"personas":["b"]}"#)
            .expect("delete persona");

        assert!(query_all_messages(&conn, "persona-a")
            .expect("load messages")
            .is_empty());
        assert_eq!(
            load_settings_json(&conn).expect("load settings"),
            Some(r#"{"personas":["b"]}"#.into())
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
            query_all_messages(&conn, "default").expect("load migrated messages"),
            vec![message("legacy", "旧消息", 1)]
        );
    }
}
