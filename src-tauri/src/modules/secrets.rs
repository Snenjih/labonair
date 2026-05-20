//! Unified local secret storage for all platforms.
//!
//! Secrets are stored in the app's local data directory as either:
//!   - `secrets.json`  — plain JSON (default, protected by OS file permissions)
//!   - `secrets.enc`   — AES-256-GCM encrypted JSON (opt-in via app settings)
//!
//! An app-managed encryption key (`enc_key.bin`, mode 0600 on Unix) is generated
//! once on first run and reused on every subsequent start. No master password is
//! required from the user.
//!
//! Frontend talks to `secrets_get`, `secrets_set`, `secrets_delete`,
//! `secrets_get_all`, `secrets_get_encryption_enabled`, and
//! `secrets_set_encryption_enabled`.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;
use serde_json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

const PLAIN_FILE: &str = "secrets.json";
const ENC_FILE: &str = "secrets.enc";
const KEY_FILE: &str = "enc_key.bin";
const ENC_FLAG_FILE: &str = "enc_enabled.flag";

pub struct SecretsState {
    cache: Mutex<Option<HashMap<String, String>>>,
    enc_key: Mutex<Option<[u8; 32]>>,
}

impl Default for SecretsState {
    fn default() -> Self {
        Self {
            cache: Mutex::new(None),
            enc_key: Mutex::new(None),
        }
    }
}

// ── Paths ────────────────────────────────────────────────────────────────────

fn plain_path(_app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::modules::fs::paths::data_dir().join(PLAIN_FILE))
}

fn enc_path(_app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::modules::fs::paths::data_dir().join(ENC_FILE))
}

fn key_path(_app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::modules::fs::paths::data_dir().join(KEY_FILE))
}

fn flag_path(_app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::modules::fs::paths::data_dir().join(ENC_FLAG_FILE))
}

// ── Encryption-key lifecycle ─────────────────────────────────────────────────

fn load_or_create_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let path = key_path(app)?;
    if path.exists() {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    write_protected(&path, &key)?;
    Ok(key)
}

fn get_enc_key(app: &AppHandle, state: &SecretsState) -> Result<[u8; 32], String> {
    let mut guard = state.enc_key.lock().map_err(|e| e.to_string())?;
    if let Some(k) = *guard {
        return Ok(k);
    }
    let k = load_or_create_key(app)?;
    *guard = Some(k);
    Ok(k)
}

// ── File helpers ─────────────────────────────────────────────────────────────

/// Write bytes to a file atomically, mode 0600 on Unix.
fn write_protected(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let tmp = path.with_extension("tmp");

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Encryption / decryption ───────────────────────────────────────────────────

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| e.to_string())?;
    // Layout: nonce (12 bytes) || ciphertext
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("encrypted data too short".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| e.to_string())
}

// ── Store read / write ────────────────────────────────────────────────────────

fn is_encryption_enabled(app: &AppHandle) -> bool {
    flag_path(app).map(|p| p.exists()).unwrap_or(false)
}

fn read_map(app: &AppHandle, state: &SecretsState) -> Result<HashMap<String, String>, String> {
    if is_encryption_enabled(app) {
        let path = enc_path(app)?;
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let raw = fs::read(&path).map_err(|e| e.to_string())?;
        let key = get_enc_key(app, state)?;
        let json_bytes = decrypt(&key, &raw)?;
        serde_json::from_slice(&json_bytes).map_err(|e| e.to_string())
    } else {
        let path = plain_path(app)?;
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())
    }
}

fn write_map(
    app: &AppHandle,
    state: &SecretsState,
    map: &HashMap<String, String>,
) -> Result<(), String> {
    let json = serde_json::to_vec(map).map_err(|e| e.to_string())?;
    if is_encryption_enabled(app) {
        let key = get_enc_key(app, state)?;
        let encrypted = encrypt(&key, &json)?;
        write_protected(&enc_path(app)?, &encrypted)
    } else {
        write_protected(&plain_path(app)?, &json)
    }
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

fn with_cache<F, R>(app: &AppHandle, state: &SecretsState, f: F) -> Result<R, String>
where
    F: FnOnce(&mut HashMap<String, String>) -> R,
{
    let mut guard = state.cache.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(read_map(app, state)?);
    }
    Ok(f(guard.as_mut().expect("initialized above")))
}

fn invalidate_cache(state: &SecretsState) {
    if let Ok(mut g) = state.cache.lock() {
        *g = None;
    }
}

fn composite_key(service: &str, account: &str) -> String {
    format!("{}::{}", service, account)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn secrets_get(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    service: String,
    account: String,
) -> Result<Option<String>, String> {
    let k = composite_key(&service, &account);
    with_cache(&app, &state, |m| m.get(&k).cloned())
}

#[tauri::command]
pub async fn secrets_set(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    service: String,
    account: String,
    password: String,
) -> Result<(), String> {
    let k = composite_key(&service, &account);
    with_cache(&app, &state, |m| {
        m.insert(k, password);
    })?;
    let snapshot = {
        let guard = state.cache.lock().map_err(|e| e.to_string())?;
        guard.as_ref().cloned().unwrap_or_default()
    };
    write_map(&app, &state, &snapshot)
}

#[tauri::command]
pub async fn secrets_delete(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    service: String,
    account: String,
) -> Result<(), String> {
    let k = composite_key(&service, &account);
    with_cache(&app, &state, |m| {
        m.remove(&k);
    })?;
    let snapshot = {
        let guard = state.cache.lock().map_err(|e| e.to_string())?;
        guard.as_ref().cloned().unwrap_or_default()
    };
    write_map(&app, &state, &snapshot)
}

#[tauri::command]
pub async fn secrets_get_all(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    service: String,
    accounts: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    with_cache(&app, &state, |m| {
        accounts
            .iter()
            .map(|a| m.get(&composite_key(&service, a)).cloned())
            .collect()
    })
}

/// Returns whether AES-256-GCM encryption is currently enabled.
#[tauri::command]
pub async fn secrets_get_encryption_enabled(app: AppHandle) -> Result<bool, String> {
    Ok(is_encryption_enabled(&app))
}

/// Enable or disable AES-256-GCM encryption.
/// Migrates the existing store to the new format atomically.
#[tauri::command]
pub async fn secrets_set_encryption_enabled(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    enabled: bool,
) -> Result<(), String> {
    let currently = is_encryption_enabled(&app);
    if currently == enabled {
        return Ok(());
    }

    // Read current secrets (from whichever format is active now).
    let map = read_map(&app, &state)?;

    if enabled {
        // Write encrypted file, set flag, remove plain file.
        let key = get_enc_key(&app, &state)?;
        let json = serde_json::to_vec(&map).map_err(|e| e.to_string())?;
        let encrypted = encrypt(&key, &json)?;
        write_protected(&enc_path(&app)?, &encrypted)?;
        write_protected(&flag_path(&app)?, b"1")?;
        let _ = fs::remove_file(plain_path(&app)?);
    } else {
        // Write plain file, remove flag and encrypted file.
        let json = serde_json::to_vec(&map).map_err(|e| e.to_string())?;
        write_protected(&plain_path(&app)?, &json)?;
        let _ = fs::remove_file(flag_path(&app)?);
        let _ = fs::remove_file(enc_path(&app)?);
    }

    invalidate_cache(&state);
    Ok(())
}

// ── Internal helpers for Rust callers (db.rs, client.rs) ─────────────────────

pub(crate) fn store_password(
    app: &AppHandle,
    state: &SecretsState,
    service: &str,
    account: &str,
    password: &str,
) -> Result<(), String> {
    let k = composite_key(service, account);
    with_cache(app, state, |m| {
        m.insert(k, password.to_string());
    })?;
    let snapshot = {
        let guard = state.cache.lock().map_err(|e| e.to_string())?;
        guard.as_ref().cloned().unwrap_or_default()
    };
    write_map(app, state, &snapshot)
}

pub(crate) fn delete_password(
    app: &AppHandle,
    state: &SecretsState,
    service: &str,
    account: &str,
) -> Result<(), String> {
    let k = composite_key(service, account);
    with_cache(app, state, |m| {
        m.remove(&k);
    })?;
    let snapshot = {
        let guard = state.cache.lock().map_err(|e| e.to_string())?;
        guard.as_ref().cloned().unwrap_or_default()
    };
    write_map(app, state, &snapshot)
}

pub(crate) fn get_password(
    app: &AppHandle,
    state: &SecretsState,
    service: &str,
    account: &str,
) -> Result<Option<String>, String> {
    let k = composite_key(service, account);
    with_cache(app, state, |m| m.get(&k).cloned())
}
