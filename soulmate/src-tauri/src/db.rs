use rusqlite::{Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use crate::AppState;

const DEFAULT_PAGE_SIZE: i64 = 200;
const MAX_PAGE_SIZE: i64 = 500;
const SETTINGS_ID: i64 = 1;
const SCHEMA_VERSION: i64 = 7;
const BACKUP_FORMAT_VERSION: u32 = 4;
const MAX_BACKUP_BYTES: usize = 64 * 1024 * 1024;
const MAX_SETTINGS_BYTES: usize = 4 * 1024 * 1024;
const MAX_MESSAGE_CONTENT_BYTES: usize = 256 * 1024;
const MAX_PERSONA_ID_BYTES: usize = 128;
const MAX_SEARCH_QUERY_BYTES: usize = 1_024;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssistantAlternative {
    pub content: String,
    pub thinking: Option<String>,
    #[serde(default)]
    pub memory_references: Vec<MemoryReference>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReference {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub timestamp: i64,
    #[serde(default)]
    pub alternatives: Vec<AssistantAlternative>,
    #[serde(default)]
    pub active_alternative: usize,
    #[serde(default)]
    pub memory_references: Vec<MemoryReference>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Memory {
    pub id: String,
    pub persona_id: String,
    pub category: String,
    pub content: String,
    pub source_message_id: Option<String>,
    pub confidence: f64,
    pub pinned: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub memories: Vec<Memory>,
    pub revision: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    pub messages: Vec<Message>,
    pub has_more: bool,
    pub user_message_count: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupWarning {
    pub code: String,
    pub message: String,
    pub isolated_database_path: String,
    pub occurred_at: i64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableBackup {
    format_version: u32,
    exported_at: i64,
    settings: Option<serde_json::Value>,
    messages: Vec<BackupMessage>,
    #[serde(default)]
    memories: Vec<Memory>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupMessage {
    persona_id: String,
    id: String,
    role: String,
    content: String,
    thinking: Option<String>,
    timestamp: i64,
    #[serde(default)]
    alternatives: Vec<AssistantAlternative>,
    #[serde(default)]
    active_alternative: usize,
    #[serde(default)]
    memory_references: Vec<MemoryReference>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportSummary {
    pub message_count: usize,
    pub memory_count: usize,
    pub persona_count: usize,
    pub has_settings: bool,
}

pub fn init_db(path: &Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

pub fn init_db_with_recovery(
    path: &Path,
) -> Result<(Connection, Option<StartupWarning>), Box<dyn std::error::Error>> {
    if let Some(version) = readable_schema_version(path) {
        if version > SCHEMA_VERSION {
            return Err(std::io::Error::other(format!(
                "数据库版本 {version} 高于当前应用支持的版本 {SCHEMA_VERSION}，请使用更新版本的应用"
            ))
            .into());
        }
    }

    match init_db(path) {
        Ok(conn) => Ok((conn, None)),
        Err(original_error) => {
            if !original_error
                .downcast_ref::<rusqlite::Error>()
                .and_then(rusqlite::Error::sqlite_error_code)
                .is_some_and(|code| {
                    matches!(
                        code,
                        rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
                    )
                })
            {
                return Err(original_error);
            }
            let isolated_path = isolate_database(path)?;
            let conn = init_db(path).map_err(|recovery_error| {
                std::io::Error::other(format!(
                    "数据库恢复失败（原错误: {original_error}; 重建错误: {recovery_error}）"
                ))
            })?;
            let occurred_at = unix_timestamp();
            Ok((
                conn,
                Some(StartupWarning {
                    code: "databaseRecovered".into(),
                    message: format!(
                        "数据库初始化失败，已隔离原数据库并创建新数据库。原错误: {original_error}"
                    ),
                    isolated_database_path: isolated_path.to_string_lossy().into_owned(),
                    occurred_at,
                }),
            ))
        }
    }
}

#[tauri::command]
pub fn get_messages(
    state: State<AppState>,
    persona_id: String,
    limit: Option<i64>,
    before_id: Option<String>,
) -> Result<MessagePage, String> {
    validate_identifier("角色标识", &persona_id)?;
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
    validate_identifier("角色标识", &persona_id)?;
    validate_identifier("消息标识", &message_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_messages_from(&conn, &persona_id, &message_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_all_messages(
    state: State<AppState>,
    persona_id: String,
) -> Result<Vec<Message>, String> {
    validate_identifier("角色标识", &persona_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_all_messages(&conn, &persona_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_message(
    state: State<AppState>,
    persona_id: String,
    message: Message,
) -> Result<(), String> {
    validate_identifier("角色标识", &persona_id)?;
    validate_message_input(&message)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    save_message_to_db(&conn, &persona_id, &message).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_message_if_source_exists(
    state: State<AppState>,
    persona_id: String,
    source_message_id: String,
    message: Message,
) -> Result<bool, String> {
    validate_identifier("角色标识", &persona_id)?;
    validate_identifier("来源消息标识", &source_message_id)?;
    validate_message_input(&message)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    save_message_if_source_exists_to_db(&mut conn, &persona_id, &source_message_id, &message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_messages(state: State<AppState>, persona_id: String) -> Result<(), String> {
    validate_identifier("角色标识", &persona_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    clear_messages_in_db(&conn, &persona_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_messages_from(
    state: State<AppState>,
    persona_id: String,
    from_message_id: String,
) -> Result<i64, String> {
    validate_identifier("角色标识", &persona_id)?;
    validate_identifier("消息标识", &from_message_id)?;
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
    validate_identifier("角色标识", &persona_id)?;
    if query.len() > MAX_SEARCH_QUERY_BYTES {
        return Err("搜索内容超过安全大小限制".into());
    }
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    search_messages_in_db(&conn, &persona_id, &query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_memories(state: State<AppState>, persona_id: String) -> Result<Vec<Memory>, String> {
    validate_identifier("角色标识", &persona_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    query_memories(&conn, &persona_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_memory_snapshot(
    state: State<AppState>,
    persona_id: String,
) -> Result<MemorySnapshot, String> {
    validate_identifier("角色标识", &persona_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    get_memory_snapshot_from_db(&conn, &persona_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_extracted_memories(
    state: State<AppState>,
    persona_id: String,
    expected_revision: i64,
    memories: Vec<Memory>,
) -> Result<Vec<Memory>, String> {
    validate_identifier("角色标识", &persona_id)?;
    if expected_revision < 0 || memories.len() > 100 {
        return Err("记忆快照或批量大小无效".into());
    }
    for memory in &memories {
        validate_memory(memory)?;
        if memory.persona_id != persona_id {
            return Err("记忆所属角色与快照不符".into());
        }
    }
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    apply_extracted_memories_to_db(&mut conn, &persona_id, expected_revision, &memories)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_memory(state: State<AppState>, memory: Memory) -> Result<Memory, String> {
    validate_memory(&memory)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    upsert_memory_to_db(&conn, &memory).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_memory(
    state: State<AppState>,
    persona_id: String,
    memory_id: String,
) -> Result<(), String> {
    validate_identifier("角色标识", &persona_id)?;
    validate_identifier("记忆标识", &memory_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_memory_from_db(&conn, &persona_id, &memory_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_memory_pinned(
    state: State<AppState>,
    persona_id: String,
    memory_id: String,
    pinned: bool,
) -> Result<(), String> {
    validate_identifier("角色标识", &persona_id)?;
    validate_identifier("记忆标识", &memory_id)?;
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    set_memory_pinned_in_db(&conn, &persona_id, &memory_id, pinned)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn take_startup_warning(state: State<AppState>) -> Result<Option<StartupWarning>, String> {
    state
        .startup_warning
        .lock()
        .map_err(|error| error.to_string())
        .map(|mut warning| warning.take())
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
    validate_identifier("角色标识", &persona_id)?;
    validate_settings_json(&settings_json)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_persona_with_settings(&mut conn, &persona_id, &settings_json)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_database_backup(state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    export_backup_json(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_database_backup(
    state: State<AppState>,
    backup_json: String,
) -> Result<BackupImportSummary, String> {
    let backup = parse_and_validate_backup(&backup_json)?;
    let mut conn = state.db.lock().map_err(|error| error.to_string())?;
    import_backup(&mut conn, &backup).map_err(|error| error.to_string())
}

fn initialize_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let had_fts_index = has_table(conn, "messages_fts")?;

    let transaction = conn.unchecked_transaction()?;
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            persona_id TEXT NOT NULL DEFAULT 'default',
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            timestamp INTEGER NOT NULL,
            alternatives_json TEXT NOT NULL DEFAULT '[]',
            active_alternative INTEGER NOT NULL DEFAULT 0,
            memory_references_json TEXT NOT NULL DEFAULT '[]'
         );
         CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            persona_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('profile', 'preference', 'event', 'boundary')),
            content TEXT NOT NULL,
            source_message_id TEXT,
            confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
            pinned INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS memory_revisions (
            persona_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0
         );
         CREATE TRIGGER IF NOT EXISTS memories_revision_insert AFTER INSERT ON memories BEGIN
            INSERT INTO memory_revisions(persona_id, revision) VALUES (new.persona_id, 1)
            ON CONFLICT(persona_id) DO UPDATE SET revision = revision + 1;
         END;
         CREATE TRIGGER IF NOT EXISTS memories_revision_update AFTER UPDATE ON memories BEGIN
            INSERT INTO memory_revisions(persona_id, revision) VALUES (old.persona_id, 1)
            ON CONFLICT(persona_id) DO UPDATE SET revision = revision + 1;
         END;
         CREATE TRIGGER IF NOT EXISTS memories_revision_delete AFTER DELETE ON memories BEGIN
            INSERT INTO memory_revisions(persona_id, revision) VALUES (old.persona_id, 1)
            ON CONFLICT(persona_id) DO UPDATE SET revision = revision + 1;
         END;",
    )?;

    if !has_column(&transaction, "messages", "persona_id")? {
        transaction.execute(
            "ALTER TABLE messages ADD COLUMN persona_id TEXT NOT NULL DEFAULT 'default'",
            [],
        )?;
    }
    if !has_column(&transaction, "messages", "alternatives_json")? {
        transaction.execute(
            "ALTER TABLE messages ADD COLUMN alternatives_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    if !has_column(&transaction, "messages", "active_alternative")? {
        transaction.execute(
            "ALTER TABLE messages ADD COLUMN active_alternative INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    if !has_column(&transaction, "messages", "memory_references_json")? {
        transaction.execute(
            "ALTER TABLE messages ADD COLUMN memory_references_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    if !has_column(&transaction, "memories", "enabled")? {
        transaction.execute(
            "ALTER TABLE memories ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }

    transaction.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_messages_persona_timestamp
         ON messages(persona_id, timestamp);
         CREATE INDEX IF NOT EXISTS idx_memories_persona_updated
         ON memories(persona_id, pinned DESC, updated_at DESC);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_persona_content
         ON memories(persona_id, content);
         CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            content='messages',
            content_rowid='rowid',
            tokenize='trigram'
         );
         CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
         END;
         CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content)
            VALUES ('delete', old.rowid, old.content);
         END;
         CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content)
            VALUES ('delete', old.rowid, old.content);
            INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
         END;",
    )?;

    if version < SCHEMA_VERSION || !had_fts_index {
        transaction.execute(
            "INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')",
            [],
        )?;
        transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }

    transaction.commit()
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
            "SELECT id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json FROM messages
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
            "SELECT id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json FROM messages
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
        "SELECT id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json FROM messages
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
        "SELECT id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json FROM messages
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
        "INSERT INTO messages (id, persona_id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            persona_id = excluded.persona_id,
            role = excluded.role,
            content = excluded.content,
            thinking = excluded.thinking,
            timestamp = excluded.timestamp,
            alternatives_json = excluded.alternatives_json,
            active_alternative = excluded.active_alternative,
            memory_references_json = excluded.memory_references_json",
        rusqlite::params![
            message.id,
            persona_id,
            message.role,
            message.content,
            message.thinking,
            message.timestamp,
            serde_json::to_string(&message.alternatives).unwrap_or_else(|_| "[]".into()),
            message.active_alternative as i64,
            serde_json::to_string(&message.memory_references).unwrap_or_else(|_| "[]".into())
        ],
    )?;
    Ok(())
}

fn save_message_if_source_exists_to_db(
    conn: &mut Connection,
    persona_id: &str,
    source_message_id: &str,
    message: &Message,
) -> rusqlite::Result<bool> {
    let transaction = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    if message_position(&transaction, persona_id, source_message_id)?.is_none() {
        return Ok(false);
    }
    save_message_to_db(&transaction, persona_id, message)?;
    transaction.commit()?;
    Ok(true)
}

fn delete_messages_from_db(
    conn: &Connection,
    persona_id: &str,
    from_message_id: &str,
) -> rusqlite::Result<()> {
    let transaction = conn.unchecked_transaction()?;
    invalidate_memory_snapshot(&transaction, persona_id)?;
    let target = message_position(&transaction, persona_id, from_message_id)?;
    let Some((timestamp, row_id)) = target else {
        return transaction.commit();
    };

    transaction.execute(
        "DELETE FROM messages
         WHERE persona_id = ?1
           AND (timestamp > ?2 OR (timestamp = ?2 AND rowid >= ?3))",
        rusqlite::params![persona_id, timestamp, row_id],
    )?;
    transaction.commit()
}

fn clear_messages_in_db(conn: &Connection, persona_id: &str) -> rusqlite::Result<()> {
    let transaction = conn.unchecked_transaction()?;
    invalidate_memory_snapshot(&transaction, persona_id)?;
    transaction.execute("DELETE FROM messages WHERE persona_id = ?1", [persona_id])?;
    transaction.commit()
}

fn search_messages_in_db(
    conn: &Connection,
    persona_id: &str,
    query: &str,
) -> rusqlite::Result<Vec<Message>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    if query.chars().count() >= 3 {
        let fts_query = format!("\"{}\"", query.replace('"', "\"\""));
        let mut statement = conn.prepare(
            "SELECT m.id, m.role, m.content, m.thinking, m.timestamp, m.alternatives_json, m.active_alternative, m.memory_references_json
             FROM messages_fts
             JOIN messages AS m ON m.rowid = messages_fts.rowid
             WHERE messages_fts MATCH ?1 AND m.persona_id = ?2
             ORDER BY m.timestamp DESC, m.rowid DESC LIMIT 50",
        )?;
        let rows = statement.query_map(rusqlite::params![fts_query, persona_id], map_message)?;
        return rows.collect();
    }

    let pattern = format!("%{}%", escape_like_pattern(query));
    let mut statement = conn.prepare(
        "SELECT id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json FROM messages
         WHERE persona_id = ?1 AND content LIKE ?2 ESCAPE '\\'
         ORDER BY timestamp DESC, rowid DESC LIMIT 50",
    )?;
    let rows = statement.query_map(rusqlite::params![persona_id, pattern], map_message)?;
    rows.collect()
}

fn query_memories(conn: &Connection, persona_id: &str) -> rusqlite::Result<Vec<Memory>> {
    let mut statement = conn.prepare(
        "SELECT id, persona_id, category, content, source_message_id, confidence,
                pinned, created_at, updated_at, enabled
         FROM memories WHERE persona_id = ?1
         ORDER BY pinned DESC, updated_at DESC, rowid DESC",
    )?;
    let rows = statement.query_map([persona_id], map_memory)?;
    rows.collect()
}

fn invalidate_memory_snapshot(conn: &Connection, persona_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO memory_revisions(persona_id, revision) VALUES (?1, 1)
         ON CONFLICT(persona_id) DO UPDATE SET revision = revision + 1",
        [persona_id],
    )?;
    Ok(())
}

fn get_memory_snapshot_from_db(
    conn: &Connection,
    persona_id: &str,
) -> rusqlite::Result<MemorySnapshot> {
    let transaction = conn.unchecked_transaction()?;
    // Register even an empty persona, so clearing/importing invalidates pending work.
    transaction.execute(
        "INSERT OR IGNORE INTO memory_revisions(persona_id, revision) VALUES (?1, 0)",
        [persona_id],
    )?;
    let snapshot = MemorySnapshot {
        memories: query_memories(&transaction, persona_id)?,
        revision: transaction.query_row(
            "SELECT revision FROM memory_revisions WHERE persona_id = ?1",
            [persona_id],
            |row| row.get(0),
        )?,
    };
    transaction.commit()?;
    Ok(snapshot)
}

fn apply_extracted_memories_to_db(
    conn: &mut Connection,
    persona_id: &str,
    expected_revision: i64,
    memories: &[Memory],
) -> rusqlite::Result<Vec<Memory>> {
    let transaction = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let revision: Option<i64> = transaction
        .query_row(
            "SELECT revision FROM memory_revisions WHERE persona_id = ?1",
            [persona_id],
            |row| row.get(0),
        )
        .optional()?;
    if revision != Some(expected_revision) {
        return Ok(Vec::new());
    }
    let saved = memories
        .iter()
        .map(|memory| upsert_memory_to_db(&transaction, memory))
        .collect::<rusqlite::Result<Vec<_>>>()?;
    transaction.commit()?;
    Ok(saved)
}

fn delete_memory_from_db(
    conn: &Connection,
    persona_id: &str,
    memory_id: &str,
) -> rusqlite::Result<()> {
    let transaction = conn.unchecked_transaction()?;
    invalidate_memory_snapshot(&transaction, persona_id)?;
    transaction.execute(
        "DELETE FROM memories WHERE persona_id = ?1 AND id = ?2",
        rusqlite::params![persona_id, memory_id],
    )?;
    transaction.commit()
}

fn set_memory_pinned_in_db(
    conn: &Connection,
    persona_id: &str,
    memory_id: &str,
    pinned: bool,
) -> rusqlite::Result<()> {
    let transaction = conn.unchecked_transaction()?;
    invalidate_memory_snapshot(&transaction, persona_id)?;
    transaction.execute(
        "UPDATE memories SET pinned = ?3, updated_at = ?4
         WHERE persona_id = ?1 AND id = ?2",
        rusqlite::params![persona_id, memory_id, pinned, unix_timestamp_millis()],
    )?;
    transaction.commit()
}

fn upsert_memory_to_db(conn: &Connection, memory: &Memory) -> rusqlite::Result<Memory> {
    conn.execute(
        "INSERT INTO memories (
            id, persona_id, category, content, source_message_id, confidence,
            pinned, created_at, updated_at, enabled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            content = excluded.content,
            source_message_id = excluded.source_message_id,
            confidence = excluded.confidence,
            pinned = excluded.pinned,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at
         WHERE memories.persona_id = excluded.persona_id
         ON CONFLICT(persona_id, content) DO UPDATE SET
            category = excluded.category,
            source_message_id = COALESCE(excluded.source_message_id, memories.source_message_id),
            confidence = MAX(memories.confidence, excluded.confidence),
            updated_at = excluded.updated_at",
        rusqlite::params![
            memory.id,
            memory.persona_id,
            memory.category,
            memory.content,
            memory.source_message_id,
            memory.confidence,
            memory.pinned,
            memory.created_at,
            memory.updated_at,
            memory.enabled
        ],
    )?;
    conn.query_row(
        "SELECT id, persona_id, category, content, source_message_id, confidence,
                pinned, created_at, updated_at, enabled
         FROM memories WHERE persona_id = ?1 AND content = ?2",
        rusqlite::params![memory.persona_id, memory.content],
        map_memory,
    )
}

fn validate_memory(memory: &Memory) -> Result<(), String> {
    if memory.id.trim().is_empty() || memory.persona_id.trim().is_empty() {
        return Err("记忆 id 和 personaId 不能为空".into());
    }
    if memory.content.trim().is_empty() || memory.content.chars().count() > 500 {
        return Err("记忆内容必须为 1-500 个字符".into());
    }
    if !matches!(
        memory.category.as_str(),
        "profile" | "preference" | "event" | "boundary"
    ) {
        return Err("记忆类别无效".into());
    }
    if !memory.confidence.is_finite() || !(0.0..=1.0).contains(&memory.confidence) {
        return Err("记忆可信度必须在 0 到 1 之间".into());
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if value.len() > MAX_PERSONA_ID_BYTES {
        return Err(format!("{label}超过安全大小限制"));
    }
    Ok(())
}

fn validate_message_input(message: &Message) -> Result<(), String> {
    validate_identifier("消息标识", &message.id)?;
    if !matches!(message.role.as_str(), "user" | "assistant") {
        return Err("消息角色无效".into());
    }
    if message.content.len() > MAX_MESSAGE_CONTENT_BYTES
        || message
            .thinking
            .as_ref()
            .is_some_and(|thinking| thinking.len() > MAX_MESSAGE_CONTENT_BYTES)
    {
        return Err("消息内容超过安全大小限制".into());
    }
    if message.alternatives.len() > 32
        || message.alternatives.iter().any(|alternative| {
            alternative.content.len() > MAX_MESSAGE_CONTENT_BYTES
                || alternative
                    .thinking
                    .as_ref()
                    .is_some_and(|thinking| thinking.len() > MAX_MESSAGE_CONTENT_BYTES)
                || !valid_memory_references(&alternative.memory_references)
        })
        || !valid_memory_references(&message.memory_references)
    {
        return Err("回复候选超过安全大小限制".into());
    }
    Ok(())
}

fn valid_memory_references(references: &[MemoryReference]) -> bool {
    references.len() <= 6
        && references.iter().all(|reference| {
            !reference.id.trim().is_empty()
                && reference.id.len() <= MAX_PERSONA_ID_BYTES
                && reference.content.chars().count() <= 500
        })
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
    invalidate_memory_snapshot(&transaction, persona_id)?;
    transaction.execute("DELETE FROM messages WHERE persona_id = ?1", [persona_id])?;
    transaction.execute("DELETE FROM memories WHERE persona_id = ?1", [persona_id])?;
    save_settings_json(&transaction, settings_json)?;
    transaction.commit()
}

fn validate_settings_json(settings_json: &str) -> Result<(), String> {
    if settings_json.len() > MAX_SETTINGS_BYTES {
        return Err("设置内容超过安全大小限制".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(settings_json).map_err(|error| format!("设置格式无效: {error}"))?;
    if !value.is_object() {
        return Err("设置必须是 JSON 对象".into());
    }
    Ok(())
}

fn export_backup_json(conn: &Connection) -> Result<String, Box<dyn std::error::Error>> {
    let settings = load_settings_json(conn)?
        .map(|json| serde_json::from_str::<serde_json::Value>(&json))
        .transpose()?
        .map(strip_legacy_api_key);
    let mut statement = conn.prepare(
        "SELECT persona_id, id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json
         FROM messages ORDER BY persona_id ASC, timestamp ASC, rowid ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(BackupMessage {
            persona_id: row.get(0)?,
            id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            thinking: row.get(4)?,
            timestamp: row.get(5)?,
            alternatives: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            active_alternative: row.get::<_, i64>(7)?.max(0) as usize,
            memory_references: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default(),
        })
    })?;
    let messages = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut memories = Vec::new();
    let mut memory_statement = conn.prepare(
        "SELECT id, persona_id, category, content, source_message_id, confidence,
                pinned, created_at, updated_at, enabled
         FROM memories ORDER BY persona_id ASC, updated_at ASC, rowid ASC",
    )?;
    let memory_rows = memory_statement.query_map([], map_memory)?;
    for memory in memory_rows {
        memories.push(memory?);
    }
    let backup = PortableBackup {
        format_version: BACKUP_FORMAT_VERSION,
        exported_at: unix_timestamp(),
        settings,
        messages,
        memories,
    };
    Ok(serde_json::to_string_pretty(&backup)?)
}

fn parse_and_validate_backup(backup_json: &str) -> Result<PortableBackup, String> {
    if backup_json.len() > MAX_BACKUP_BYTES {
        return Err(format!(
            "备份文件过大，最大支持 {} MiB",
            MAX_BACKUP_BYTES / 1024 / 1024
        ));
    }

    let mut backup: PortableBackup =
        serde_json::from_str(backup_json).map_err(|error| format!("备份格式无效: {error}"))?;
    if !matches!(backup.format_version, 1 | 2 | 3 | BACKUP_FORMAT_VERSION) {
        return Err(format!(
            "不支持的备份版本: {}，当前支持版本: {}",
            backup.format_version, BACKUP_FORMAT_VERSION
        ));
    }
    if let Some(settings) = &backup.settings {
        if !settings.is_object() {
            return Err("备份中的 settings 必须是 JSON 对象".into());
        }
    }
    backup.settings = backup.settings.map(strip_legacy_api_key);

    let mut ids = HashSet::with_capacity(backup.messages.len());
    for message in &backup.messages {
        if message.id.trim().is_empty() {
            return Err("备份消息的 id 不能为空".into());
        }
        if message.persona_id.trim().is_empty() {
            return Err(format!("消息 {} 的 personaId 不能为空", message.id));
        }
        if !matches!(message.role.as_str(), "user" | "assistant") {
            return Err(format!(
                "消息 {} 的 role 必须是 user 或 assistant",
                message.id
            ));
        }
        if !ids.insert(message.id.as_str()) {
            return Err(format!("备份包含重复消息 id: {}", message.id));
        }
    }

    let mut memory_ids = HashSet::with_capacity(backup.memories.len());
    for memory in &backup.memories {
        validate_memory(memory)?;
        if !memory_ids.insert(memory.id.as_str()) {
            return Err(format!("备份包含重复记忆 id: {}", memory.id));
        }
    }

    Ok(backup)
}

fn strip_legacy_api_key(mut settings: serde_json::Value) -> serde_json::Value {
    if let Some(ai_settings) = settings
        .as_object_mut()
        .and_then(|root| root.get_mut("aiSettings"))
        .and_then(serde_json::Value::as_object_mut)
    {
        ai_settings.remove("apiKey");
    }
    settings
}

fn import_backup(
    conn: &mut Connection,
    backup: &PortableBackup,
) -> rusqlite::Result<BackupImportSummary> {
    let transaction = conn.transaction()?;
    replace_database_contents(&transaction, backup)?;
    transaction.commit()?;

    Ok(BackupImportSummary {
        message_count: backup.messages.len(),
        memory_count: backup.memories.len(),
        persona_count: backup
            .messages
            .iter()
            .map(|message| message.persona_id.as_str())
            .collect::<HashSet<_>>()
            .len(),
        has_settings: backup.settings.is_some(),
    })
}

fn replace_database_contents(
    transaction: &Transaction<'_>,
    backup: &PortableBackup,
) -> rusqlite::Result<()> {
    // Keep revision tombstones outside the portable format and invalidate every
    // registered snapshot, including personas with no stored rows.
    transaction.execute("UPDATE memory_revisions SET revision = revision + 1", [])?;
    transaction.execute("DELETE FROM messages", [])?;
    transaction.execute("DELETE FROM memories", [])?;
    transaction.execute("DELETE FROM app_settings", [])?;

    if let Some(settings) = &backup.settings {
        let settings_json = serde_json::to_string(settings)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        save_settings_json(transaction, &settings_json)?;
    }

    let mut statement = transaction.prepare(
        "INSERT INTO messages (id, persona_id, role, content, thinking, timestamp, alternatives_json, active_alternative, memory_references_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;
    for message in &backup.messages {
        statement.execute(rusqlite::params![
            message.id,
            message.persona_id,
            message.role,
            message.content,
            message.thinking,
            message.timestamp,
            serde_json::to_string(&message.alternatives).unwrap_or_else(|_| "[]".into()),
            message.active_alternative as i64,
            serde_json::to_string(&message.memory_references).unwrap_or_else(|_| "[]".into())
        ])?;
    }
    drop(statement);

    for memory in &backup.memories {
        upsert_memory_to_db(transaction, memory)?;
    }
    Ok(())
}

fn isolate_database(path: &Path) -> std::io::Result<PathBuf> {
    let recovered_path = available_recovery_path(path);
    if path.exists() {
        fs::rename(path, &recovered_path)?;
    }

    for suffix in ["-wal", "-shm"] {
        let source = PathBuf::from(format!("{}{suffix}", path.to_string_lossy()));
        if source.exists() {
            let destination =
                PathBuf::from(format!("{}{suffix}", recovered_path.to_string_lossy()));
            fs::rename(source, destination)?;
        }
    }
    Ok(recovered_path)
}

fn available_recovery_path(path: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let base = PathBuf::from(format!("{}.recovered-{timestamp}", path.to_string_lossy()));
    if !base.exists() {
        return base;
    }

    for suffix in 1.. {
        let candidate = PathBuf::from(format!("{}.{}", base.to_string_lossy(), suffix));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn readable_schema_version(path: &Path) -> Option<i64> {
    if !path.exists() {
        return None;
    }
    let conn =
        Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .ok()
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn unix_timestamp_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
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

fn has_table(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = ?1
         )",
        [table],
        |row| row.get(0),
    )
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
        alternatives: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
        active_alternative: row.get::<_, i64>(6)?.max(0) as usize,
        memory_references: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
    })
}

fn map_memory(row: &Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        persona_id: row.get(1)?,
        category: row.get(2)?,
        content: row.get(3)?,
        source_message_id: row.get(4)?,
        confidence: row.get(5)?,
        pinned: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        enabled: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process;

    #[test]
    fn rejects_oversized_ipc_storage_inputs() {
        assert!(validate_settings_json("{}").is_ok());
        assert!(validate_settings_json(&"x".repeat(MAX_SETTINGS_BYTES + 1)).is_err());

        let oversized = Message {
            id: "message-1".into(),
            role: "user".into(),
            content: "x".repeat(MAX_MESSAGE_CONTENT_BYTES + 1),
            thinking: None,
            timestamp: 1,
            alternatives: Vec::new(),
            active_alternative: 0,
            memory_references: Vec::new(),
        };
        assert!(validate_message_input(&oversized).is_err());
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path =
                std::env::temp_dir().join(format!("soulmate-db-{name}-{}-{unique}", process::id()));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

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
            alternatives: Vec::new(),
            active_alternative: 0,
            memory_references: Vec::new(),
        }
    }

    #[test]
    fn persists_reply_alternatives_and_the_selected_version() {
        let conn = test_connection();
        let mut reply = message("reply", "第二个回答", 1);
        reply.role = "assistant".into();
        reply.alternatives = vec![
            AssistantAlternative {
                content: "第一个回答".into(),
                thinking: None,
                memory_references: Vec::new(),
            },
            AssistantAlternative {
                content: "第二个回答".into(),
                thinking: Some("思考".into()),
                memory_references: Vec::new(),
            },
        ];
        reply.active_alternative = 1;

        save_message_to_db(&conn, "persona-a", &reply).expect("save alternatives");
        let loaded = query_all_messages(&conn, "persona-a").expect("load alternatives");

        assert_eq!(loaded, vec![reply]);
    }

    #[test]
    fn conditional_message_save_preserves_a_notification_with_an_existing_source() {
        let mut conn = test_connection();
        let source = message("source", "评估上下文", 1);
        let mut notification = message("notification", "关系升级", 2);
        notification.role = "assistant".into();
        save_message_to_db(&conn, "persona-a", &source).expect("save source");

        assert!(save_message_if_source_exists_to_db(
            &mut conn,
            "persona-a",
            "source",
            &notification
        )
        .expect("conditionally save notification"));
        assert_eq!(
            query_all_messages(&conn, "persona-a").expect("read messages"),
            vec![source, notification]
        );
    }

    #[test]
    fn conditional_message_save_rejects_notifications_after_clear_or_source_deletion() {
        for clear in [false, true] {
            let mut conn = test_connection();
            save_message_to_db(&conn, "persona-a", &message("source", "评估上下文", 1))
                .expect("save source");
            if clear {
                clear_messages_in_db(&conn, "persona-a").expect("clear conversation");
            } else {
                delete_messages_from_db(&conn, "persona-a", "source").expect("delete source");
            }

            assert!(!save_message_if_source_exists_to_db(
                &mut conn,
                "persona-a",
                "source",
                &message("late", "旧评估通知", 2)
            )
            .expect("reject late notification"));
            assert!(query_all_messages(&conn, "persona-a")
                .expect("read messages")
                .is_empty());
        }
    }

    #[test]
    fn conditional_message_save_requires_the_source_to_belong_to_the_same_persona() {
        let mut conn = test_connection();
        save_message_to_db(
            &conn,
            "persona-b",
            &message("source", "另一个角色的上下文", 1),
        )
        .expect("save other source");
        assert!(!save_message_if_source_exists_to_db(
            &mut conn,
            "persona-a",
            "source",
            &message("late", "不匹配的通知", 2)
        )
        .expect("reject mismatched source"));
        assert!(query_all_messages(&conn, "persona-a")
            .expect("read own messages")
            .is_empty());
    }

    fn memory(id: &str, persona_id: &str, content: &str, timestamp: i64) -> Memory {
        Memory {
            id: id.into(),
            persona_id: persona_id.into(),
            category: "preference".into(),
            content: content.into(),
            source_message_id: Some("source".into()),
            confidence: 0.8,
            pinned: false,
            enabled: true,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn stores_deduplicates_and_lists_persona_memories() {
        let conn = test_connection();
        let first = upsert_memory_to_db(&conn, &memory("m1", "persona-a", "用户喜欢爵士乐", 1))
            .expect("save first memory");
        let mut duplicate = memory("m2", "persona-a", "用户喜欢爵士乐", 2);
        duplicate.confidence = 0.95;
        duplicate.pinned = true;
        let updated = upsert_memory_to_db(&conn, &duplicate).expect("update duplicate memory");
        upsert_memory_to_db(&conn, &memory("m3", "persona-b", "其他角色记忆", 3))
            .expect("save other persona memory");

        assert_eq!(first.id, "m1");
        assert_eq!(updated.id, "m1");
        assert_eq!(updated.confidence, 0.95);
        assert_eq!(
            query_memories(&conn, "persona-a").expect("list memories"),
            vec![updated]
        );
    }

    #[test]
    fn edits_and_disables_a_memory_without_changing_its_identity() {
        let conn = test_connection();
        let original = memory("m1", "persona-a", "用户喜欢爵士乐", 1);
        upsert_memory_to_db(&conn, &original).expect("save memory");
        let mut corrected = original.clone();
        corrected.content = "用户喜欢古典音乐".into();
        corrected.enabled = false;
        corrected.updated_at = 2;

        let saved = upsert_memory_to_db(&conn, &corrected).expect("correct memory");

        assert_eq!(saved, corrected);
        assert_eq!(
            query_memories(&conn, "persona-a").expect("list memories"),
            vec![corrected]
        );
    }

    #[test]
    fn commits_extracted_memories_once_and_rejects_a_replayed_snapshot() {
        let mut conn = test_connection();
        let snapshot =
            get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot empty persona");
        assert!(snapshot.memories.is_empty());
        let proposed = vec![
            memory("m1", "persona-a", "用户喜欢爵士乐", 1),
            memory("m2", "persona-a", "用户喜欢咖啡", 2),
        ];
        assert_eq!(
            apply_extracted_memories_to_db(&mut conn, "persona-a", snapshot.revision, &proposed)
                .expect("commit batch"),
            proposed
        );
        assert!(apply_extracted_memories_to_db(
            &mut conn,
            "persona-a",
            snapshot.revision,
            &[memory("late", "persona-a", "晚到提取", 3)]
        )
        .expect("reject replay")
        .is_empty());
        assert_eq!(
            query_memories(&conn, "persona-a")
                .expect("list batch")
                .len(),
            2
        );
    }

    #[test]
    fn refuses_extracted_memory_after_a_manual_correction_or_disable() {
        for disable in [false, true] {
            let mut conn = test_connection();
            let original = memory("m1", "persona-a", "用户喜欢爵士乐", 1);
            upsert_memory_to_db(&conn, &original).expect("save original");
            let snapshot = get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot");
            let mut corrected = original.clone();
            if disable {
                corrected.enabled = false;
            } else {
                corrected.content = "用户喜欢古典乐".into();
            }
            corrected.updated_at = 2;
            upsert_memory_to_db(&conn, &corrected).expect("manual change");

            assert!(apply_extracted_memories_to_db(
                &mut conn,
                "persona-a",
                snapshot.revision,
                &[original]
            )
            .expect("reject stale batch")
            .is_empty());
            assert_eq!(
                query_memories(&conn, "persona-a").expect("list preserved memory"),
                vec![corrected]
            );
        }
    }

    #[test]
    fn refuses_extracted_memory_after_manual_delete_or_pin() {
        for delete in [false, true] {
            let mut conn = test_connection();
            let original = memory("m1", "persona-a", "用户喜欢爵士乐", 1);
            upsert_memory_to_db(&conn, &original).expect("save original");
            let snapshot = get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot");
            if delete {
                delete_memory_from_db(&conn, "persona-a", "m1").expect("manual delete");
            } else {
                set_memory_pinned_in_db(&conn, "persona-a", "m1", true).expect("manual pin");
            }
            assert!(apply_extracted_memories_to_db(
                &mut conn,
                "persona-a",
                snapshot.revision,
                &[original]
            )
            .expect("reject stale batch")
            .is_empty());
            let preserved = query_memories(&conn, "persona-a").expect("list memory");
            if delete {
                assert!(preserved.is_empty());
            } else {
                assert!(preserved[0].pinned);
            }
        }
    }

    #[test]
    fn memory_revisions_are_scoped_to_each_persona() {
        let mut conn = test_connection();
        let snapshot = get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot");
        upsert_memory_to_db(&conn, &memory("other", "persona-b", "其他角色的修改", 1))
            .expect("manual change");
        let proposed = memory("new", "persona-a", "本角色提取", 2);
        assert_eq!(
            apply_extracted_memories_to_db(
                &mut conn,
                "persona-a",
                snapshot.revision,
                std::slice::from_ref(&proposed)
            )
            .expect("commit own batch"),
            vec![proposed]
        );
    }

    #[test]
    fn clearing_or_truncating_messages_invalidates_pending_memory_extraction() {
        for clear in [false, true] {
            let mut conn = test_connection();
            save_message_to_db(&conn, "persona-a", &message("source", "模型上下文", 1))
                .expect("save source");
            let snapshot = get_memory_snapshot_from_db(&conn, "persona-a")
                .expect("register empty memory snapshot");
            if clear {
                clear_messages_in_db(&conn, "persona-a").expect("clear messages");
            } else {
                delete_messages_from_db(&conn, "persona-a", "source").expect("delete source");
            }
            assert!(apply_extracted_memories_to_db(
                &mut conn,
                "persona-a",
                snapshot.revision,
                &[memory("late", "persona-a", "已删除上下文的提取", 2)]
            )
            .expect("reject late extraction")
            .is_empty());
        }
    }

    #[test]
    fn deleting_a_persona_keeps_a_revision_tombstone_for_pending_extraction() {
        let mut conn = test_connection();
        let snapshot =
            get_memory_snapshot_from_db(&conn, "persona-a").expect("register empty persona");
        delete_persona_with_settings(&mut conn, "persona-a", "{}").expect("delete empty persona");
        assert!(apply_extracted_memories_to_db(
            &mut conn,
            "persona-a",
            snapshot.revision,
            &[memory("late", "persona-a", "被删除角色的提取", 1)]
        )
        .expect("reject resurrected persona")
        .is_empty());
    }

    #[test]
    fn backup_import_invalidates_even_empty_registered_memory_snapshots() {
        let mut conn = test_connection();
        let snapshot =
            get_memory_snapshot_from_db(&conn, "empty-persona").expect("register empty snapshot");
        let backup = parse_and_validate_backup(
            &export_backup_json(&test_connection()).expect("export empty backup"),
        )
        .expect("parse empty backup");
        import_backup(&mut conn, &backup).expect("replace database");
        assert!(apply_extracted_memories_to_db(
            &mut conn,
            "empty-persona",
            snapshot.revision,
            &[memory("late", "empty-persona", "备份导入前的提取", 1)]
        )
        .expect("reject pre-import batch")
        .is_empty());
    }

    #[test]
    fn failed_extraction_batch_rolls_back_every_memory_and_its_revision() {
        let mut conn = test_connection();
        let snapshot = get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot");
        let mut invalid = memory("invalid", "persona-a", "无效类别", 2);
        invalid.category = "invalid".into();
        assert!(apply_extracted_memories_to_db(
            &mut conn,
            "persona-a",
            snapshot.revision,
            &[memory("first", "persona-a", "第一条有效记忆", 1), invalid]
        )
        .is_err());
        assert_eq!(
            get_memory_snapshot_from_db(&conn, "persona-a").expect("snapshot after rollback"),
            snapshot
        );
    }

    #[test]
    fn rejects_stale_extraction_after_another_database_connection_commits() {
        let directory = TestDirectory::new("memory-revision");
        let database_path = directory.path().join("soulmate.db");
        let mut first = init_db(&database_path).expect("first connection");
        let second = init_db(&database_path).expect("second connection");
        let snapshot = get_memory_snapshot_from_db(&first, "persona-a").expect("snapshot");
        let manual = memory("manual", "persona-a", "人工新增的记忆", 1);
        upsert_memory_to_db(&second, &manual).expect("commit manual memory externally");
        assert!(apply_extracted_memories_to_db(
            &mut first,
            "persona-a",
            snapshot.revision,
            &[memory("late", "persona-a", "旧快照提取", 2)]
        )
        .expect("reject external change")
        .is_empty());
        assert_eq!(
            query_memories(&first, "persona-a").expect("preserve manual memory"),
            vec![manual]
        );
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
    fn searches_with_fts_and_keeps_the_index_in_sync() {
        let conn = test_connection();
        save_message_to_db(
            &conn,
            "persona-a",
            &message("indexed", "这是一条可以索引的中文消息", 1),
        )
        .expect("save indexed message");

        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "索引的中").expect("search FTS"),
            vec![message("indexed", "这是一条可以索引的中文消息", 1)]
        );

        save_message_to_db(
            &conn,
            "persona-a",
            &message("indexed", "内容已经更新并可重新查找", 2),
        )
        .expect("update indexed message");
        assert!(search_messages_in_db(&conn, "persona-a", "索引的中")
            .expect("search stale FTS content")
            .is_empty());
        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "重新查找").expect("search updated FTS"),
            vec![message("indexed", "内容已经更新并可重新查找", 2)]
        );

        conn.execute("DELETE FROM messages WHERE id = 'indexed'", [])
            .expect("delete indexed message");
        assert!(search_messages_in_db(&conn, "persona-a", "重新查找")
            .expect("search deleted FTS content")
            .is_empty());
    }

    #[test]
    fn falls_back_to_literal_search_for_short_queries() {
        let conn = test_connection();
        save_message_to_db(&conn, "persona-a", &message("short", "中文 100%", 1))
            .expect("save message");

        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "中").expect("search one character"),
            vec![message("short", "中文 100%", 1)]
        );
        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "%").expect("search wildcard literally"),
            vec![message("short", "中文 100%", 1)]
        );
        assert!(search_messages_in_db(&conn, "persona-a", "  ")
            .expect("search blank query")
            .is_empty());
    }

    #[test]
    fn treats_fts_operators_and_quotes_as_literal_text() {
        let conn = test_connection();
        save_message_to_db(
            &conn,
            "persona-a",
            &message("syntax", r#"他说 "AND *" 只是文本"#, 1),
        )
        .expect("save syntax message");

        assert_eq!(
            search_messages_in_db(&conn, "persona-a", r#""AND *""#)
                .expect("search FTS syntax literally"),
            vec![message("syntax", r#"他说 "AND *" 只是文本"#, 1)]
        );
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

    #[test]
    fn migrates_version_two_messages_into_the_fts_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                persona_id TEXT NOT NULL DEFAULT 'default',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                timestamp INTEGER NOT NULL
             );
             CREATE TABLE app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
             );
             INSERT INTO messages (id, persona_id, role, content, timestamp)
             VALUES ('v2', 'persona-a', 'user', '版本二历史消息可被索引', 1);
             PRAGMA user_version = 2;",
        )
        .expect("create version two schema");

        initialize_schema(&conn).expect("migrate version two schema");

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "历史消息").expect("search migrated FTS"),
            vec![message("v2", "版本二历史消息可被索引", 1)]
        );
    }

    #[test]
    fn migrates_existing_memories_and_messages_to_reference_schema() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            "CREATE TABLE messages (
                id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, role TEXT NOT NULL,
                content TEXT NOT NULL, thinking TEXT, timestamp INTEGER NOT NULL,
                alternatives_json TEXT NOT NULL DEFAULT '[]', active_alternative INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE memories (
                id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, category TEXT NOT NULL,
                content TEXT NOT NULL, source_message_id TEXT, confidence REAL NOT NULL,
                pinned INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
             );
             INSERT INTO messages (id, persona_id, role, content, timestamp)
             VALUES ('old-message', 'persona-a', 'assistant', '旧回复', 1);
             INSERT INTO memories (id, persona_id, category, content, confidence, pinned, created_at, updated_at)
             VALUES ('old-memory', 'persona-a', 'event', '旧事件', 0.8, 0, 1, 1);
             PRAGMA user_version = 5;",
        )
        .expect("create old schema");

        initialize_schema(&conn).expect("migrate schema");

        assert!(
            query_all_messages(&conn, "persona-a").expect("load message")[0]
                .memory_references
                .is_empty()
        );
        assert!(query_memories(&conn, "persona-a").expect("load memory")[0].enabled);
    }

    #[test]
    fn rebuilds_a_missing_fts_index_at_the_current_schema_version() {
        let conn = test_connection();
        save_message_to_db(
            &conn,
            "persona-a",
            &message("existing", "需要重新建立全文索引", 1),
        )
        .expect("save message");
        conn.execute_batch(
            "DROP TRIGGER messages_fts_insert;
             DROP TRIGGER messages_fts_delete;
             DROP TRIGGER messages_fts_update;
             DROP TABLE messages_fts;",
        )
        .expect("drop FTS objects");

        initialize_schema(&conn).expect("recreate FTS index");

        assert_eq!(
            search_messages_in_db(&conn, "persona-a", "全文索引").expect("search rebuilt FTS"),
            vec![message("existing", "需要重新建立全文索引", 1)]
        );
    }

    #[test]
    fn preserves_a_valid_database_while_another_connection_holds_a_write_lock() {
        let directory = TestDirectory::new("locked");
        let database_path = directory.path().join("soulmate.db");
        let conn = init_db(&database_path).expect("create database");
        save_message_to_db(&conn, "persona-a", &message("history", "保留聊天记录", 1))
            .expect("save history");
        conn.pragma_update(None, "user_version", SCHEMA_VERSION - 1)
            .expect("require migration");
        conn.execute_batch("BEGIN IMMEDIATE")
            .expect("lock database");

        let result = init_db_with_recovery(&database_path);
        assert!(result.is_err(), "a locked database must not be replaced");
        assert!(fs::read_dir(directory.path())
            .expect("list directory")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .contains(".recovered-")));
        conn.execute_batch("ROLLBACK").expect("release lock");
        drop(conn);
        let (reopened, warning) =
            init_db_with_recovery(&database_path).expect("open unlocked database");
        assert!(warning.is_none());
        assert_eq!(
            query_all_messages(&reopened, "persona-a").expect("load history"),
            vec![message("history", "保留聊天记录", 1)]
        );
    }

    #[test]
    fn preserves_a_valid_database_when_schema_migration_fails() {
        let directory = TestDirectory::new("invalid-schema");
        let database_path = directory.path().join("soulmate.db");
        let conn = Connection::open(&database_path).expect("create database");
        conn.execute_batch(
            "CREATE TABLE messages (id TEXT PRIMARY KEY); INSERT INTO messages VALUES ('keep');",
        )
        .expect("write unsupported schema");
        drop(conn);
        assert!(init_db_with_recovery(&database_path).is_err());
        assert!(fs::read_dir(directory.path())
            .expect("list directory")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .contains(".recovered-")));
        let preserved = Connection::open(&database_path).expect("reopen original");
        assert_eq!(
            preserved
                .query_row("SELECT id FROM messages", [], |row| row.get::<_, String>(0))
                .expect("preserve data"),
            "keep"
        );
    }

    #[test]
    fn isolates_a_corrupt_database_and_creates_a_fresh_one() {
        let directory = TestDirectory::new("recovery");
        let database_path = directory.path().join("soulmate.db");
        let corrupt_contents = b"this is not a sqlite database";
        fs::write(&database_path, corrupt_contents).expect("write corrupt database");

        let (conn, warning) =
            init_db_with_recovery(&database_path).expect("recover corrupt database");
        let warning = warning.expect("return startup warning");
        let recovered_path = PathBuf::from(&warning.isolated_database_path);

        assert_eq!(warning.code, "databaseRecovered");
        assert!(database_path.exists());
        assert!(recovered_path.exists());
        assert_eq!(
            fs::read(recovered_path).expect("read recovered database"),
            corrupt_contents
        );
        assert!(query_all_messages(&conn, "default")
            .expect("query fresh database")
            .is_empty());
    }

    #[test]
    fn preserves_a_database_created_by_a_newer_app_version() {
        let directory = TestDirectory::new("newer-schema");
        let database_path = directory.path().join("soulmate.db");
        let conn = Connection::open(&database_path).expect("create database");
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .expect("set newer schema");
        drop(conn);

        let error = init_db_with_recovery(&database_path)
            .expect_err("refuse to open a newer database")
            .to_string();

        assert!(error.contains("高于当前应用支持的版本"));
        assert!(database_path.exists());
        assert!(fs::read_dir(directory.path())
            .expect("list directory")
            .all(|entry| !entry
                .expect("directory entry")
                .file_name()
                .to_string_lossy()
                .contains(".recovered-")));
    }

    #[test]
    fn isolates_wal_and_shm_files_with_the_database() {
        let directory = TestDirectory::new("sidecars");
        let database_path = directory.path().join("soulmate.db");
        let wal_path = PathBuf::from(format!("{}-wal", database_path.to_string_lossy()));
        let shm_path = PathBuf::from(format!("{}-shm", database_path.to_string_lossy()));
        fs::write(&database_path, b"database").expect("write database");
        fs::write(&wal_path, b"wal").expect("write WAL");
        fs::write(&shm_path, b"shm").expect("write SHM");

        let isolated_path = isolate_database(&database_path).expect("isolate database");

        assert_eq!(
            fs::read(&isolated_path).expect("read database"),
            b"database"
        );
        assert_eq!(
            fs::read(format!("{}-wal", isolated_path.to_string_lossy())).expect("read WAL"),
            b"wal"
        );
        assert_eq!(
            fs::read(format!("{}-shm", isolated_path.to_string_lossy())).expect("read SHM"),
            b"shm"
        );
        assert!(!database_path.exists());
        assert!(!wal_path.exists());
        assert!(!shm_path.exists());
    }

    #[test]
    fn backup_roundtrip_preserves_settings_and_all_persona_messages() {
        let source = test_connection();
        save_settings_json(
            &source,
            r#"{"activePersonaIndex":1,"personas":[{"id":"a"},{"id":"b"}],"aiSettings":{"model":"test","apiKey":"legacy-secret"}}"#,
        )
        .expect("save settings");
        let mut first = message("a-1", "甲的消息", 1);
        first.thinking = Some("甲的思考".into());
        let mut second = message("b-1", "乙的消息", 2);
        second.role = "assistant".into();
        second.memory_references = vec![MemoryReference {
            id: "memory-a".into(),
            content: "用户喜欢爵士乐".into(),
        }];
        save_message_to_db(&source, "persona-a", &first).expect("save first persona message");
        save_message_to_db(&source, "persona-b", &second).expect("save second persona message");
        let mut disabled_memory = memory("memory-a", "persona-a", "用户喜欢爵士乐", 3);
        disabled_memory.enabled = false;
        let saved_memory = upsert_memory_to_db(&source, &disabled_memory).expect("save memory");

        let exported = export_backup_json(&source).expect("export backup");
        assert!(!exported.contains("legacy-secret"));
        assert!(!exported.contains("apiKey"));
        let backup = parse_and_validate_backup(&exported).expect("validate exported backup");
        let mut destination = test_connection();
        save_settings_json(&destination, r#"{"old":true}"#).expect("save old settings");
        save_message_to_db(&destination, "old", &message("old", "旧数据", 0))
            .expect("save old message");

        let summary = import_backup(&mut destination, &backup).expect("import backup");

        assert_eq!(
            summary,
            BackupImportSummary {
                message_count: 2,
                memory_count: 1,
                persona_count: 2,
                has_settings: true,
            }
        );
        assert_eq!(
            query_all_messages(&destination, "persona-a").expect("load first persona"),
            vec![first]
        );
        assert_eq!(
            query_all_messages(&destination, "persona-b").expect("load second persona"),
            vec![second]
        );
        assert!(query_all_messages(&destination, "old")
            .expect("load replaced messages")
            .is_empty());
        assert_eq!(
            query_memories(&destination, "persona-a").expect("load imported memory"),
            vec![saved_memory]
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &load_settings_json(&destination)
                    .expect("load imported settings")
                    .expect("settings exist")
            )
            .expect("parse imported settings"),
            backup.settings.expect("backup settings")
        );
        assert_eq!(
            search_messages_in_db(&destination, "persona-a", "甲的消息")
                .expect("search imported message"),
            vec![message_with_thinking("a-1", "甲的消息", "甲的思考", 1)]
        );
    }

    #[test]
    fn rolls_back_the_entire_import_when_an_insert_fails() {
        let mut conn = test_connection();
        save_settings_json(&conn, r#"{"original":true}"#).expect("save original settings");
        save_message_to_db(
            &conn,
            "original",
            &message("original", "原始消息仍应保留", 1),
        )
        .expect("save original message");
        conn.execute_batch(
            "CREATE TRIGGER reject_backup_message
             BEFORE INSERT ON messages
             WHEN new.content = '触发导入失败'
             BEGIN
                SELECT RAISE(ABORT, 'injected import failure');
             END;",
        )
        .expect("create failure trigger");
        let backup = parse_and_validate_backup(
            r#"{
                "formatVersion": 1,
                "exportedAt": 1,
                "settings": {"replacement": true},
                "messages": [{
                    "personaId": "replacement",
                    "id": "replacement",
                    "role": "user",
                    "content": "触发导入失败",
                    "thinking": null,
                    "timestamp": 2
                }]
            }"#,
        )
        .expect("parse valid backup");

        assert!(import_backup(&mut conn, &backup).is_err());
        assert_eq!(
            load_settings_json(&conn).expect("load settings after rollback"),
            Some(r#"{"original":true}"#.into())
        );
        assert_eq!(
            query_all_messages(&conn, "original").expect("load messages after rollback"),
            vec![message("original", "原始消息仍应保留", 1)]
        );
        assert_eq!(
            search_messages_in_db(&conn, "original", "原始消息")
                .expect("search index after rollback"),
            vec![message("original", "原始消息仍应保留", 1)]
        );
    }

    #[test]
    fn rejects_invalid_backups_before_replacing_data() {
        let duplicate_ids = r#"{
            "formatVersion": 1,
            "exportedAt": 1,
            "settings": {},
            "messages": [
                {"personaId":"a","id":"same","role":"user","content":"一","thinking":null,"timestamp":1},
                {"personaId":"b","id":"same","role":"user","content":"二","thinking":null,"timestamp":2}
            ]
        }"#;
        let unsupported_version = r#"{
            "formatVersion": 99,
            "exportedAt": 1,
            "settings": {},
            "messages": []
        }"#;
        let unsupported_role = r#"{
            "formatVersion": 1,
            "exportedAt": 1,
            "settings": {},
            "messages": [
                {"personaId":"a","id":"system","role":"system","content":"prompt","thinking":null,"timestamp":1}
            ]
        }"#;
        let legacy_key = r#"{
            "formatVersion": 1,
            "exportedAt": 1,
            "settings": {"aiSettings":{"model":"test","apiKey":"must-not-import"}},
            "messages": []
        }"#;

        assert!(parse_and_validate_backup(duplicate_ids)
            .expect_err("reject duplicate ids")
            .contains("重复消息 id"));
        assert!(parse_and_validate_backup(unsupported_version)
            .expect_err("reject unsupported version")
            .contains("不支持的备份版本"));
        assert!(parse_and_validate_backup(unsupported_role)
            .expect_err("reject unsupported role")
            .contains("必须是 user 或 assistant"));
        let sanitized = parse_and_validate_backup(legacy_key).expect("accept legacy backup");
        assert!(sanitized
            .settings
            .and_then(|settings| settings.get("aiSettings").cloned())
            .and_then(|settings| settings.get("apiKey").cloned())
            .is_none());
    }

    #[test]
    fn accepts_version_three_backup_with_enabled_memories_by_default() {
        let backup = parse_and_validate_backup(
            r#"{
                "formatVersion": 3,
                "exportedAt": 1,
                "settings": {},
                "messages": [],
                "memories": [{
                    "id": "old-memory", "personaId": "persona-a", "category": "event",
                    "content": "旧事件", "sourceMessageId": null, "confidence": 0.8,
                    "pinned": false, "createdAt": 1, "updatedAt": 1
                }]
            }"#,
        )
        .expect("parse previous backup");

        assert!(backup.memories[0].enabled);
    }

    fn message_with_thinking(id: &str, content: &str, thinking: &str, timestamp: i64) -> Message {
        Message {
            id: id.into(),
            role: "user".into(),
            content: content.into(),
            thinking: Some(thinking.into()),
            timestamp,
            alternatives: Vec::new(),
            active_alternative: 0,
            memory_references: Vec::new(),
        }
    }
}
