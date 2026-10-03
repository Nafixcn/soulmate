use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::State;

use crate::AppState;

const SERVICE: &str = "com.soulmate.desktop";
const LEGACY_API_KEY_ACCOUNT: &str = "ai-api-key";
const APP_LOCK_ACCOUNT: &str = "app-lock-pin";
const FREE_ATTEMPTS: u32 = 4;
const INITIAL_COOLDOWN_SECS: u64 = 30;
const MAX_COOLDOWN_SECS: u64 = 15 * 60;

#[derive(Default)]
pub struct AppLockThrottle {
    failed_attempts: u32,
    blocked_until: Option<Instant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAppLockResult {
    unlocked: bool,
    retry_after_ms: u64,
}

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
pub fn set_app_lock(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    let entry = api_key_entry(APP_LOCK_ACCOUNT)?;
    if pin.is_empty() {
        let result = match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        };
        if result.is_ok() {
            reset_app_lock_throttle(&state)?;
        }
        return result;
    }
    validate_app_lock_pin(&pin)?;
    entry
        .set_password(&pin)
        .map_err(|error| error.to_string())?;
    reset_app_lock_throttle(&state)
}

#[tauri::command]
pub fn verify_app_lock(
    state: State<'_, AppState>,
    pin: String,
) -> Result<VerifyAppLockResult, String> {
    validate_app_lock_pin(&pin)?;
    let now = Instant::now();
    let mut throttle = state
        .app_lock_throttle
        .lock()
        .map_err(|_| "应用锁状态不可用".to_string())?;

    let retry_after_ms = remaining_cooldown_ms(&throttle, now);
    if retry_after_ms > 0 {
        return Ok(VerifyAppLockResult {
            unlocked: false,
            retry_after_ms,
        });
    }

    match api_key_entry(APP_LOCK_ACCOUNT)?.get_password() {
        Ok(expected) if constant_time_equal(expected.as_bytes(), pin.as_bytes()) => {
            *throttle = AppLockThrottle::default();
            Ok(VerifyAppLockResult {
                unlocked: true,
                retry_after_ms: 0,
            })
        }
        Ok(_) => Ok(VerifyAppLockResult {
            unlocked: false,
            retry_after_ms: register_failed_attempt(&mut throttle, now),
        }),
        Err(keyring::Error::NoEntry) => {
            *throttle = AppLockThrottle::default();
            Ok(VerifyAppLockResult {
                unlocked: true,
                retry_after_ms: 0,
            })
        }
        Err(error) => Err(error.to_string()),
    }
}

fn reset_app_lock_throttle(state: &State<'_, AppState>) -> Result<(), String> {
    let mut throttle = state
        .app_lock_throttle
        .lock()
        .map_err(|_| "应用锁状态不可用".to_string())?;
    *throttle = AppLockThrottle::default();
    Ok(())
}

fn remaining_cooldown_ms(throttle: &AppLockThrottle, now: Instant) -> u64 {
    throttle
        .blocked_until
        .and_then(|until| until.checked_duration_since(now))
        .map(|remaining| remaining.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default()
}

fn register_failed_attempt(throttle: &mut AppLockThrottle, now: Instant) -> u64 {
    throttle.failed_attempts = throttle.failed_attempts.saturating_add(1);
    if throttle.failed_attempts <= FREE_ATTEMPTS {
        throttle.blocked_until = None;
        return 0;
    }

    let exponent = throttle
        .failed_attempts
        .saturating_sub(FREE_ATTEMPTS + 1)
        .min(5);
    let seconds = INITIAL_COOLDOWN_SECS
        .saturating_mul(1_u64 << exponent)
        .min(MAX_COOLDOWN_SECS);
    let cooldown = Duration::from_secs(seconds);
    throttle.blocked_until = now.checked_add(cooldown);
    cooldown.as_millis() as u64
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
    use super::{
        account_for_endpoint, constant_time_equal, register_failed_attempt, remaining_cooldown_ms,
        validate_app_lock_pin, AppLockThrottle,
    };
    use std::time::{Duration, Instant};

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

    #[test]
    fn throttles_repeated_app_lock_failures_with_an_increasing_cooldown() {
        let started = Instant::now();
        let mut throttle = AppLockThrottle::default();

        for _ in 0..4 {
            assert_eq!(register_failed_attempt(&mut throttle, started), 0);
        }
        assert_eq!(register_failed_attempt(&mut throttle, started), 30_000);
        assert!(remaining_cooldown_ms(&throttle, started + Duration::from_secs(10)) >= 19_999);
        assert_eq!(
            remaining_cooldown_ms(&throttle, started + Duration::from_secs(31)),
            0
        );
        assert_eq!(
            register_failed_attempt(&mut throttle, started + Duration::from_secs(31)),
            60_000
        );
    }
}
