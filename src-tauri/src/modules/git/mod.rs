mod executor;

use crate::modules::ssh::SshState;
use crate::modules::sftp::net_error::is_network_error;
use crate::modules::ssh::shell::shell_quote;
use executor::{resolve_executor, GitExecutor, GIT_NOT_INSTALLED};
use serde::{Deserialize, Serialize};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub original_path: Option<String>, // for renames
    pub index_status: char,            // space, A, M, D, R, C, U, ?
    pub worktree_status: char,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<FileStatus>,
    pub has_conflicts: bool,
    pub merge_in_progress: bool,
    pub rebase_in_progress: bool,
    pub cherry_pick_in_progress: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub parent_hashes: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub subject: String,
    pub refs: Vec<String>, // branch names, tags
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitResult {
    pub hash: String,
    pub subject: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: String,
    pub hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffStat {
    pub path: String,
    pub added: u32,
    pub removed: u32,
    pub staged: bool,
}

/// Bundles the 5-6 read-heavy queries `useGitStatus.ts` polls on an interval
/// into a single round-trip. Locally this trades 5 process spawns for 1;
/// remotely it's the difference between 5 network round-trips and 1 — each
/// one still carries a full SSH exec's latency even though `russh`'s
/// `client::Handle` (unlike the old blocking-transport session) can serve
/// them concurrently rather than queuing — so batching remains the single
/// biggest lever for remote responsiveness.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitState {
    pub status: GitStatus,
    pub branches: Vec<Branch>,
    pub current_branch: String,
    pub stash: Vec<StashEntry>,
    pub tags: Vec<String>,
    pub diff_stats: Vec<FileDiffStat>,
}

// ─── Pure parsers (shared by the standalone commands and the bundle) ──────────

fn parse_shortstat(s: &str) -> (u32, u32, u32) {
    let mut files = 0u32;
    let mut ins = 0u32;
    let mut del = 0u32;
    for part in s.split(',') {
        let part = part.trim();
        if part.contains("file") {
            files = part.split_whitespace().next().unwrap_or("0").parse().unwrap_or(0);
        } else if part.contains("insertion") {
            ins = part.split_whitespace().next().unwrap_or("0").parse().unwrap_or(0);
        } else if part.contains("deletion") {
            del = part.split_whitespace().next().unwrap_or("0").parse().unwrap_or(0);
        }
    }
    (files, ins, del)
}

/// Parses `git status --porcelain=v1 -z` NUL-terminated output into the
/// staged/unstaged/untracked buckets `GitStatus` exposes.
fn parse_porcelain_status(raw: &[u8]) -> (Vec<FileStatus>, Vec<FileStatus>, Vec<FileStatus>, bool) {
    let raw_str = String::from_utf8_lossy(raw);
    let tokens: Vec<&str> = raw_str.split('\0').collect();

    let mut staged: Vec<FileStatus> = Vec::new();
    let mut unstaged: Vec<FileStatus> = Vec::new();
    let mut untracked: Vec<FileStatus> = Vec::new();
    let mut has_conflicts = false;

    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if token.len() < 3 {
            i += 1;
            continue;
        }
        let mut chars = token.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        let _ = chars.next();
        let filename: String = chars.collect();

        let original_path: Option<String> = if x == 'R' || x == 'C' || y == 'R' || y == 'C' {
            let orig = tokens.get(i + 1).map(|s| s.to_string()).filter(|s| !s.is_empty());
            i += 1;
            orig
        } else {
            None
        };

        if x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D') {
            has_conflicts = true;
        }

        let fs = FileStatus {
            path: filename,
            original_path,
            index_status: x,
            worktree_status: y,
        };

        if x == '?' && y == '?' {
            untracked.push(fs);
        } else {
            if x != ' ' && x != '?' {
                staged.push(fs.clone());
            }
            if y != ' ' && y != '?' {
                unstaged.push(fs);
            }
        }

        i += 1;
    }

    (staged, unstaged, untracked, has_conflicts)
}

/// Parses `<behind>\t<ahead>` from `git rev-list --count --left-right`.
fn parse_ahead_behind(s: &str) -> (u32, u32) {
    let s = s.trim();
    let parts: Vec<&str> = s.split('\t').collect();
    if parts.len() == 2 {
        let behind: u32 = parts[0].parse().unwrap_or(0);
        let ahead: u32 = parts[1].parse().unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    }
}

/// Parses the three `1`/`0` marker-check lines (MERGE_HEAD, rebase-merge or
/// rebase-apply, CHERRY_PICK_HEAD) emitted by the shared marker-check script.
fn parse_state_flags(s: &str) -> (bool, bool, bool) {
    let mut lines = s.lines().map(|l| l.trim() == "1");
    let merge = lines.next().unwrap_or(false);
    let rebase = lines.next().unwrap_or(false);
    let cherry = lines.next().unwrap_or(false);
    (merge, rebase, cherry)
}

/// The shell snippet used to answer "is a merge/rebase/cherry-pick in
/// progress" — expressed as `test -f`/`test -d` marker checks so it works
/// identically whether run locally (direct filesystem access) or on a
/// remote host (no `Path::exists()` available there, only shell tests).
const STATE_FLAGS_SCRIPT: &str = r#"GITDIR=$(git rev-parse --git-dir 2>/dev/null)
test -f "$GITDIR/MERGE_HEAD" && echo 1 || echo 0
test -d "$GITDIR/rebase-merge" -o -d "$GITDIR/rebase-apply" && echo 1 || echo 0
test -f "$GITDIR/CHERRY_PICK_HEAD" && echo 1 || echo 0"#;

/// Parses `git branch -a --format=%(refname:short)|%(HEAD)|%(upstream:short)|%(upstream:track,nobracket)`.
fn parse_branches(output: &str) -> Vec<Branch> {
    let mut branches: Vec<Branch> = Vec::new();

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.is_empty() {
            continue;
        }

        let name = parts[0].to_string();
        let is_current = parts.get(1).copied().unwrap_or("") == "*";
        let upstream_raw = parts.get(2).copied().unwrap_or("").to_string();
        let track_info = parts.get(3).copied().unwrap_or("");

        let mut ahead: u32 = 0;
        let mut behind: u32 = 0;
        if !track_info.is_empty() {
            if let Some(pos) = track_info.find("ahead ") {
                let rest = &track_info[pos + 6..];
                let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                ahead = num_str.parse().unwrap_or(0);
            }
            if let Some(pos) = track_info.find("behind ") {
                let rest = &track_info[pos + 7..];
                let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                behind = num_str.parse().unwrap_or(0);
            }
        }

        let is_remote = name.starts_with("remotes/");
        let upstream = if upstream_raw.is_empty() { None } else { Some(upstream_raw) };

        branches.push(Branch { name, is_current, is_remote, upstream, ahead, behind });
    }

    branches
}

const BRANCH_FORMAT: &str = "%(refname:short)|%(HEAD)|%(upstream:short)|%(upstream:track,nobracket)";

/// Parses the `%gs` format field into (branch, message).
fn parse_stash_gs(gs: &str) -> (String, String) {
    let rest = if let Some(r) = gs.strip_prefix("WIP on ") {
        r
    } else if let Some(r) = gs.strip_prefix("On ") {
        r
    } else {
        return (String::new(), gs.to_string());
    };
    if let Some(colon_pos) = rest.find(": ") {
        (rest[..colon_pos].to_string(), rest[colon_pos + 2..].to_string())
    } else {
        (rest.to_string(), String::new())
    }
}

/// Parses `git stash list --format=%gd%x00%gs%x00%H%x1e`.
fn parse_stash_list(output: &str) -> Vec<StashEntry> {
    let mut entries: Vec<StashEntry> = Vec::new();
    for record in output.split('\x1e') {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let parts: Vec<&str> = record.splitn(3, '\x00').collect();
        if parts.len() < 3 {
            continue;
        }
        let ref_part = parts[0].trim();
        let index: u32 = ref_part
            .trim_start_matches("stash@{")
            .trim_end_matches('}')
            .parse()
            .unwrap_or(0);
        let (branch, message) = parse_stash_gs(parts[1]);
        let hash = parts[2].trim().to_string();
        entries.push(StashEntry { index, message, branch, hash });
    }
    entries
}

const STASH_FORMAT: &str = "%gd%x00%gs%x00%H%x1e";

fn parse_tags(output: &str) -> Vec<String> {
    output.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect()
}

fn parse_numstat(output: &str, staged: bool) -> Vec<FileDiffStat> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() < 3 {
                return None;
            }
            let added = parts[0].parse::<u32>().unwrap_or(0);
            let removed = parts[1].parse::<u32>().unwrap_or(0);
            let path = parts[2].to_string();
            Some(FileDiffStat { path, added, removed, staged })
        })
        .collect()
}

/// Truncates a byte slice at a UTF-8 character boundary at or before `max` bytes.
fn safe_truncate_utf8(bytes: &[u8], max: usize) -> &[u8] {
    if bytes.len() <= max {
        return bytes;
    }
    let mut end = max;
    while end > 0 && (bytes[end] & 0xC0) == 0x80 {
        end -= 1;
    }
    &bytes[..end]
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Returns true if the given path is inside a git repository. `Err` is
/// reserved for cases where we couldn't actually determine that — the git
/// binary is missing, or the SSH/SFTP session is dead — so those aren't
/// mistaken for "not a git repo", which is a normal `Ok(false)`.
#[tauri::command]
pub async fn git_is_repo(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    match executor.run(&["rev-parse", "--git-dir"]).await {
        Ok(_) => Ok(true),
        Err(e) if e == GIT_NOT_INSTALLED || is_network_error(&e) => Err(e),
        Err(_) => Ok(false),
    }
}

/// Returns the repository root path.
#[tauri::command]
pub async fn git_get_repo_root(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["rev-parse", "--show-toplevel"]).await
}

/// Returns the full working tree status.
#[tauri::command]
pub async fn git_get_status(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<GitStatus, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let script = format!(
        "git status --porcelain=v1 -z\nprintf '\\x1d'\ngit rev-list --count --left-right '@{{upstream}}...HEAD' 2>/dev/null\nprintf '\\x1d'\n{STATE_FLAGS_SCRIPT}"
    );
    let (raw, _exit) = executor.run_shell_script(&script).await?;
    let sections: Vec<&[u8]> = raw.split(|b| *b == 0x1d).collect();
    let porcelain = sections.first().copied().unwrap_or(&[]);
    let ahead_behind_str = sections.get(1).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let flags_str = sections.get(2).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();

    let (staged, unstaged, untracked, has_conflicts) = parse_porcelain_status(porcelain);
    let (ahead, behind) = parse_ahead_behind(&ahead_behind_str);
    let (merge_in_progress, rebase_in_progress, cherry_pick_in_progress) = parse_state_flags(&flags_str);

    Ok(GitStatus {
        staged,
        unstaged,
        untracked,
        has_conflicts,
        merge_in_progress,
        rebase_in_progress,
        cherry_pick_in_progress,
        ahead,
        behind,
    })
}

/// Returns the current branch name, or "HEAD detached at <hash>" if detached.
#[tauri::command]
pub async fn git_get_current_branch(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let branch = executor.run(&["branch", "--show-current"]).await?;
    if branch.is_empty() {
        let hash = executor.run(&["rev-parse", "--short", "HEAD"]).await?;
        Ok(format!("HEAD detached at {hash}"))
    } else {
        Ok(branch)
    }
}

/// Returns all branches (local and remote).
#[tauri::command]
pub async fn git_get_branches(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<Branch>, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let output = executor.run(&["branch", "-a", &format!("--format={BRANCH_FORMAT}")]).await?;
    Ok(parse_branches(&output))
}

/// Returns the diff for a specific file, either staged or unstaged.
///
/// `is_untracked` files have nothing in the index to diff against, so a
/// plain `git diff` always returns empty — instead this diffs against
/// `/dev/null` with `--no-index` so the whole file shows up as additions.
/// `--no-index` exits 1 when the two sides differ (not just on error), so
/// that exit code is tolerated here rather than treated as a failure.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn git_get_diff(
    path: String,
    file: String,
    staged: bool,
    ignore_whitespace: Option<bool>,
    is_untracked: Option<bool>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024;
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);

    let stdout = if is_untracked.unwrap_or(false) {
        let mut args: Vec<&str> = vec!["diff", "--no-index"];
        if ignore_whitespace.unwrap_or(false) {
            args.push("-w");
        }
        args.push("--");
        args.push("/dev/null");
        args.push(&file);
        executor.run_raw_tolerant(&args, &[1]).await?
    } else {
        let mut args: Vec<&str> = if staged { vec!["diff", "--cached"] } else { vec!["diff"] };
        if ignore_whitespace.unwrap_or(false) {
            args.push("-w");
        }
        args.push("--");
        args.push(&file);
        executor.run_raw(&args).await?
    };

    Ok(truncate_diff(&stdout, MAX_DIFF_BYTES))
}

fn truncate_diff(stdout: &[u8], max: usize) -> String {
    if stdout.len() > max {
        let truncated = String::from_utf8_lossy(safe_truncate_utf8(stdout, max)).into_owned();
        format!("{truncated}\n\n[diff truncated — output exceeded 200 KB]")
    } else {
        String::from_utf8_lossy(stdout).into_owned()
    }
}

/// Stages a specific file.
#[tauri::command]
pub async fn git_stage_file(
    path: String,
    file: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["add", "--", &file]).await.map(|_| ())
}

/// Unstages a specific file.
#[tauri::command]
pub async fn git_unstage_file(
    path: String,
    file: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["restore", "--staged", "--", &file]).await.map(|_| ())
}

/// Stages all changes (equivalent to `git add -A`).
#[tauri::command]
pub async fn git_stage_all(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["add", "-A"]).await.map(|_| ())
}

/// Unstages all staged changes. Falls back to `git rm --cached -r .` for
/// repositories with no commits yet.
#[tauri::command]
pub async fn git_unstage_all(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    match executor.run(&["reset", "HEAD"]).await {
        Ok(_) => Ok(()),
        Err(_) => executor.run(&["rm", "--cached", "-r", "."]).await.map(|_| ()),
    }
}

/// Discards worktree changes for a specific file.
#[tauri::command]
pub async fn git_discard_file(
    path: String,
    file: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["restore", "--", &file]).await.map(|_| ())
}

/// Creates a commit with the given message. Supports `--amend`.
#[tauri::command]
pub async fn git_commit(
    path: String,
    message: String,
    amend: bool,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<CommitResult, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);

    let mut args: Vec<&str> = vec!["commit"];
    if amend {
        args.push("--amend");
    }
    args.push("-m");
    args.push(&message);
    executor.run(&args).await?;

    let log = executor.run(&["log", "-1", "--format=%H|%s"]).await?;
    let mut parts = log.splitn(2, '|');
    let hash = parts.next().unwrap_or("").to_string();
    let subject = parts.next().unwrap_or("").to_string();

    Ok(CommitResult { hash, subject })
}

/// Pushes to a remote. Defaults to `origin` and current branch.
#[tauri::command]
pub async fn git_push(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    let mut args: Vec<&str> = vec!["push", &remote_str];
    if let Some(ref b) = branch {
        args.push(b);
    }
    executor.run_merged(&args).await
}

/// Pulls from the configured upstream.
#[tauri::command]
pub async fn git_pull(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run_merged(&["pull"]).await
}

/// Fetches from all remotes.
#[tauri::command]
pub async fn git_fetch(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run_merged(&["fetch", "--all"]).await
}

/// Aborts an in-progress merge, rebase, or cherry-pick.
#[tauri::command]
pub async fn git_abort(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let (raw, _exit) = executor.run_shell_script(STATE_FLAGS_SCRIPT).await?;
    let flags_str = String::from_utf8_lossy(&raw).into_owned();
    let (merge, rebase, cherry) = parse_state_flags(&flags_str);

    if merge {
        return executor.run(&["merge", "--abort"]).await.map(|_| ());
    }
    if rebase {
        return executor.run(&["rebase", "--abort"]).await.map(|_| ());
    }
    if cherry {
        return executor.run(&["cherry-pick", "--abort"]).await.map(|_| ());
    }
    Err("no merge, rebase, or cherry-pick in progress to abort".to_string())
}

/// Continues an in-progress merge, rebase, or cherry-pick (e.g. after
/// resolving conflicts).
#[tauri::command]
pub async fn git_continue(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let (raw, _exit) = executor.run_shell_script(STATE_FLAGS_SCRIPT).await?;
    let flags_str = String::from_utf8_lossy(&raw).into_owned();
    let (merge, rebase, cherry) = parse_state_flags(&flags_str);

    if merge {
        return executor.run(&["merge", "--continue"]).await.map(|_| ());
    }
    if rebase {
        return executor.run(&["rebase", "--continue"]).await.map(|_| ());
    }
    if cherry {
        return executor.run(&["cherry-pick", "--continue"]).await.map(|_| ());
    }
    Err("no merge, rebase, or cherry-pick in progress to continue".to_string())
}

/// Returns the commit log.
#[tauri::command]
pub async fn git_get_log(
    path: String,
    limit: Option<u32>,
    all_branches: bool,
    session_id: Option<String>,
    skip: Option<usize>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<CommitInfo>, String> {
    // Remote page size defaults lower than local's 500 — a single exec must
    // finish within the session's existing 15s timeout, and remote round-trip
    // + remote CPU cost is higher per commit than a local process.
    let default_limit = if session_id.is_some() { 200 } else { 500 };
    let n = limit.unwrap_or(default_limit).to_string();
    let skip_str = skip.map(|s| s.to_string());
    let format = "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D".to_string();

    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);

    let mut args: Vec<&str> = vec!["log"];
    if all_branches {
        args.push("--all");
    }
    if let Some(ref s) = skip_str {
        args.push("--skip");
        args.push(s);
    }
    args.push("-n");
    args.push(&n);
    args.push(&format);
    args.push("--shortstat");

    let raw = executor.run(&args).await?;

    let mut commits: Vec<CommitInfo> = Vec::new();

    for record in raw.split('\x1e') {
        let record = record.trim_matches('\n').trim();
        if record.is_empty() {
            continue;
        }

        let (header, stat_part) = record.split_once('\n').unwrap_or((record, ""));

        let parts: Vec<&str> = header.splitn(7, '\x00').collect();
        if parts.len() < 7 {
            continue;
        }

        let hash = parts[0].to_string();
        let short_hash = hash.chars().take(7).collect();

        let parent_hashes: Vec<String> = parts[1]
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();

        let author_name = parts[2].to_string();
        let author_email = parts[3].to_string();
        let timestamp: i64 = parts[4].parse().unwrap_or(0);
        let subject = parts[5].to_string();

        let refs_raw = parts[6];
        let refs: Vec<String> = refs_raw
            .split(',')
            .map(|r| r.trim())
            .filter(|r| !r.is_empty())
            .map(|r| {
                if let Some(stripped) = r.strip_prefix("HEAD -> ") {
                    stripped.to_string()
                } else if let Some(stripped) = r.strip_prefix("tag: ") {
                    stripped.to_string()
                } else {
                    r.to_string()
                }
            })
            .collect();

        let (files_changed, insertions, deletions) = parse_shortstat(stat_part.trim());

        commits.push(CommitInfo {
            hash,
            short_hash,
            parent_hashes,
            author_name,
            author_email,
            timestamp,
            subject,
            refs,
            files_changed,
            insertions,
            deletions,
        });
    }

    Ok(commits)
}

/// Returns the full detail (message + stat) of a single commit.
#[tauri::command]
pub async fn git_get_commit_detail(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["show", "--stat", "--format=%B", &hash]).await
}

/// Returns numstat output for a single commit: `additions\tdeletions\tpath` per line.
#[tauri::command]
pub async fn git_get_commit_numstat(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["show", "--numstat", "--format=", &hash]).await
}

/// Returns the fetch URL of the given remote (defaults to "origin").
#[tauri::command]
pub async fn git_get_remote_url(
    path: String,
    remote: Option<String>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let r = remote.unwrap_or_else(|| "origin".to_string());
    executor.run(&["remote", "get-url", &r]).await
}

// ─── Branch Management ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_checkout_branch(
    path: String,
    branch: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["checkout", &branch]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_create_branch(
    path: String,
    name: String,
    from_ref: Option<String>,
    checkout: bool,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let mut args: Vec<&str> = if checkout { vec!["checkout", "-b", &name] } else { vec!["branch", &name] };
    if let Some(ref r) = from_ref {
        args.push(r);
    }
    executor.run(&args).await.map(|_| ())
}

#[tauri::command]
pub async fn git_delete_branch(
    path: String,
    name: String,
    force: bool,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let flag = if force { "-D" } else { "-d" };
    executor.run(&["branch", flag, &name]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_rename_branch(
    path: String,
    old_name: String,
    new_name: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["branch", "-m", &old_name, &new_name]).await.map(|_| ())
}

// ─── Stash Commands ───────────────────────────────────────────────────────────

/// Resolves a stash commit hash to its current numeric index.
async fn find_stash_index_by_hash(executor: &GitExecutor, hash: &str) -> Result<u32, String> {
    let output = executor.run(&["stash", "list", "--format=%gd|%H"]).await?;
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(2, '|').collect();
        if parts.len() == 2 && parts[1].trim() == hash {
            let idx = parts[0]
                .trim_start_matches("stash@{")
                .trim_end_matches('}')
                .parse::<u32>()
                .unwrap_or(0);
            return Ok(idx);
        }
    }
    Err(format!("stash entry '{}' no longer exists — it may have already been dropped", hash))
}

#[tauri::command]
pub async fn git_stash_push(
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let mut args: Vec<&str> = vec!["stash", "push"];
    if include_untracked.unwrap_or(true) {
        args.push("--include-untracked");
    }
    if let Some(ref msg) = message {
        args.push("-m");
        args.push(msg);
    }
    executor.run(&args).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_list(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<StashEntry>, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let output = executor.run(&["stash", "list", &format!("--format={STASH_FORMAT}")]).await?;
    Ok(parse_stash_list(&output))
}

#[tauri::command]
pub async fn git_stash_pop(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let idx = find_stash_index_by_hash(&executor, &hash).await?;
    executor.run(&["stash", "pop", &format!("stash@{{{}}}", idx)]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_apply(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let idx = find_stash_index_by_hash(&executor, &hash).await?;
    executor.run(&["stash", "apply", &format!("stash@{{{}}}", idx)]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_drop(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let idx = find_stash_index_by_hash(&executor, &hash).await?;
    executor.run(&["stash", "drop", &format!("stash@{{{}}}", idx)]).await.map(|_| ())
}

// ─── Diff + Push Variants ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_commit_diff(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024;
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let stdout = executor.run_raw(&["show", "--format=", "--patch", &hash]).await?;
    Ok(truncate_diff(&stdout, MAX_DIFF_BYTES))
}

#[tauri::command]
pub async fn git_push_force_with_lease(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    let mut args: Vec<&str> = vec!["push", "--force-with-lease", &remote_str];
    if let Some(ref b) = branch {
        args.push(b);
    }
    executor.run_merged(&args).await
}

#[tauri::command]
pub async fn git_push_set_upstream(
    path: String,
    remote: String,
    branch: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run_merged(&["push", "--set-upstream", &remote, &branch]).await
}

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_cherry_pick(
    path: String,
    hash: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["cherry-pick", &hash]).await.map(|_| ())
}

// ─── Tag Management ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_tags(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let output = executor.run(&["tag", "--sort=-version:refname"]).await?;
    Ok(parse_tags(&output))
}

#[tauri::command]
pub async fn git_create_tag(
    path: String,
    name: String,
    message: Option<String>,
    hash: Option<String>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let mut args: Vec<&str> = vec!["tag"];
    if let Some(ref msg) = message {
        args.push("-a");
        args.push(&name);
        if let Some(ref h) = hash {
            args.push(h);
        }
        args.push("-m");
        args.push(msg);
    } else {
        args.push(&name);
        if let Some(ref h) = hash {
            args.push(h);
        }
    }
    executor.run(&args).await.map(|_| ())
}

#[tauri::command]
pub async fn git_delete_tag(
    path: String,
    name: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["tag", "-d", &name]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_push_tag(
    path: String,
    name: String,
    remote: Option<String>,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    executor.run_merged(&["push", &remote_str, &name]).await
}

// ─── Diff Stats ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_diff_stats(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<Vec<FileDiffStat>, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let staged_out = executor.run(&["diff", "--cached", "--numstat"]).await.unwrap_or_default();
    let unstaged_out = executor.run(&["diff", "--numstat"]).await.unwrap_or_default();
    let mut stats = parse_numstat(&staged_out, true);
    stats.extend(parse_numstat(&unstaged_out, false));
    Ok(stats)
}

/// Bundles status + branches + stash + tags + diffstats into a single
/// invocation — see `WorkspaceGitState` for why this exists.
#[tauri::command]
pub async fn git_get_workspace_state(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<WorkspaceGitState, String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);

    let script = format!(
        "git status --porcelain=v1 -z\n\
         printf '\\x1d'\n\
         git branch -a --format='{BRANCH_FORMAT}'\n\
         printf '\\x1d'\n\
         git stash list --format='{STASH_FORMAT}'\n\
         printf '\\x1d'\n\
         git tag --sort=-version:refname\n\
         printf '\\x1d'\n\
         git diff --cached --numstat\n\
         printf '\\x1c'\n\
         git diff --numstat\n\
         printf '\\x1d'\n\
         git rev-list --count --left-right '@{{upstream}}...HEAD' 2>/dev/null\n\
         printf '\\x1d'\n\
         {STATE_FLAGS_SCRIPT}\n\
         printf '\\x1d'\n\
         git branch --show-current\n\
         printf '\\x1d'\n\
         git rev-parse --short HEAD 2>/dev/null"
    );

    let (raw, _exit) = executor.run_shell_script(&script).await?;
    let sections: Vec<&[u8]> = raw.split(|b| *b == 0x1d).collect();

    let porcelain = sections.first().copied().unwrap_or(&[]);
    let branches_str = sections.get(1).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let stash_str = sections.get(2).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let tags_str = sections.get(3).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let diffstats_raw = sections.get(4).copied().unwrap_or(&[]);
    let ahead_behind_str = sections.get(5).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let flags_str = sections.get(6).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let show_current_str = sections.get(7).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let short_hash_str = sections.get(8).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();

    let (staged, unstaged, untracked, has_conflicts) = parse_porcelain_status(porcelain);
    let (ahead, behind) = parse_ahead_behind(&ahead_behind_str);
    let (merge_in_progress, rebase_in_progress, cherry_pick_in_progress) = parse_state_flags(&flags_str);

    let status = GitStatus {
        staged,
        unstaged,
        untracked,
        has_conflicts,
        merge_in_progress,
        rebase_in_progress,
        cherry_pick_in_progress,
        ahead,
        behind,
    };

    let branches = parse_branches(&branches_str);
    // Same detached-HEAD-safe derivation as `git_get_current_branch`: `branch
    // --show-current` is empty while detached (it never invents a synthetic
    // branch name), unlike `git branch -a`'s `(HEAD detached at <hash>)`
    // entry, which `parse_branches` would otherwise surface as a bogus
    // "current" branch name.
    let show_current = show_current_str.trim();
    let current_branch = if !show_current.is_empty() {
        show_current.to_string()
    } else {
        let short_hash = short_hash_str.trim();
        if short_hash.is_empty() {
            String::new()
        } else {
            format!("HEAD detached at {short_hash}")
        }
    };
    let stash = parse_stash_list(&stash_str);
    let tags = parse_tags(&tags_str);

    let diffstats_parts: Vec<&[u8]> = diffstats_raw.splitn(2, |b| *b == 0x1c).collect();
    let staged_numstat = diffstats_parts.first().map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let unstaged_numstat = diffstats_parts.get(1).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let mut diff_stats = parse_numstat(&staged_numstat, true);
    diff_stats.extend(parse_numstat(&unstaged_numstat, false));

    Ok(WorkspaceGitState { status, branches, current_branch, stash, tags, diff_stats })
}

/// Builds a POSIX-sh script that appends `entry` to a file at relative path
/// `rel_file` inside the repo (`.gitignore` or `.git/info/exclude`), unless
/// any of `dedup_against` already matches a line verbatim. Mirrors the local
/// codepath's "add a leading newline only if the file doesn't already end in
/// one" behavior. Used by the remote branch of both gitignore commands below
/// — `GitExecutor::run_shell_script` already handles arbitrary shell scripts
/// via `bash -lc`/`sh -c`, so no raw SFTP write code is needed here.
fn build_gitignore_append_script(rel_file: &str, entry: &str, dedup_against: &[&str]) -> String {
    let f_quoted = shell_quote(rel_file);
    let entry_quoted = shell_quote(entry);
    let dedup_checks: Vec<String> = dedup_against
        .iter()
        .map(|d| format!("grep -qxF -- {} \"$f\"", shell_quote(d)))
        .collect();
    format!(
        "f={f_quoted}; if [ -f \"$f\" ] && {{ {dedup}; }}; then exit 0; fi; \
         if [ -s \"$f\" ] && [ -n \"$(tail -c1 \"$f\")\" ]; then printf '\\n' >> \"$f\"; fi; \
         printf '%s\\n' {entry_quoted} >> \"$f\"",
        dedup = dedup_checks.join(" || "),
    )
}

#[tauri::command]
pub async fn git_add_to_gitignore(
    path: String,
    file: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let safe_file = file.replace(['\n', '\r', '\0'], "");
    if safe_file.is_empty() {
        return Err("file path cannot be empty".to_string());
    }
    let entry = format!("/{}", safe_file.trim_start_matches('/'));

    if session_id.is_none() {
        use std::fs::OpenOptions;
        use std::io::Write;

        let canonical = std::fs::canonicalize(&path).map_err(|e| format!("invalid path: {e}"))?;
        if !canonical.is_dir() {
            return Err(format!("not a directory: {path}"));
        }
        let gitignore_path = canonical.join(".gitignore");
        let existing = std::fs::read_to_string(&gitignore_path).unwrap_or_default();

        if existing.lines().any(|l| l.trim() == entry.trim() || l.trim() == safe_file.trim()) {
            return Ok(());
        }

        let mut f = OpenOptions::new().create(true).append(true).open(&gitignore_path).map_err(|e| e.to_string())?;

        if !existing.is_empty() && !existing.ends_with('\n') {
            writeln!(f).map_err(|e| e.to_string())?;
        }
        writeln!(f, "{}", entry).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let script = build_gitignore_append_script(".gitignore", &entry, &[&entry, &safe_file]);
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let (_, exit_code) = executor.run_shell_script(&script).await?;
    if exit_code != 0 {
        return Err(format!("adding .gitignore entry failed (exit code {exit_code})"));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_add_to_exclude(
    path: String,
    file: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let safe_file = file.replace(['\n', '\r', '\0'], "");
    if safe_file.is_empty() {
        return Err("file path cannot be empty".to_string());
    }
    let entry = safe_file.trim_start_matches('/').to_string();

    if session_id.is_none() {
        use std::fs::OpenOptions;
        use std::io::Write;

        let canonical = std::fs::canonicalize(&path).map_err(|e| format!("invalid path: {e}"))?;
        let exclude_path = canonical.join(".git/info/exclude");
        let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();

        if existing.lines().any(|l| l.trim() == entry.trim()) {
            return Ok(());
        }

        let mut f = OpenOptions::new().create(true).append(true).open(&exclude_path).map_err(|e| e.to_string())?;

        if !existing.is_empty() && !existing.ends_with('\n') {
            writeln!(f).map_err(|e| e.to_string())?;
        }
        writeln!(f, "{}", entry).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let script = build_gitignore_append_script(".git/info/exclude", &entry, &[&entry]);
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    let (_, exit_code) = executor.run_shell_script(&script).await?;
    if exit_code != 0 {
        return Err(format!("adding .git/info/exclude entry failed (exit code {exit_code})"));
    }
    Ok(())
}

/// Initializes a new repository at `path` (local or remote). Replaces the
/// old direct `shell_run_command("git init", ...)` bypass in
/// `NoRepoState.tsx`, which only ever ran locally regardless of target.
#[tauri::command]
pub async fn git_init(
    path: String,
    session_id: Option<String>,
    sftp_state: tauri::State<'_, SshState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let executor = resolve_executor(path, session_id, sftp_state.inner().clone(), app);
    executor.run(&["init"]).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortstat_parses_all_fields() {
        assert_eq!(parse_shortstat("3 files changed, 10 insertions(+), 4 deletions(-)"), (3, 10, 4));
    }

    #[test]
    fn shortstat_handles_missing_fields() {
        assert_eq!(parse_shortstat("1 file changed, 1 insertion(+)"), (1, 1, 0));
        assert_eq!(parse_shortstat(""), (0, 0, 0));
    }

    #[test]
    fn stash_gs_parses_wip_form() {
        assert_eq!(parse_stash_gs("WIP on main: abc123 fix stuff"), ("main".to_string(), "abc123 fix stuff".to_string()));
    }

    #[test]
    fn stash_gs_parses_on_form() {
        assert_eq!(parse_stash_gs("On feature/x: my message"), ("feature/x".to_string(), "my message".to_string()));
    }

    #[test]
    fn stash_gs_falls_back_when_unrecognized() {
        assert_eq!(parse_stash_gs("some custom message"), (String::new(), "some custom message".to_string()));
    }

    #[test]
    fn ahead_behind_parses_both() {
        assert_eq!(parse_ahead_behind("2\t3"), (3, 2));
    }

    #[test]
    fn ahead_behind_defaults_when_malformed() {
        assert_eq!(parse_ahead_behind(""), (0, 0));
        assert_eq!(parse_ahead_behind("garbage"), (0, 0));
    }

    #[test]
    fn state_flags_parses_three_lines() {
        assert_eq!(parse_state_flags("1\n0\n1"), (true, false, true));
        assert_eq!(parse_state_flags("0\n0\n0"), (false, false, false));
    }

    #[test]
    fn state_flags_defaults_when_short() {
        assert_eq!(parse_state_flags("1"), (true, false, false));
        assert_eq!(parse_state_flags(""), (false, false, false));
    }

    #[test]
    fn porcelain_status_splits_staged_unstaged_untracked() {
        let raw = b"M  staged.txt\0 M unstaged.txt\0?? untracked.txt\0";
        let (staged, unstaged, untracked, conflicts) = parse_porcelain_status(raw);
        assert_eq!(staged.len(), 1);
        assert_eq!(unstaged.len(), 1);
        assert_eq!(untracked.len(), 1);
        assert!(!conflicts);
    }

    #[test]
    fn porcelain_status_detects_conflicts() {
        let raw = b"UU conflict.txt\0";
        let (_, _, _, conflicts) = parse_porcelain_status(raw);
        assert!(conflicts);
    }

    #[test]
    fn porcelain_status_handles_rename_with_original_path() {
        let raw = b"R  new.txt\0old.txt\0";
        let (staged, _, _, _) = parse_porcelain_status(raw);
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].original_path.as_deref(), Some("old.txt"));
    }

    #[test]
    fn branches_parses_current_and_upstream_tracking() {
        let raw = "main|*|origin/main|ahead 2, behind 1\nfeature|.|.|";
        let branches = parse_branches(raw);
        assert_eq!(branches.len(), 2);
        assert!(branches[0].is_current);
        assert_eq!(branches[0].ahead, 2);
        assert_eq!(branches[0].behind, 1);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
    }

    #[test]
    fn stash_list_parses_multiple_entries_separated_by_record_sep() {
        let raw = "stash@{0}\0WIP on main: abc first\0hash1\x1estash@{1}\0On dev: second\0hash2\x1e";
        let entries = parse_stash_list(raw);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].index, 0);
        assert_eq!(entries[0].branch, "main");
        assert_eq!(entries[1].index, 1);
        assert_eq!(entries[1].hash, "hash2");
    }

    #[test]
    fn numstat_parses_added_removed_path() {
        let stats = parse_numstat("3\t1\tfoo.txt\n0\t5\tbar.txt", false);
        assert_eq!(stats.len(), 2);
        assert_eq!(stats[0].added, 3);
        assert_eq!(stats[0].removed, 1);
        assert_eq!(stats[0].path, "foo.txt");
        assert!(!stats[0].staged);
    }

    #[test]
    fn safe_truncate_utf8_backs_off_from_continuation_byte() {
        let s = "héllo"; // 'é' is 2 bytes in UTF-8
        let bytes = s.as_bytes();
        // Truncating at byte 2 lands inside 'é' — must back off to byte 1.
        let truncated = safe_truncate_utf8(bytes, 2);
        assert!(std::str::from_utf8(truncated).is_ok());
    }
}
