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
const SCHEMA_VERSION: i64 = 3;
const BACKUP_FORMAT_VERSION: u32 = 1;
const MAX_BACKUP_BYTES: usize = 64 * 1024 * 1024;

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
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportSummary {
    pub message_count: usize,
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
            timestamp INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );",
    )?;

    if !has_column(&transaction, "messages", "persona_id")? {
        transaction.execute(
            "ALTER TABLE messages ADD COLUMN persona_id TEXT NOT NULL DEFAULT 'default'",
            [],
        )?;
    }

    transaction.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_messages_persona_timestamp
         ON messages(persona_id, timestamp);
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
        "INSERT INTO messages (id, persona_id, role, content, thinking, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            persona_id = excluded.persona_id,
            role = excluded.role,
            content = excluded.content,
            thinking = excluded.thinking,
            timestamp = excluded.timestamp",
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
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    if query.chars().count() >= 3 {
        let fts_query = format!("\"{}\"", query.replace('"', "\"\""));
        let mut statement = conn.prepare(
            "SELECT m.id, m.role, m.content, m.thinking, m.timestamp
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

fn export_backup_json(conn: &Connection) -> Result<String, Box<dyn std::error::Error>> {
    let settings = load_settings_json(conn)?
        .map(|json| serde_json::from_str::<serde_json::Value>(&json))
        .transpose()?
        .map(strip_legacy_api_key);
    let mut statement = conn.prepare(
        "SELECT persona_id, id, role, content, thinking, timestamp
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
        })
    })?;
    let messages = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let backup = PortableBackup {
        format_version: BACKUP_FORMAT_VERSION,
        exported_at: unix_timestamp(),
        settings,
        messages,
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
    if backup.format_version != BACKUP_FORMAT_VERSION {
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
    transaction.execute("DELETE FROM messages", [])?;
    transaction.execute("DELETE FROM app_settings", [])?;

    if let Some(settings) = &backup.settings {
        let settings_json = serde_json::to_string(settings)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        save_settings_json(transaction, &settings_json)?;
    }

    let mut statement = transaction.prepare(
        "INSERT INTO messages (id, persona_id, role, content, thinking, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    for message in &backup.messages {
        statement.execute(rusqlite::params![
            message.id,
            message.persona_id,
            message.role,
            message.content,
            message.thinking,
            message.timestamp
        ])?;
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process;

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
        save_message_to_db(&source, "persona-a", &first).expect("save first persona message");
        save_message_to_db(&source, "persona-b", &second).expect("save second persona message");

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
            "formatVersion": 2,
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

    fn message_with_thinking(id: &str, content: &str, thinking: &str, timestamp: i64) -> Message {
        Message {
            id: id.into(),
            role: "user".into(),
            content: content.into(),
            thinking: Some(thinking.into()),
            timestamp,
        }
    }
}
