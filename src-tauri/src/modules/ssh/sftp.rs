use crate::modules::errors::LabonairError;
use crate::modules::fs::file::ReadResult;
use crate::modules::sftp::net_error::is_network_error;
use crate::modules::ssh::SshState;
use crate::modules::ssh::shell::shell_quote;
use russh_sftp::protocol::OpenFlags;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Same size cap `prepare_remote_edit` uses — shared convention for
/// "reasonable to pull an entire remote file into memory over SFTP" across
/// both the remote-edit and one-shot-read (AI attach) code paths.
const MAX_REMOTE_READ_BYTES: u64 = 5 * 1024 * 1024;

/// Classifies a raw SFTP/exec error. Network-level failures remove the dead
/// session from the unified `SshState` and emit `ssh_connection_lost` — the
/// same event `pty.rs` emits for PTY sessions and the transfer worker emits
/// for failed jobs — so every browsing surface (sidebar tree, SFTP tab)
/// reacts the same way to a dropped connection instead of just showing a
/// one-off error toast.
fn handle_sftp_error(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, SshState>,
    session_id: &str,
    e: String,
) -> LabonairError {
    if is_network_error(&e) {
        if let Ok(mut map) = state.0.lock() {
            map.remove(session_id);
        }
        use tauri::Emitter;
        let _ = app.emit(
            "ssh_connection_lost",
            serde_json::json!({ "session_id": session_id, "reason": e }),
        );
        LabonairError::NetworkError(e)
    } else {
        LabonairError::Internal(e)
    }
}

/// Extracts the session's lazily-opened SFTP subsystem handle. Mirrors the
/// old `get_sftp_inner_arc!` macro, but now reads out of the unified
/// `SshState` map instead of a dedicated `SftpState` — the session itself is
/// looked up and its `Arc` clone released from the outer lock immediately, so
/// no long-held lock blocks other sessions' operations.
fn get_sftp_session_arc(
    state: &tauri::State<'_, SshState>,
    session_id: &str,
) -> Result<Arc<russh_sftp::client::SftpSession>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map
        .get(session_id)
        .ok_or_else(|| format!("no SSH session for tab {session_id}"))?;
    session
        .sftp
        .get()
        .cloned()
        .ok_or_else(|| "no SFTP session for tab".to_string())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: i64,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub permissions: String,
}

fn mode_to_string(mode: u32) -> String {
    let chars = [
        (0o400, 'r'), (0o200, 'w'), (0o100, 'x'),
        (0o040, 'r'), (0o020, 'w'), (0o010, 'x'),
        (0o004, 'r'), (0o002, 'w'), (0o001, 'x'),
    ];
    chars
        .iter()
        .map(|(bit, ch)| if mode & bit != 0 { *ch } else { '-' })
        .collect()
}

/// Lists and normalizes one directory's entries. Shared by `sftp_read_dir`
/// and `sftp_read_dir_page` so the symlink-resolution/sort logic only lives
/// in one place.
async fn list_dir_entries(
    sftp: &russh_sftp::client::SftpSession,
    path: &str,
) -> Result<Vec<FileNode>, String> {
    let entries = sftp.read_dir(path).await.map_err(|e| e.to_string())?;

    let mut files: Vec<FileNode> = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        let full_path = entry.path();
        let metadata = entry.metadata();
        let is_symlink = metadata.is_symlink();
        let (symlink_target, resolved_is_dir) = if is_symlink {
            // readlink gives the raw target (may be relative).
            let raw_target = sftp.read_link(full_path.as_str()).await.ok();
            // Resolve relative targets against the entry's parent directory
            // so navigation works regardless of how the symlink was created.
            let abs_target = raw_target.as_deref().map(|t| {
                if t.starts_with('/') {
                    t.to_string()
                } else {
                    let parent = std::path::Path::new(&full_path)
                        .parent()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| "/".to_string());
                    format!("{}/{}", parent.trim_end_matches('/'), t)
                }
            });
            // stat() follows the symlink; tells us if the target is a dir.
            let is_target_dir = match abs_target.as_deref() {
                Some(t) => sftp.metadata(t).await.map(|m| m.is_dir()).unwrap_or(false),
                None => false,
            };
            (abs_target, is_target_dir)
        } else {
            (None, metadata.is_dir())
        };
        files.push(FileNode {
            path: full_path,
            name,
            size: metadata.size.unwrap_or(0),
            modified_at: metadata.mtime.unwrap_or(0) as i64,
            is_dir: resolved_is_dir,
            is_symlink,
            symlink_target,
            permissions: mode_to_string(metadata.permissions.unwrap_or(0)),
        });
    }

    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

#[tauri::command]
pub async fn sftp_read_dir(
    session_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<FileNode>, LabonairError> {
    log::debug!("[SFTP] sftp_read_dir: tab={} path={}", session_id, path);
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let files = list_dir_entries(&sftp, &path).await?;
        log::debug!("[SFTP] readdir complete — {} entries.", files.len());
        Ok(files)
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Default page size for `sftp_read_dir_page` — large enough that ordinary
/// directories never paginate, small enough that a directory with tens of
/// thousands of entries doesn't serialize a huge array over IPC in one call.
const DEFAULT_PAGE_LIMIT: usize = 500;

#[derive(Debug, serde::Serialize)]
pub struct SftpReadDirPage {
    pub entries: Vec<FileNode>,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

/// Pure slicing logic, split out so it's unit-testable without a live SFTP
/// session — the actual command just does I/O then delegates here.
fn paginate_entries(mut entries: Vec<FileNode>, offset: usize, limit: usize) -> SftpReadDirPage {
    let total = entries.len();
    if offset >= total {
        return SftpReadDirPage { entries: Vec::new(), has_more: false, next_offset: None };
    }
    let end = (offset + limit).min(total);
    let has_more = end < total;
    SftpReadDirPage {
        entries: entries.drain(offset..end).collect(),
        has_more,
        next_offset: if has_more { Some(end) } else { None },
    }
}

/// Paginated variant of `sftp_read_dir`. Introduced alongside the unpaginated
/// command (not as a replacement) so the existing dual-pane SFTP tab keeps
/// using the simple, unpaginated call while the sidebar tree opts into
/// paging for very large directories.
#[tauri::command]
pub async fn sftp_read_dir_page(
    session_id: String,
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
    show_hidden: Option<bool>,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<SftpReadDirPage, LabonairError> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(DEFAULT_PAGE_LIMIT);
    // list_dir_entries never filters (sftp_read_dir's dual-pane-tab caller
    // wants everything and filters client-side itself) — dotfiles are
    // stripped here, before pagination, so offset/has_more stay correct
    // relative to what's actually visible. Mirrors fs_read_dir's local
    // filter-before-collect behavior.
    let show_hidden = show_hidden.unwrap_or(false);

    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let mut files = list_dir_entries(&sftp, &path).await?;
        if !show_hidden {
            files.retain(|f| !f.name.starts_with('.'));
        }
        Ok(paginate_entries(files, offset, limit))
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

#[tauri::command]
pub async fn sftp_rename(
    session_id: String,
    old_path: String,
    new_path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        sftp.rename(old_path, new_path).await.map_err(|e| e.to_string())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

#[tauri::command]
pub async fn sftp_delete(
    session_id: String,
    paths: Vec<String>,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        for path in &paths {
            // Try SFTP unlink (files), then rmdir (empty dirs).
            // Non-empty dirs are not supported via SFTP alone — caller should
            // recursively delete children first.
            if sftp.remove_file(path.clone()).await.is_err() {
                sftp.remove_dir(path.clone()).await.map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Splits an absolute (or relative) POSIX path into its ordered ancestor
/// directories, closest-root-first, ending with `path` itself — e.g.
/// `/a/b/c` -> `["/a", "/a/b", "/a/b/c"]`. Used to emulate `mkdir -p`, which
/// the SFTP subsystem has no direct equivalent for (its `mkdir` only ever
/// creates a single level and errors if any parent is missing).
fn mkdir_ancestors(path: &str) -> Vec<String> {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        return Vec::new();
    }
    let is_absolute = trimmed.starts_with('/');
    let mut out = Vec::new();
    let mut acc = String::new();
    for segment in trimmed.trim_start_matches('/').split('/') {
        if segment.is_empty() {
            continue;
        }
        acc = if acc.is_empty() {
            if is_absolute { format!("/{segment}") } else { segment.to_string() }
        } else {
            format!("{acc}/{segment}")
        };
        out.push(acc.clone());
    }
    out
}

#[tauri::command]
pub async fn sftp_mkdir(
    session_id: String,
    path: String,
    recursive: Option<bool>,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    let recursive = recursive.unwrap_or(false);
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        if !recursive {
            return sftp.create_dir(path.clone()).await.map_err(|e| e.to_string());
        }
        // mkdir -p semantics: create every missing ancestor, tolerate ones
        // that already exist (including `path` itself) instead of failing.
        for ancestor in mkdir_ancestors(&path) {
            if sftp.metadata(ancestor.clone()).await.is_ok() {
                continue;
            }
            if let Err(e) = sftp.create_dir(ancestor.clone()).await {
                // A concurrent mkdir (or a race with the stat() above) can still
                // land on "already exists" here — only surface a real failure.
                if sftp.metadata(ancestor.clone()).await.is_err() {
                    return Err(format!("mkdir({ancestor}) failed: {e}"));
                }
            }
        }
        Ok(())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Creates a new empty file. Fails if the file already exists — matches
/// `fs_create_file`'s local semantics so the "New File" tree action behaves
/// identically regardless of provider.
///
/// Uses an atomic `CREATE|EXCLUDE` open (mapping server-side to
/// `OpenOptions::create_new(true)`) instead of the old stat-then-create race —
/// closes the TOCTOU window where a file created between the existence check
/// and the create call would be silently overwritten.
#[tauri::command]
pub async fn sftp_create_file(
    session_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let mut file = sftp
            .open_with_flags(path.clone(), OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE)
            .await
            .map_err(|e| format!("already exists: {path} ({e})"))?;
        file.shutdown().await.map_err(|e| e.to_string())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

#[tauri::command]
pub async fn sftp_chmod(
    session_id: String,
    path: String,
    permissions: u32,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let mut meta = sftp.metadata(path.clone()).await.map_err(|e| e.to_string())?;
        meta.permissions = Some(permissions);
        sftp.set_metadata(path.clone(), meta).await.map_err(|e| e.to_string())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

#[tauri::command]
pub async fn prepare_remote_edit(
    session_id: String,
    remote_path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, LabonairError> {
    let file_data = async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let meta = sftp.metadata(remote_path.clone()).await.map_err(|e| e.to_string())?;
        let size = meta.size.unwrap_or(0);
        if size > MAX_REMOTE_READ_BYTES {
            return Err(format!(
                "File is too large for in-app editing ({size} bytes). Max 5 MB."
            ));
        }
        let mut remote_file = sftp.open(remote_path.clone()).await.map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;
        Ok::<_, String>(buf)
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))?;

    let temp_dir = std::env::temp_dir().join("labonair_remote_edits");
    std::fs::create_dir_all(&temp_dir).map_err(|e| LabonairError::Internal(e.to_string()))?;
    let file_name = std::path::Path::new(&remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let unique_id = uuid::Uuid::new_v4().to_string();
    let temp_path = temp_dir.join(format!("{}_{}", unique_id, file_name));
    std::fs::write(&temp_path, &file_data).map_err(|e| LabonairError::Internal(e.to_string()))?;
    Ok(temp_path.to_string_lossy().to_string())
}

/// Validates that `local_temp_path` is actually inside the
/// `labonair_remote_edits` temp dir `prepare_remote_edit` stages files into —
/// prevents the frontend from pointing this at an arbitrary local file
/// (upload-back) or deleting one (cleanup). Shared by `save_remote_edit` and
/// `cleanup_remote_edit_temp`.
fn validate_remote_edit_temp_path(local_temp_path: &str) -> Result<std::path::PathBuf, String> {
    let temp_dir = std::fs::canonicalize(std::env::temp_dir().join("labonair_remote_edits"))
        .unwrap_or_else(|_| std::env::temp_dir().join("labonair_remote_edits"));
    let canonical =
        std::fs::canonicalize(local_temp_path).map_err(|e| format!("invalid temp path: {e}"))?;
    if !canonical.starts_with(&temp_dir) {
        return Err("temp path is outside the allowed directory".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn save_remote_edit(
    session_id: String,
    remote_path: String,
    local_temp_path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    let canonical = validate_remote_edit_temp_path(&local_temp_path)
        .map_err(LabonairError::Internal)?;
    let data = std::fs::read(&canonical).map_err(|e| LabonairError::Internal(e.to_string()))?;

    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let mut remote_file = sftp.create(remote_path.clone()).await.map_err(|e| e.to_string())?;
        remote_file.write_all(&data).await.map_err(|e| e.to_string())?;
        // Drains pending write acks and closes the handle — without this,
        // writes queued via `write_all` are only fire-and-forget-acked in the
        // background and a mid-write server error (disk full, permission
        // denied) would never surface to the caller.
        remote_file.shutdown().await.map_err(|e| e.to_string())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Best-effort deletion of a `prepare_remote_edit` temp file, called when the
/// editor/preview tab backed by it closes. Neither `prepare_remote_edit` nor
/// `save_remote_edit` previously had a matching cleanup command, so these
/// temp files accumulated in the OS temp dir for the life of the app.
#[tauri::command]
pub async fn cleanup_remote_edit_temp(local_temp_path: String) -> Result<(), LabonairError> {
    let canonical = validate_remote_edit_temp_path(&local_temp_path)
        .map_err(LabonairError::Internal)?;
    std::fs::remove_file(&canonical).map_err(|e| LabonairError::Internal(e.to_string()))
}

/// One-shot read of a remote file's content (as opposed to `prepare_remote_edit`,
/// which stages it into a local temp file for the editor's open/save-back
/// flow) — used by the AI composer's "Attach to Agent" / "Reference in AI
/// chat" so remote file content can be attached without a temp file. Mirrors
/// `fs_read_file`'s `ReadResult` contract (text/binary/too-large + a
/// null-byte binary sniff) so the frontend can share one attach-handling path.
#[tauri::command]
pub async fn sftp_read_file_content(
    session_id: String,
    remote_path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<ReadResult, LabonairError> {
    async {
        let sftp = get_sftp_session_arc(&state, &session_id)?;
        let meta = sftp.metadata(remote_path.clone()).await.map_err(|e| e.to_string())?;
        let size = meta.size.unwrap_or(0);
        if size > MAX_REMOTE_READ_BYTES {
            return Ok(ReadResult::TooLarge { size, limit: MAX_REMOTE_READ_BYTES });
        }
        let mut remote_file = sftp.open(remote_path.clone()).await.map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;

        // Same null-byte sniff `fs_read_file` uses.
        let sniff_len = buf.len().min(8 * 1024);
        if buf[..sniff_len].contains(&0) {
            return Ok(ReadResult::Binary { size });
        }
        // Strict UTF-8, matching fs_read_file: a lossy decode would silently
        // substitute U+FFFD for invalid byte sequences before this content
        // is attached/shown, misrepresenting the file's real bytes.
        match String::from_utf8(buf) {
            Ok(content) => Ok(ReadResult::Text { content, size }),
            Err(_) => Ok(ReadResult::Binary { size }),
        }
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Run `du -sh '<path>'` on the remote server and return the human-readable size.
#[tauri::command]
pub async fn sftp_calculate_size(
    session_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, LabonairError> {
    async {
        let session = crate::get_session_arc!(state, &session_id);
        let mut channel = session
            .handle
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        channel
            .exec(true, format!("du -sh {}", shell_quote(&path)))
            .await
            .map_err(|e| e.to_string())?;

        // One loop interleaves stdout/stderr as they arrive, rather than a
        // sequential full-drain-then-drain-the-other-stream — the same
        // structural fix `ssh_exec_command` applies, since `du` can in theory
        // write diagnostics (permission-denied subpaths) to stderr while
        // still streaming its final result on stdout.
        let mut stdout_bytes: Vec<u8> = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                russh::ChannelMsg::Data { data } => stdout_bytes.extend_from_slice(&data),
                russh::ChannelMsg::ExtendedData { .. } => {}
                // `channel.wait()` returns `None` on its own once the
                // channel is fully closed — no need to break on Eof/Close
                // explicitly (and doing so would discard any later message,
                // e.g. ExitStatus, per russh's own client_exec_simple.rs
                // example).
                _ => {}
            }
        }
        let stdout = String::from_utf8_lossy(&stdout_bytes);
        Ok(stdout.split_whitespace().next().unwrap_or("?").to_string())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Execute `chown owner:group '<path>'` on the remote server.
#[tauri::command]
pub async fn sftp_chown(
    session_id: String,
    path: String,
    owner: String,
    group: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    let spec = match (owner.is_empty(), group.is_empty()) {
        (true, true)   => return Ok(()),
        (false, false) => format!("{}:{}", shell_quote(&owner), shell_quote(&group)),
        (false, true)  => format!("{}:", shell_quote(&owner)),
        (true, false)  => format!(":{}", shell_quote(&group)),
    };
    async {
        let session = crate::get_session_arc!(state, &session_id);
        let mut channel = session
            .handle
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        let cmd = format!("chown {} {}", spec, shell_quote(&path));
        channel.exec(true, cmd).await.map_err(|e| e.to_string())?;

        let mut stderr_bytes: Vec<u8> = Vec::new();
        let mut exit_code: i32 = -1;
        while let Some(msg) = channel.wait().await {
            match msg {
                russh::ChannelMsg::ExtendedData { data, ext: 1 } => stderr_bytes.extend_from_slice(&data),
                russh::ChannelMsg::ExtendedData { .. } => {}
                russh::ChannelMsg::Data { .. } => {}
                // `ExitStatus` arrives *after* `Eof` (and before `Close`), so
                // breaking on Eof/Close here would discard it and leave
                // `exit_code` stuck at -1 forever, making this command always
                // look like it failed — matches russh's own
                // client_exec_simple.rs example. `channel.wait()` returns
                // `None` on its own once the channel is fully closed, ending
                // the loop naturally.
                russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
                _ => {}
            }
        }
        let stderr_buf = String::from_utf8_lossy(&stderr_bytes).into_owned();
        if exit_code != 0 && !stderr_buf.is_empty() {
            return Err(stderr_buf.trim().to_string());
        }
        Ok(())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

/// Run `find <start_path> -iname '*<query>*' -maxdepth 5` on the remote server.
/// Returns up to 200 matching paths.
#[tauri::command]
pub async fn sftp_deep_search(
    session_id: String,
    start_path: String,
    query: String,
    state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, LabonairError> {
    async {
        let session = crate::get_session_arc!(state, &session_id);
        let mut channel = session
            .handle
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        // Build the glob as a plain Rust string and let `shell_quote` do the
        // only escaping pass — pre-escaping `query` here too would double-
        // escape any embedded `'` once `shell_quote` escapes it again.
        let glob = format!("*{query}*");
        let cmd = format!(
            "find {} -iname {} -maxdepth 5 -print 2>/dev/null | head -n 200",
            shell_quote(&start_path),
            shell_quote(&glob),
        );
        channel.exec(true, cmd).await.map_err(|e| e.to_string())?;

        let mut stdout_bytes: Vec<u8> = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                russh::ChannelMsg::Data { data } => stdout_bytes.extend_from_slice(&data),
                russh::ChannelMsg::ExtendedData { .. } => {}
                // `channel.wait()` returns `None` on its own once the
                // channel is fully closed — no need to break on Eof/Close
                // explicitly (and doing so would discard any later message
                // per russh's own client_exec_simple.rs example).
                _ => {}
            }
        }
        let stdout = String::from_utf8_lossy(&stdout_bytes);
        Ok(stdout.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect())
    }
    .await
    .map_err(|e| handle_sftp_error(&app, &state, &session_id, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(name: &str, is_dir: bool) -> FileNode {
        FileNode {
            name: name.to_string(),
            path: format!("/root/{name}"),
            size: 0,
            modified_at: 0,
            is_dir,
            is_symlink: false,
            symlink_target: None,
            permissions: String::new(),
        }
    }

    fn nodes(n: usize) -> Vec<FileNode> {
        (0..n).map(|i| node(&format!("file{i}"), false)).collect()
    }

    // --- mkdir_ancestors ---

    #[test]
    fn mkdir_ancestors_splits_absolute_path() {
        assert_eq!(
            mkdir_ancestors("/a/b/c"),
            vec!["/a".to_string(), "/a/b".to_string(), "/a/b/c".to_string()]
        );
    }

    #[test]
    fn mkdir_ancestors_handles_single_segment() {
        assert_eq!(mkdir_ancestors("/a"), vec!["/a".to_string()]);
    }

    #[test]
    fn mkdir_ancestors_handles_relative_path() {
        assert_eq!(mkdir_ancestors("a/b"), vec!["a".to_string(), "a/b".to_string()]);
    }

    #[test]
    fn mkdir_ancestors_strips_trailing_slash() {
        assert_eq!(
            mkdir_ancestors("/a/b/"),
            vec!["/a".to_string(), "/a/b".to_string()]
        );
    }

    #[test]
    fn mkdir_ancestors_root_is_empty() {
        assert_eq!(mkdir_ancestors("/"), Vec::<String>::new());
    }

    #[test]
    fn mkdir_ancestors_empty_string_is_empty() {
        assert_eq!(mkdir_ancestors(""), Vec::<String>::new());
    }

    #[test]
    fn mkdir_ancestors_collapses_repeated_slashes() {
        assert_eq!(
            mkdir_ancestors("/a//b"),
            vec!["/a".to_string(), "/a/b".to_string()]
        );
    }

    // --- paginate_entries ---

    #[test]
    fn paginate_first_page_reports_has_more() {
        let page = paginate_entries(nodes(10), 0, 4);
        assert_eq!(page.entries.len(), 4);
        assert!(page.has_more);
        assert_eq!(page.next_offset, Some(4));
        assert_eq!(page.entries[0].name, "file0");
        assert_eq!(page.entries[3].name, "file3");
    }

    #[test]
    fn paginate_last_page_reports_no_more() {
        let page = paginate_entries(nodes(10), 8, 4);
        assert_eq!(page.entries.len(), 2);
        assert!(!page.has_more);
        assert_eq!(page.next_offset, None);
    }

    #[test]
    fn paginate_offset_past_end_returns_empty() {
        let page = paginate_entries(nodes(5), 10, 4);
        assert!(page.entries.is_empty());
        assert!(!page.has_more);
        assert_eq!(page.next_offset, None);
    }

    #[test]
    fn paginate_exact_boundary_has_no_more() {
        let page = paginate_entries(nodes(8), 0, 8);
        assert_eq!(page.entries.len(), 8);
        assert!(!page.has_more);
        assert_eq!(page.next_offset, None);
    }

    #[test]
    fn paginate_empty_input_returns_empty_page() {
        let page = paginate_entries(Vec::new(), 0, 500);
        assert!(page.entries.is_empty());
        assert!(!page.has_more);
    }

    #[test]
    fn paginate_default_limit_fits_typical_directory() {
        let page = paginate_entries(nodes(200), 0, DEFAULT_PAGE_LIMIT);
        assert_eq!(page.entries.len(), 200);
        assert!(!page.has_more);
    }
}
