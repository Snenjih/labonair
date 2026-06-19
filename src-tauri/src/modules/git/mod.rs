use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};

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

// ─── Helper ───────────────────────────────────────────────────────────────────

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

/// Truncates a byte slice at a UTF-8 character boundary at or before `max` bytes.
fn safe_truncate_utf8(bytes: &[u8], max: usize) -> &[u8] {
    if bytes.len() <= max {
        return bytes;
    }
    let mut end = max;
    // Walk backwards past any continuation bytes (0x80..0xBF)
    while end > 0 && (bytes[end] & 0xC0) == 0x80 {
        end -= 1;
    }
    &bytes[..end]
}

/// Synchronous helper: validate cwd, run git with the given args, return trimmed stdout.
/// Returns Err(stderr) on non-zero exit or if git is not found.
fn run_git_sync(args: &[&str], cwd: &str) -> Result<String, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }

    let output = Command::new("git")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args)
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git is not installed or not in PATH".to_string()
            } else {
                e.to_string()
            }
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .trim_end()
            .to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
        Err(if stderr.is_empty() {
            format!(
                "git exited with code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            stderr
        })
    }
}

/// Same as run_git_sync but also captures stderr merged into a single string (useful
/// for push/pull/fetch where git writes progress to stderr).
fn run_git_merged_sync(args: &[&str], cwd: &str) -> Result<String, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }

    let output = Command::new("git")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args)
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git is not installed or not in PATH".to_string()
            } else {
                e.to_string()
            }
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();

    if output.status.success() {
        Ok(format!("{stdout}{stderr}"))
    } else {
        Err(if stderr.is_empty() {
            format!("git exited with code {}", output.status.code().unwrap_or(-1))
        } else {
            stderr
        })
    }
}

/// Async wrapper around run_git_sync — offloads blocking I/O to spawn_blocking.
async fn run_git(args: Vec<String>, cwd: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git_sync(&arg_refs, &cwd)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Async wrapper around run_git_merged_sync — offloads blocking I/O to spawn_blocking.
async fn run_git_merged(args: Vec<String>, cwd: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_git_merged_sync(&arg_refs, &cwd)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Returns true if the given path is inside a git repository.
#[tauri::command]
pub async fn git_is_repo(path: String) -> bool {
    let cwd_path = PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return false;
    }
    tokio::task::spawn_blocking(move || {
        Command::new("git")
            .env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args(["rev-parse", "--git-dir"])
            .current_dir(&cwd_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// Returns the repository root path.
#[tauri::command]
pub async fn git_get_repo_root(path: String) -> Result<String, String> {
    run_git(vec!["rev-parse".to_string(), "--show-toplevel".to_string()], path).await
}

// ─── git_get_status sync body ─────────────────────────────────────────────────

fn git_get_status_sync(path: String) -> Result<GitStatus, String> {
    // Resolve the actual repo root so .git dir checks are accurate.
    let repo_root = run_git_sync(&["rev-parse", "--show-toplevel"], &path)?;

    // ── porcelain v1 with NUL terminators ────────────────────────────────────
    let raw_output = {
        let cwd_path = PathBuf::from(&repo_root);
        let output = Command::new("git")
            .env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args(["status", "--porcelain=v1", "-z"])
            .current_dir(&cwd_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        output.stdout
    };

    // The output is NUL-separated. We split on NUL and parse tokens.
    // Each status entry is: "XY filename\0" for regular files, or
    // "R  new_name\0orig_name\0" for renames (two tokens consumed).
    let raw_str = String::from_utf8_lossy(&raw_output);
    // Split by NUL — last element may be empty because the stream ends with NUL.
    let tokens: Vec<&str> = raw_str.split('\0').collect();

    let mut staged: Vec<FileStatus> = Vec::new();
    let mut unstaged: Vec<FileStatus> = Vec::new();
    let mut untracked: Vec<FileStatus> = Vec::new();
    let mut has_conflicts = false;

    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        // Each entry token is "XY filename" (at least 3 chars: 2 status + space + 1 char name).
        if token.len() < 3 {
            i += 1;
            continue;
        }
        let mut chars = token.chars();
        let x = chars.next().unwrap_or(' '); // index status
        let y = chars.next().unwrap_or(' '); // worktree status
        // Skip the space separator
        let _ = chars.next();
        let filename: String = chars.collect();

        // Consume original path for renames/copies (next NUL token).
        // Format: "XY new_path\0old_path\0" — after parsing "XY new_path" at tokens[i],
        // tokens[i+1] is the old_path. We read it at the current i (after i += 1 below)
        // but we must NOT double-increment — so read tokens[i] first, then increment.
        let original_path: Option<String> = if x == 'R' || x == 'C' || y == 'R' || y == 'C' {
            // Peek at the next token without incrementing yet; we'll increment after reading.
            let orig = tokens.get(i + 1).map(|s| s.to_string()).filter(|s| !s.is_empty());
            i += 1; // consume the old_path token so the loop's i += 1 moves past it
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
            // Untracked
            untracked.push(fs);
        } else {
            // Staged: index has a change (not space, not '?')
            if x != ' ' && x != '?' {
                staged.push(fs.clone());
            }
            // Unstaged: worktree has a change (not space, not '?'), and it's not a pure untracked
            if y != ' ' && y != '?' {
                unstaged.push(fs);
            }
        }

        i += 1;
    }

    // ── Ahead / behind ───────────────────────────────────────────────────────
    let (ahead, behind) = {
        let cwd_path = PathBuf::from(&repo_root);
        let out = Command::new("git")
            .env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args(["rev-list", "--count", "--left-right", "@{upstream}...HEAD"])
            .current_dir(&cwd_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        match out {
            Ok(o) if o.status.success() => {
                let s = String::from_utf8_lossy(&o.stdout);
                let s = s.trim();
                // Output: "<behind>\t<ahead>"
                // (left side = upstream = behind, right side = HEAD = ahead)
                let parts: Vec<&str> = s.split('\t').collect();
                if parts.len() == 2 {
                    let behind: u32 = parts[0].parse().unwrap_or(0);
                    let ahead: u32 = parts[1].parse().unwrap_or(0);
                    (ahead, behind)
                } else {
                    (0, 0)
                }
            }
            _ => (0, 0),
        }
    };

    // ── Merge / rebase / cherry-pick state ───────────────────────────────────
    let git_dir = {
        // `git rev-parse --git-dir` gives us the .git directory path (relative or absolute).
        let raw = run_git_sync(&["rev-parse", "--git-dir"], &repo_root).unwrap_or_default();
        if raw.starts_with('/') {
            PathBuf::from(&raw)
        } else {
            PathBuf::from(&repo_root).join(&raw)
        }
    };

    let merge_in_progress = git_dir.join("MERGE_HEAD").exists();
    let rebase_in_progress =
        git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir();
    let cherry_pick_in_progress = git_dir.join("CHERRY_PICK_HEAD").exists();

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

/// Returns the full working tree status.
#[tauri::command]
pub async fn git_get_status(path: String) -> Result<GitStatus, String> {
    tokio::task::spawn_blocking(move || git_get_status_sync(path))
        .await
        .map_err(|e| e.to_string())?
}

/// Returns the current branch name, or "HEAD detached at <hash>" if detached.
#[tauri::command]
pub async fn git_get_current_branch(path: String) -> Result<String, String> {
    let branch = run_git(vec!["branch".to_string(), "--show-current".to_string()], path.clone()).await?;
    if branch.is_empty() {
        // Detached HEAD
        let hash = run_git(vec!["rev-parse".to_string(), "--short".to_string(), "HEAD".to_string()], path).await?;
        Ok(format!("HEAD detached at {hash}"))
    } else {
        Ok(branch)
    }
}

/// Returns all branches (local and remote).
#[tauri::command]
pub async fn git_get_branches(path: String) -> Result<Vec<Branch>, String> {
    // %(HEAD) outputs '*' for current, ' ' otherwise.
    let output = run_git(
        vec![
            "branch".to_string(),
            "-a".to_string(),
            "--format=%(refname:short)|%(HEAD)|%(upstream:short)|%(upstream:track,nobracket)".to_string(),
        ],
        path,
    ).await?;

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

        // Parse ahead/behind from track info like "ahead 2, behind 1", "ahead 3", "behind 1"
        let mut ahead: u32 = 0;
        let mut behind: u32 = 0;
        if !track_info.is_empty() {
            // ahead N
            if let Some(pos) = track_info.find("ahead ") {
                let rest = &track_info[pos + 6..];
                let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                ahead = num_str.parse().unwrap_or(0);
            }
            // behind N
            if let Some(pos) = track_info.find("behind ") {
                let rest = &track_info[pos + 7..];
                let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                behind = num_str.parse().unwrap_or(0);
            }
        }

        let is_remote = name.starts_with("remotes/");
        let upstream = if upstream_raw.is_empty() {
            None
        } else {
            Some(upstream_raw)
        };

        branches.push(Branch {
            name,
            is_current,
            is_remote,
            upstream,
            ahead,
            behind,
        });
    }

    Ok(branches)
}

// ─── git_get_diff sync body ───────────────────────────────────────────────────

fn git_get_diff_sync(path: String, file: String, staged: bool, ignore_whitespace: bool) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024; // 200 KB

    let mut args: Vec<String> = if staged {
        vec!["diff".to_string(), "--cached".to_string()]
    } else {
        vec!["diff".to_string()]
    };
    if ignore_whitespace {
        args.push("-w".to_string());
    }
    args.push("--".to_string());
    args.push(file);

    let cwd_path = PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let output = Command::new("git")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(&args)
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let stdout = output.stdout;
    if stdout.len() > MAX_DIFF_BYTES {
        let truncated = String::from_utf8_lossy(safe_truncate_utf8(&stdout, MAX_DIFF_BYTES)).into_owned();
        Ok(format!(
            "{truncated}\n\n[diff truncated — output exceeded 200 KB]"
        ))
    } else {
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }
}

/// Returns the diff for a specific file, either staged or unstaged.
#[tauri::command]
pub async fn git_get_diff(path: String, file: String, staged: bool, ignore_whitespace: Option<bool>) -> Result<String, String> {
    let iw = ignore_whitespace.unwrap_or(false);
    tokio::task::spawn_blocking(move || git_get_diff_sync(path, file, staged, iw))
        .await
        .map_err(|e| e.to_string())?
}

/// Stages a specific file.
#[tauri::command]
pub async fn git_stage_file(path: String, file: String) -> Result<(), String> {
    run_git(vec!["add".to_string(), "--".to_string(), file], path).await.map(|_| ())
}

/// Unstages a specific file.
#[tauri::command]
pub async fn git_unstage_file(path: String, file: String) -> Result<(), String> {
    run_git(vec!["restore".to_string(), "--staged".to_string(), "--".to_string(), file], path).await.map(|_| ())
}

/// Stages all changes (equivalent to `git add -A`).
#[tauri::command]
pub async fn git_stage_all(path: String) -> Result<(), String> {
    run_git(vec!["add".to_string(), "-A".to_string()], path).await.map(|_| ())
}

/// Unstages all staged changes.
/// Uses `git reset HEAD` which is the canonical way to unstage everything.
/// Falls back to `git rm --cached -r .` for repositories with no commits yet.
#[tauri::command]
pub async fn git_unstage_all(path: String) -> Result<(), String> {
    match run_git(vec!["reset".to_string(), "HEAD".to_string()], path.clone()).await {
        Ok(_) => Ok(()),
        Err(_) => {
            // No commits yet — use rm --cached to unstage everything
            run_git(vec!["rm".to_string(), "--cached".to_string(), "-r".to_string(), ".".to_string()], path).await.map(|_| ())
        }
    }
}

/// Discards worktree changes for a specific file.
#[tauri::command]
pub async fn git_discard_file(path: String, file: String) -> Result<(), String> {
    run_git(vec!["restore".to_string(), "--".to_string(), file], path).await.map(|_| ())
}

/// Creates a commit with the given message. Supports `--amend`.
#[tauri::command]
pub async fn git_commit(
    path: String,
    message: String,
    amend: bool,
) -> Result<CommitResult, String> {
    let mut args = vec!["commit".to_string()];
    if amend {
        args.push("--amend".to_string());
    }
    args.push("-m".to_string());
    args.push(message);

    run_git(args, path.clone()).await?;

    // Fetch hash + subject of the resulting commit.
    let log = run_git(vec!["log".to_string(), "-1".to_string(), "--format=%H|%s".to_string()], path).await?;
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
) -> Result<String, String> {
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    let mut args = vec!["push".to_string(), remote_str];

    if let Some(b) = branch {
        args.push(b);
    }

    run_git_merged(args, path).await
}

/// Pulls from the configured upstream.
#[tauri::command]
pub async fn git_pull(path: String) -> Result<String, String> {
    run_git_merged(vec!["pull".to_string()], path).await
}

/// Fetches from all remotes.
#[tauri::command]
pub async fn git_fetch(path: String) -> Result<String, String> {
    run_git_merged(vec!["fetch".to_string(), "--all".to_string()], path).await
}

/// Aborts an in-progress merge, rebase, or cherry-pick.
#[tauri::command]
pub async fn git_abort(path: String) -> Result<(), String> {
    let repo_root = run_git(vec!["rev-parse".to_string(), "--show-toplevel".to_string()], path.clone()).await?;
    let git_dir_raw = run_git(vec!["rev-parse".to_string(), "--git-dir".to_string()], repo_root.clone()).await.unwrap_or_default();
    let git_dir = if git_dir_raw.starts_with('/') {
        PathBuf::from(&git_dir_raw)
    } else {
        PathBuf::from(&repo_root).join(&git_dir_raw)
    };

    if git_dir.join("MERGE_HEAD").exists() {
        return run_git(vec!["merge".to_string(), "--abort".to_string()], repo_root).await.map(|_| ());
    }
    if git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir() {
        return run_git(vec!["rebase".to_string(), "--abort".to_string()], repo_root).await.map(|_| ());
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return run_git(vec!["cherry-pick".to_string(), "--abort".to_string()], repo_root).await.map(|_| ());
    }
    Err("no merge, rebase, or cherry-pick in progress to abort".to_string())
}

/// Returns the commit log.
#[tauri::command]
pub async fn git_get_log(
    path: String,
    limit: Option<u32>,
    all_branches: bool,
) -> Result<Vec<CommitInfo>, String> {
    let n = limit.unwrap_or(500).to_string();
    // %x1e (ASCII record separator) starts each commit; %x00 separates fields.
    let format = "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D".to_string();

    let mut args = vec!["log".to_string()];
    if all_branches {
        args.push("--all".to_string());
    }
    args.push("-n".to_string());
    args.push(n);
    args.push(format);
    args.push("--shortstat".to_string());

    let raw = run_git(args, path).await?;

    let mut commits: Vec<CommitInfo> = Vec::new();

    for record in raw.split('\x1e') {
        let record = record.trim_matches('\n').trim();
        if record.is_empty() {
            continue;
        }

        // First line: NUL-separated fields. Remainder: optional shortstat.
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

        // Refs field: "HEAD -> main, origin/main, tag: v1.0" etc.
        let refs_raw = parts[6];
        let refs: Vec<String> = refs_raw
            .split(',')
            .map(|r| r.trim())
            .filter(|r| !r.is_empty())
            .map(|r| {
                // Clean up "HEAD -> " and "tag: " prefixes.
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
pub async fn git_get_commit_detail(path: String, hash: String) -> Result<String, String> {
    run_git(vec!["show".to_string(), "--stat".to_string(), "--format=%B".to_string(), hash], path).await
}

/// Returns numstat output for a single commit: `additions\tdeletions\tpath` per line.
#[tauri::command]
pub async fn git_get_commit_numstat(path: String, hash: String) -> Result<String, String> {
    run_git(vec!["show".to_string(), "--numstat".to_string(), "--format=".to_string(), hash], path).await
}

/// Returns the fetch URL of the given remote (defaults to "origin").
#[tauri::command]
pub async fn git_get_remote_url(path: String, remote: Option<String>) -> Result<String, String> {
    let r = remote.unwrap_or_else(|| "origin".to_string());
    run_git(vec!["remote".to_string(), "get-url".to_string(), r], path).await.map(|s| s.trim().to_string())
}

// ─── Branch Management ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_checkout_branch(path: String, branch: String) -> Result<(), String> {
    run_git(vec!["checkout".to_string(), branch], path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_create_branch(
    path: String,
    name: String,
    from_ref: Option<String>,
    checkout: bool,
) -> Result<(), String> {
    let mut args: Vec<String> = if checkout {
        vec!["checkout".to_string(), "-b".to_string(), name.clone()]
    } else {
        vec!["branch".to_string(), name.clone()]
    };
    if let Some(r) = from_ref {
        args.push(r);
    }
    run_git(args, path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D".to_string() } else { "-d".to_string() };
    run_git(vec!["branch".to_string(), flag, name], path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_rename_branch(
    path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    run_git(vec!["branch".to_string(), "-m".to_string(), old_name, new_name], path).await.map(|_| ())
}

// ─── Stash Commands ───────────────────────────────────────────────────────────

/// Resolves a stash commit hash to its current numeric index.
/// Needed because stash indices shift whenever entries are added or dropped.
async fn find_stash_index_by_hash(path: &str, hash: &str) -> Result<u32, String> {
    let output = run_git(
        vec!["stash".to_string(), "list".to_string(), "--format=%gd|%H".to_string()],
        path.to_string(),
    )
    .await?;
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
    Err(format!(
        "stash entry '{}' no longer exists — it may have already been dropped",
        hash
    ))
}

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

#[tauri::command]
pub async fn git_stash_push(
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<(), String> {
    let mut args = vec!["stash".to_string(), "push".to_string()];
    if include_untracked.unwrap_or(true) {
        args.push("--include-untracked".to_string());
    }
    if let Some(ref msg) = message {
        args.push("-m".to_string());
        args.push(msg.clone());
    }
    run_git(args, path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<StashEntry>, String> {
    let output = run_git(
        vec![
            "stash".to_string(),
            "list".to_string(),
            "--format=%gd%x00%gs%x00%H%x1e".to_string(),
        ],
        path,
    )
    .await?;

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
        entries.push(StashEntry {
            index,
            message,
            branch,
            hash,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn git_stash_pop(path: String, hash: String) -> Result<(), String> {
    let idx = find_stash_index_by_hash(&path, &hash).await?;
    run_git(
        vec!["stash".to_string(), "pop".to_string(), format!("stash@{{{}}}", idx)],
        path,
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn git_stash_apply(path: String, hash: String) -> Result<(), String> {
    let idx = find_stash_index_by_hash(&path, &hash).await?;
    run_git(
        vec!["stash".to_string(), "apply".to_string(), format!("stash@{{{}}}", idx)],
        path,
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn git_stash_drop(path: String, hash: String) -> Result<(), String> {
    let idx = find_stash_index_by_hash(&path, &hash).await?;
    run_git(
        vec!["stash".to_string(), "drop".to_string(), format!("stash@{{{}}}", idx)],
        path,
    )
    .await
    .map(|_| ())
}

// ─── Diff + Push Variants ─────────────────────────────────────────────────────

fn git_get_commit_diff_sync(path: String, hash: String) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024;
    let cwd_path = PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let output = Command::new("git")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["show", "--format=", "--patch", &hash])
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let stdout = output.stdout;
    if stdout.len() > MAX_DIFF_BYTES {
        let truncated = String::from_utf8_lossy(safe_truncate_utf8(&stdout, MAX_DIFF_BYTES)).into_owned();
        Ok(format!("{truncated}\n\n[diff truncated — output exceeded 200 KB]"))
    } else {
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }
}

#[tauri::command]
pub async fn git_get_commit_diff(path: String, hash: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git_get_commit_diff_sync(path, hash))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_push_force_with_lease(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    let mut args = vec!["push".to_string(), "--force-with-lease".to_string(), remote_str];
    if let Some(b) = branch {
        args.push(b);
    }
    run_git_merged(args, path).await
}

#[tauri::command]
pub async fn git_push_set_upstream(
    path: String,
    remote: String,
    branch: String,
) -> Result<String, String> {
    run_git_merged(vec!["push".to_string(), "--set-upstream".to_string(), remote, branch], path).await
}

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_cherry_pick(path: String, hash: String) -> Result<(), String> {
    run_git(vec!["cherry-pick".to_string(), hash], path).await.map(|_| ())
}

// ─── Tag Management ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_tags(path: String) -> Result<Vec<String>, String> {
    let output = run_git(vec!["tag".to_string(), "--sort=-version:refname".to_string()], path).await?;
    Ok(output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect())
}

#[tauri::command]
pub async fn git_create_tag(
    path: String,
    name: String,
    message: Option<String>,
    hash: Option<String>,
) -> Result<(), String> {
    let mut args: Vec<String> = vec!["tag".to_string()];
    if let Some(msg) = message {
        args.push("-a".to_string());
        args.push(name.clone());
        if let Some(h) = hash {
            args.push(h);
        }
        args.push("-m".to_string());
        args.push(msg);
    } else {
        args.push(name.clone());
        if let Some(h) = hash {
            args.push(h);
        }
    }
    run_git(args, path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_delete_tag(path: String, name: String) -> Result<(), String> {
    run_git(vec!["tag".to_string(), "-d".to_string(), name], path).await.map(|_| ())
}

#[tauri::command]
pub async fn git_push_tag(
    path: String,
    name: String,
    remote: Option<String>,
) -> Result<String, String> {
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    run_git_merged(vec!["push".to_string(), remote_str, name], path).await
}

// ─── Diff Stats ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffStat {
    pub path: String,
    pub added: u32,
    pub removed: u32,
    pub staged: bool,
}

fn parse_numstat(output: &str, staged: bool) -> Vec<FileDiffStat> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() < 3 { return None; }
            let added = parts[0].parse::<u32>().unwrap_or(0);
            let removed = parts[1].parse::<u32>().unwrap_or(0);
            let path = parts[2].to_string();
            Some(FileDiffStat { path, added, removed, staged })
        })
        .collect()
}

#[tauri::command]
pub async fn git_get_diff_stats(path: String) -> Result<Vec<FileDiffStat>, String> {
    let staged_out = run_git(vec!["diff".to_string(), "--cached".to_string(), "--numstat".to_string()], path.clone()).await.unwrap_or_default();
    let unstaged_out = run_git(vec!["diff".to_string(), "--numstat".to_string()], path).await.unwrap_or_default();
    let mut stats = parse_numstat(&staged_out, true);
    stats.extend(parse_numstat(&unstaged_out, false));
    Ok(stats)
}

#[tauri::command]
pub async fn git_add_to_gitignore(path: String, file: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    // Canonicalize path to prevent directory traversal
    let canonical = std::fs::canonicalize(&path).map_err(|e| format!("invalid path: {e}"))?;
    if !canonical.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    // Sanitize file argument — strip control characters that could inject lines
    let safe_file = file.replace(['\n', '\r', '\0'], "");
    if safe_file.is_empty() {
        return Err("file path cannot be empty".to_string());
    }
    let gitignore_path = canonical.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore_path).unwrap_or_default();
    let entry = format!("/{}", safe_file.trim_start_matches('/'));

    if existing.lines().any(|l| l.trim() == entry.trim() || l.trim() == safe_file.trim()) {
        return Ok(());
    }

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)
        .map_err(|e| e.to_string())?;

    if !existing.is_empty() && !existing.ends_with('\n') {
        writeln!(f).map_err(|e| e.to_string())?;
    }
    writeln!(f, "{}", entry).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_add_to_exclude(path: String, file: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    // Canonicalize path to prevent directory traversal
    let canonical = std::fs::canonicalize(&path).map_err(|e| format!("invalid path: {e}"))?;
    // Sanitize file argument — strip control characters that could inject lines
    let safe_file = file.replace(['\n', '\r', '\0'], "");
    if safe_file.is_empty() {
        return Err("file path cannot be empty".to_string());
    }
    let exclude_path = canonical.join(".git/info/exclude");
    let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    let entry = safe_file.trim_start_matches('/').to_string();

    if existing.lines().any(|l| l.trim() == entry.trim()) {
        return Ok(());
    }

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&exclude_path)
        .map_err(|e| e.to_string())?;

    if !existing.is_empty() && !existing.ends_with('\n') {
        writeln!(f).map_err(|e| e.to_string())?;
    }
    writeln!(f, "{}", entry).map_err(|e| e.to_string())?;
    Ok(())
}
