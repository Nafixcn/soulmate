const SERVICE: &str = "com.soulmate.desktop";
const LEGACY_API_KEY_ACCOUNT: &str = "ai-api-key";
const APP_LOCK_ACCOUNT: &str = "app-lock-pin";

fn api_key_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|error| error.to_string())
}

fn account_for_endpoint(endpoint: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "API 端点格式无效".to_string())?;
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| "API 端点缺少主机名".to_string())?
        .to_ascii_lowercase();
    let port = url
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    Ok(format!("ai-api-key:{host}{port}"))
}

pub(crate) fn load_api_key(endpoint: &str) -> Result<Option<String>, String> {
    let account = account_for_endpoint(endpoint)?;
    match api_key_entry(&account)?.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(keyring::Error::NoEntry) => migrate_legacy_api_key(&account),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn has_api_key(endpoint: String) -> Result<bool, String> {
    Ok(load_api_key(&endpoint)?.is_some())
}

#[tauri::command]
pub fn save_api_key(endpoint: String, api_key: String) -> Result<(), String> {
    let account = account_for_endpoint(&endpoint)?;
    let entry = api_key_entry(&account)?;
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

#[tauri::command]
pub fn has_app_lock() -> Result<bool, String> {
    match api_key_entry(APP_LOCK_ACCOUNT)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn set_app_lock(pin: String) -> Result<(), String> {
    let entry = api_key_entry(APP_LOCK_ACCOUNT)?;
    if pin.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }
    validate_app_lock_pin(&pin)?;
    entry.set_password(&pin).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn verify_app_lock(pin: String) -> Result<bool, String> {
    validate_app_lock_pin(&pin)?;
    match api_key_entry(APP_LOCK_ACCOUNT)?.get_password() {
        Ok(expected) => Ok(constant_time_equal(expected.as_bytes(), pin.as_bytes())),
        Err(keyring::Error::NoEntry) => Ok(true),
        Err(error) => Err(error.to_string()),
    }
}

fn migrate_legacy_api_key(account: &str) -> Result<Option<String>, String> {
    let legacy = api_key_entry(LEGACY_API_KEY_ACCOUNT)?;
    let api_key = match legacy.get_password() {
        Ok(api_key) => api_key,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    api_key_entry(account)?
        .set_password(&api_key)
        .map_err(|error| error.to_string())?;
    match legacy.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(Some(api_key)),
        Err(error) => Err(error.to_string()),
    }
}

fn validate_app_lock_pin(pin: &str) -> Result<(), String> {
    if (4..=12).contains(&pin.len()) && pin.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(())
    } else {
        Err("应用锁 PIN 必须是 4-12 位数字".into())
    }
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        let left_byte = left.get(index).copied().unwrap_or_default();
        let right_byte = right.get(index).copied().unwrap_or_default();
        difference |= usize::from(left_byte ^ right_byte);
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use super::{account_for_endpoint, constant_time_equal, validate_app_lock_pin};

    #[test]
    fn derives_stable_accounts_per_provider_host() {
        assert_eq!(
            account_for_endpoint("https://api.openai.com/v1/chat/completions").expect("account"),
            "ai-api-key:api.openai.com"
        );
        assert_eq!(
            account_for_endpoint("https://api.openai.com/v1/responses").expect("account"),
            "ai-api-key:api.openai.com"
        );
        assert_eq!(
            account_for_endpoint("http://localhost:11434/v1/chat/completions").expect("account"),
            "ai-api-key:localhost:11434"
        );
    }

    #[test]
    fn rejects_endpoints_without_a_host() {
        assert!(account_for_endpoint("not-a-url").is_err());
    }

    #[test]
    fn validates_numeric_app_lock_pins() {
        assert!(validate_app_lock_pin("1234").is_ok());
        assert!(validate_app_lock_pin("123456789012").is_ok());
        assert!(validate_app_lock_pin("123").is_err());
        assert!(validate_app_lock_pin("12a4").is_err());
    }

    #[test]
    fn compares_app_lock_pins_without_early_length_or_byte_exit() {
        assert!(constant_time_equal(b"1234", b"1234"));
        assert!(!constant_time_equal(b"1234", b"1235"));
        assert!(!constant_time_equal(b"1234", b"12345"));
    }
}
