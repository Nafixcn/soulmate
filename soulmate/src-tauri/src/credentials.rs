const SERVICE: &str = "com.soulmate.desktop";
const API_KEY_ACCOUNT: &str = "ai-api-key";

fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, API_KEY_ACCOUNT).map_err(|error| error.to_string())
}

pub(crate) fn load_api_key() -> Result<Option<String>, String> {
    match api_key_entry()?.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn has_api_key() -> Result<bool, String> {
    Ok(load_api_key()?.is_some())
}

#[tauri::command]
pub fn save_api_key(api_key: String) -> Result<(), String> {
    let entry = api_key_entry()?;
    if api_key.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }

    entry
        .set_password(&api_key)
        .map_err(|error| error.to_string())
}
