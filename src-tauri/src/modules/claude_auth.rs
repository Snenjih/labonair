//! Read locally stored Claude OAuth credentials.
//!
//! Checks two known credential locations in order:
//!   1. ~/.claude/.credentials.json   — Claude Code CLI
//!   2. ~/.config/anthropic/credentials/default.json — Anthropic `ant` CLI
//!
//! Returns the raw access token so the frontend can pass it to
//! `createAnthropic({ authToken })` without storing it in the app's secrets.

use serde::Deserialize;
use std::path::PathBuf;

// ── Claude Code schema (nested under "claudeAiOauth") ─────────────────────────

#[derive(Deserialize)]
struct ClaudeCodeFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeCodeOauth>,
}

#[derive(Deserialize)]
struct ClaudeCodeOauth {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<i64>,
}

// ── Anthropic `ant` CLI schema (flat) ─────────────────────────────────────────

#[derive(Deserialize)]
struct AntCliFile {
    access_token: Option<String>,
    // expires_at is an ISO-8601 string in the ant CLI format; we treat absence as "unknown"
}

// ── Return type ───────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct ClaudeCredentials {
    pub access_token: String,
    /// Unix timestamp in milliseconds (if the credential file contained it)
    pub expires_at_ms: Option<i64>,
    /// "claude-code" or "ant-cli"
    pub source: String,
}

// ── Path helpers ──────────────────────────────────────────────────────────────

fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

fn claude_code_path() -> Option<PathBuf> {
    Some(home_dir()?.join(".claude").join(".credentials.json"))
}

fn ant_cli_path() -> Option<PathBuf> {
    Some(
        home_dir()?
            .join(".config")
            .join("anthropic")
            .join("credentials")
            .join("default.json"),
    )
}

// ── Tauri command ─────────────────────────────────────────────────────────────

/// Read the OAuth access token from the locally installed Claude CLI credentials.
///
/// Tries Claude Code's `~/.claude/.credentials.json` first, then falls back to
/// the `ant` CLI's `~/.config/anthropic/credentials/default.json`.
///
/// Returns an error if neither credential file is found or parseable.
#[tauri::command]
pub async fn ai_claude_credentials_read() -> Result<ClaudeCredentials, String> {
    // ── Try Claude Code ───────────────────────────────────────────────────────
    if let Some(path) = claude_code_path() {
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(file) = serde_json::from_str::<ClaudeCodeFile>(&content) {
                        if let Some(oauth) = file.claude_ai_oauth {
                            if let Some(token) =
                                oauth.access_token.filter(|t| !t.is_empty())
                            {
                                return Ok(ClaudeCredentials {
                                    access_token: token,
                                    expires_at_ms: oauth.expires_at,
                                    source: "claude-code".to_string(),
                                });
                            }
                        }
                    }
                }
                Err(_) => {}
            }
        }
    }

    // ── Try ant CLI ───────────────────────────────────────────────────────────
    if let Some(path) = ant_cli_path() {
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(file) = serde_json::from_str::<AntCliFile>(&content) {
                        if let Some(token) =
                            file.access_token.filter(|t| !t.is_empty())
                        {
                            return Ok(ClaudeCredentials {
                                access_token: token,
                                expires_at_ms: None,
                                source: "ant-cli".to_string(),
                            });
                        }
                    }
                }
                Err(_) => {}
            }
        }
    }

    Err(
        "No Claude subscription credentials found. \
         Log in with the Claude CLI (`claude login` or `ant auth login`)."
            .to_string(),
    )
}
