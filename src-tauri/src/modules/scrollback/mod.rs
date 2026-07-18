use std::io::{Read, Write};
use std::time::Duration;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use crate::modules::fs::paths::data_dir;

const MAX_UNCOMPRESSED_BYTES: usize = 10 * 1024 * 1024; // 10 MB
// Absolute ceiling applied regardless of the configured `scrollbackMaxSizeMb`
// setting — protects against a misconfigured huge value writing unbounded
// scrollback files to disk.
const HARD_MAX_UNCOMPRESSED_BYTES: usize = 100 * 1024 * 1024;

// Visible marker prepended once `truncate_scrollback` has to cut content —
// mirrors the frontend's SCROLLBACK_OVERFLOW_NOTICE (session/scrollback.ts)
// so this defense-in-depth truncation reads the same way as the primary
// frontend-side truncation it backs up.
const OVERFLOW_NOTICE: &str =
    "\r\n\x1b[0m\x1b[2m[labonair: earlier scrollback was truncated to fit the size limit]\x1b[0m\r\n";

/// Truncates `ansi` from the front (oldest content first) once it exceeds
/// `max_bytes`, keeping the most recent output — this is a defense-in-depth
/// backstop for `scrollback_save`; the frontend (session/scrollback.ts)
/// already truncates before calling this command, but a future caller
/// shouldn't be able to write an oversized file by skipping that step. The
/// cut point is advanced to the next line boundary (and snapped to a valid
/// UTF-8 char boundary first) so a multi-byte character or ANSI escape
/// sequence never gets split mid-sequence.
fn truncate_scrollback(ansi: &str, max_bytes: usize) -> String {
    if ansi.len() <= max_bytes {
        return ansi.to_string();
    }
    if OVERFLOW_NOTICE.len() >= max_bytes {
        // Degenerate case: the configured budget is too small even for the
        // notice itself — nothing meaningful can be kept.
        return String::new();
    }
    let budget = max_bytes - OVERFLOW_NOTICE.len();
    let mut cut_start = ansi.len() - budget;
    while cut_start < ansi.len() && !ansi.is_char_boundary(cut_start) {
        cut_start += 1;
    }
    let start = match ansi[cut_start..].find('\n') {
        Some(offset) => cut_start + offset + 1,
        None => cut_start,
    };
    format!("{OVERFLOW_NOTICE}{}", &ansi[start..])
}

fn scrollback_path(session_id: &str) -> Result<std::path::PathBuf, String> {
    if session_id.len() != 36
        || !session_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
    {
        return Err("invalid session_id".to_string());
    }
    let dir = data_dir().join("scrollback");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.ansi.gz", session_id)))
}

#[tauri::command]
pub async fn scrollback_save(
    session_id: String,
    ansi: String,
    max_bytes: Option<usize>,
) -> Result<(), String> {
    let max_bytes = max_bytes.unwrap_or(MAX_UNCOMPRESSED_BYTES).min(HARD_MAX_UNCOMPRESSED_BYTES);
    if ansi.trim().is_empty() {
        return Ok(());
    }
    // Oversized content is truncated from the front (oldest content first),
    // keeping the most recent output plus a visible overflow notice — see
    // `truncate_scrollback`. This is a defense-in-depth backstop: the
    // frontend (session/scrollback.ts) already truncates before calling this
    // command, so in practice `ansi` should already fit `max_bytes` here.
    let ansi = truncate_scrollback(&ansi, max_bytes);
    let path = match scrollback_path(&session_id) {
        Ok(p) => p,
        Err(_) => return Ok(()), // invalid id — silently skip
    };
    tokio::task::spawn_blocking(move || {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(ansi.as_bytes()).map_err(|e| e.to_string())?;
        let compressed = encoder.finish().map_err(|e| e.to_string())?;
        // Atomic write: write to .tmp then rename
        let tmp_path = path.with_extension("ansi.gz.tmp");
        std::fs::write(&tmp_path, &compressed).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp_path, &path).map_err(|e| {
            let _ = std::fs::remove_file(&tmp_path);
            e.to_string()
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scrollback_load(
    session_id: String,
    max_bytes: Option<usize>,
) -> Result<Option<String>, String> {
    let max_bytes = max_bytes.unwrap_or(MAX_UNCOMPRESSED_BYTES).min(HARD_MAX_UNCOMPRESSED_BYTES);
    let path = match scrollback_path(&session_id) {
        Ok(p) => p,
        Err(_) => return Ok(None), // invalid id — graceful
    };
    tokio::task::spawn_blocking(move || {
        if !path.exists() {
            return Ok(None);
        }
        let compressed = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut ansi = String::new();
        match decoder.read_to_string(&mut ansi) {
            Ok(_) => {
                if ansi.len() > max_bytes {
                    let _ = std::fs::remove_file(&path);
                    return Ok(None);
                }
                Ok(Some(ansi))
            }
            Err(_) => {
                // Corrupt file — delete it so it doesn't persist
                let _ = std::fs::remove_file(&path);
                Ok(None)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scrollback_cleanup(
    known_session_ids: Vec<String>,
    max_age_secs: Option<u64>,
) -> Result<(), String> {
    let dir = data_dir().join("scrollback");
    tokio::task::spawn_blocking(move || {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => return, // directory doesn't exist yet — nothing to clean
        };
        let known: std::collections::HashSet<&str> =
            known_session_ids.iter().map(|s| s.as_str()).collect();
        let max_age = max_age_secs.filter(|&s| s > 0).map(Duration::from_secs);
        let now = std::time::SystemTime::now();
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            // Delete stale temp files unconditionally
            if name_str.ends_with(".ansi.gz.tmp") {
                let _ = std::fs::remove_file(entry.path());
                continue;
            }
            let Some(stem) = name_str.strip_suffix(".ansi.gz") else { continue };
            if !known.contains(stem) {
                let _ = std::fs::remove_file(entry.path());
                continue;
            }
            // Known (active) session, but old enough to fall outside the
            // configured retention window — delete it too.
            if let Some(max_age) = max_age {
                let age = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|m| now.duration_since(m).ok());
                if age.is_some_and(|age| age > max_age) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    })
    .await
    .ok(); // spawn_blocking join error is non-fatal
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_scrollback_returns_input_unchanged_when_within_budget() {
        let ansi = "line one\nline two\n";
        assert_eq!(truncate_scrollback(ansi, 1024), ansi);
    }

    #[test]
    fn truncate_scrollback_keeps_most_recent_content_with_notice() {
        // OVERFLOW_NOTICE itself is 82 bytes, so the input needs to be large
        // enough that a budget which comfortably exceeds the notice can still
        // land short of the whole content — six 20-byte lines (120 bytes)
        // against a 110-byte max_bytes leaves room for exactly the last line.
        let lines: Vec<String> = ('a'..='f').map(|c| c.to_string().repeat(19) + "\n").collect();
        let ansi = lines.concat();
        let max_bytes = OVERFLOW_NOTICE.len() + 28;
        let result = truncate_scrollback(&ansi, max_bytes);
        assert!(result.len() <= max_bytes, "result must fit max_bytes, got {}", result.len());
        assert!(result.starts_with(OVERFLOW_NOTICE));
        // The most recent line should survive the cut.
        assert!(result.ends_with(&lines[5]));
        // The oldest content should be gone.
        assert!(!result.contains(&lines[0]));
    }

    #[test]
    fn truncate_scrollback_resumes_from_next_line_boundary() {
        // Ten 20-byte filler lines followed by a distinct final line — the
        // byte-offset cut point lands mid-way through the last filler line,
        // so the partial line before the next '\n' must be dropped entirely
        // rather than emitting a broken fragment.
        let filler = "X".repeat(19) + "\n";
        let ansi = format!("{}{}", filler.repeat(10), "FINAL-LINE\n");
        let max_bytes = OVERFLOW_NOTICE.len() + 15;
        let result = truncate_scrollback(&ansi, max_bytes);
        assert!(!result.contains('X'));
        assert!(result.ends_with("FINAL-LINE\n"));
    }

    #[test]
    fn truncate_scrollback_handles_budget_smaller_than_notice() {
        let ansi = "some scrollback content that is too long to keep";
        let result = truncate_scrollback(ansi, 5);
        assert_eq!(result, "");
    }

    #[test]
    fn truncate_scrollback_never_splits_a_multibyte_char() {
        // Each "é" is 2 bytes in UTF-8 — a naive byte-index cut could land
        // inside one and panic (or corrupt output).
        let ansi = "é".repeat(50);
        let max_bytes = OVERFLOW_NOTICE.len() + 10;
        let result = truncate_scrollback(&ansi, max_bytes);
        // Must not panic above, and must still be valid UTF-8 (guaranteed by
        // the String type itself) with a sane length.
        assert!(result.len() <= max_bytes + OVERFLOW_NOTICE.len());
    }
}
