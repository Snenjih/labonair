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

/// Synchronous helper: validate cwd, run git with the given args, return trimmed stdout.
/// Returns Err(stderr) on non-zero exit or if git is not found.
fn run_git(args: &[&str], cwd: &str) -> Result<String, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }

    let output = Command::new("git")
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

/// Same as run_git but also captures stderr merged into a single string (useful
/// for push/pull/fetch where git writes progress to stderr).
fn run_git_merged(args: &[&str], cwd: &str) -> Result<String, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }

    let output = Command::new("git")
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
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let combined = format!("{stdout}{stderr}");
    Ok(combined)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Returns true if the given path is inside a git repository.
#[tauri::command]
pub async fn git_is_repo(path: String) -> bool {
    let cwd_path = PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return false;
    }
    Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Returns the repository root path.
#[tauri::command]
pub async fn git_get_repo_root(path: String) -> Result<String, String> {
    run_git(&["rev-parse", "--show-toplevel"], &path)
}

/// Returns the full working tree status.
#[tauri::command]
pub async fn git_get_status(path: String) -> Result<GitStatus, String> {
    // Resolve the actual repo root so .git dir checks are accurate.
    let repo_root = run_git(&["rev-parse", "--show-toplevel"], &path)?;

    // ── porcelain v1 with NUL terminators ────────────────────────────────────
    let raw_output = {
        let cwd_path = PathBuf::from(&repo_root);
        let output = Command::new("git")
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
        let raw = run_git(&["rev-parse", "--git-dir"], &repo_root).unwrap_or_default();
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

/// Returns the current branch name, or "HEAD detached at <hash>" if detached.
#[tauri::command]
pub async fn git_get_current_branch(path: String) -> Result<String, String> {
    let branch = run_git(&["branch", "--show-current"], &path)?;
    if branch.is_empty() {
        // Detached HEAD
        let hash = run_git(&["rev-parse", "--short", "HEAD"], &path)?;
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
        &[
            "branch",
            "-a",
            "--format=%(refname:short)|%(HEAD)|%(upstream:short)|%(upstream:track,nobracket)",
        ],
        &path,
    )?;

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

        let is_remote = name.starts_with("remotes/") || name.contains('/');
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

/// Returns the diff for a specific file, either staged or unstaged.
#[tauri::command]
pub async fn git_get_diff(path: String, file: String, staged: bool, ignore_whitespace: Option<bool>) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024; // 200 KB

    let mut args: Vec<String> = if staged {
        vec!["diff".to_string(), "--cached".to_string()]
    } else {
        vec!["diff".to_string()]
    };
    if ignore_whitespace.unwrap_or(false) {
        args.push("-w".to_string());
    }
    args.push("--".to_string());
    args.push(file);

    // We build the args with owned strings to allow the file path through.
    let cwd_path = PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let output = Command::new("git")
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
        let truncated = String::from_utf8_lossy(&stdout[..MAX_DIFF_BYTES]).into_owned();
        Ok(format!(
            "{truncated}\n\n[diff truncated — output exceeded 200 KB]"
        ))
    } else {
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }
}

/// Stages a specific file.
#[tauri::command]
pub async fn git_stage_file(path: String, file: String) -> Result<(), String> {
    run_git(&["add", "--", &file], &path).map(|_| ())
}

/// Unstages a specific file.
#[tauri::command]
pub async fn git_unstage_file(path: String, file: String) -> Result<(), String> {
    run_git(&["restore", "--staged", "--", &file], &path).map(|_| ())
}

/// Stages all changes (equivalent to `git add -A`).
#[tauri::command]
pub async fn git_stage_all(path: String) -> Result<(), String> {
    run_git(&["add", "-A"], &path).map(|_| ())
}

/// Unstages all staged changes.
/// Uses `git reset HEAD` which is the canonical way to unstage everything.
/// Falls back to `git rm --cached -r .` for repositories with no commits yet.
#[tauri::command]
pub async fn git_unstage_all(path: String) -> Result<(), String> {
    match run_git(&["reset", "HEAD"], &path) {
        Ok(_) => Ok(()),
        Err(_) => {
            // No commits yet — use rm --cached to unstage everything
            run_git(&["rm", "--cached", "-r", "."], &path).map(|_| ())
        }
    }
}

/// Discards worktree changes for a specific file.
#[tauri::command]
pub async fn git_discard_file(path: String, file: String) -> Result<(), String> {
    run_git(&["restore", "--", &file], &path).map(|_| ())
}

/// Creates a commit with the given message. Supports `--amend`.
#[tauri::command]
pub async fn git_commit(
    path: String,
    message: String,
    amend: bool,
) -> Result<CommitResult, String> {
    let mut args = vec!["commit"];
    if amend {
        args.push("--amend");
    }
    args.extend(["-m", &message]);

    run_git(&args, &path)?;

    // Fetch hash + subject of the resulting commit.
    let log = run_git(&["log", "-1", "--format=%H|%s"], &path)?;
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
    let mut args = vec!["push", &remote_str];

    // We need a stable String for the branch name.
    let branch_str: String;
    if let Some(b) = branch {
        branch_str = b;
        args.push(&branch_str);
    }

    run_git_merged(&args, &path)
}

/// Pulls from the configured upstream.
#[tauri::command]
pub async fn git_pull(path: String) -> Result<String, String> {
    run_git_merged(&["pull"], &path)
}

/// Fetches from all remotes.
#[tauri::command]
pub async fn git_fetch(path: String) -> Result<String, String> {
    run_git_merged(&["fetch", "--all"], &path)
}

/// Aborts an in-progress merge, rebase, or cherry-pick.
#[tauri::command]
pub async fn git_abort(path: String) -> Result<(), String> {
    // Try each abort in sequence; succeed on the first that works.
    if run_git(&["merge", "--abort"], &path).is_ok() {
        return Ok(());
    }
    if run_git(&["rebase", "--abort"], &path).is_ok() {
        return Ok(());
    }
    if run_git(&["cherry-pick", "--abort"], &path).is_ok() {
        return Ok(());
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
    let format = "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D";

    let mut args = vec!["log"];
    if all_branches {
        args.push("--all");
    }
    args.extend(["-n", &n, format, "--shortstat"]);

    let raw = run_git(&args, &path)?;

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
    run_git(&["show", "--stat", "--format=%B", &hash], &path)
}

// ─── Branch Management ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_checkout_branch(path: String, branch: String) -> Result<(), String> {
    run_git(&["checkout", &branch], &path).map(|_| ())
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
    if let Some(ref r) = from_ref {
        args.push(r.clone());
    }
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git(&args_refs, &path).map(|_| ())
}

#[tauri::command]
pub async fn git_delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };
    run_git(&["branch", flag, &name], &path).map(|_| ())
}

#[tauri::command]
pub async fn git_rename_branch(
    path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    run_git(&["branch", "-m", &old_name, &new_name], &path).map(|_| ())
}

// ─── Stash Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_stash_push(path: String, message: Option<String>) -> Result<(), String> {
    if let Some(ref msg) = message {
        run_git(&["stash", "push", "-m", msg.as_str()], &path).map(|_| ())
    } else {
        run_git(&["stash", "push"], &path).map(|_| ())
    }
}

#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<StashEntry>, String> {
    let output = run_git(&["stash", "list", "--format=%gd|%gs|%H"], &path)?;
    let mut entries: Vec<StashEntry> = Vec::new();
    for line in output.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() < 3 {
            continue;
        }
        // parts[0] = "stash@{0}", parts[1] = "On main: message", parts[2] = hash
        let ref_part = parts[0]; // "stash@{N}"
        let index: u32 = ref_part
            .trim_start_matches("stash@{")
            .trim_end_matches('}')
            .parse()
            .unwrap_or(0);
        let gs = parts[1]; // "On <branch>: <message>" or "WIP on <branch>: <message>"
        let (branch, message) = if let Some(rest) = gs.strip_prefix("On ") {
            if let Some(colon_pos) = rest.find(": ") {
                (rest[..colon_pos].to_string(), rest[colon_pos + 2..].to_string())
            } else {
                (rest.to_string(), String::new())
            }
        } else if let Some(rest) = gs.strip_prefix("WIP on ") {
            if let Some(colon_pos) = rest.find(": ") {
                (rest[..colon_pos].to_string(), rest[colon_pos + 2..].to_string())
            } else {
                (rest.to_string(), String::new())
            }
        } else {
            (String::new(), gs.to_string())
        };
        entries.push(StashEntry {
            index,
            message,
            branch,
            hash: parts[2].to_string(),
        });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn git_stash_pop(path: String, index: u32) -> Result<(), String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git(&["stash", "pop", &ref_str], &path).map(|_| ())
}

#[tauri::command]
pub async fn git_stash_apply(path: String, index: u32) -> Result<(), String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git(&["stash", "apply", &ref_str], &path).map(|_| ())
}

#[tauri::command]
pub async fn git_stash_drop(path: String, index: u32) -> Result<(), String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git(&["stash", "drop", &ref_str], &path).map(|_| ())
}

// ─── Diff + Push Variants ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_commit_diff(path: String, hash: String) -> Result<String, String> {
    const MAX_DIFF_BYTES: usize = 200 * 1024;
    let cwd_path = std::path::PathBuf::from(&path);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let output = std::process::Command::new("git")
        .args(["show", "--format=", "--patch", &hash])
        .current_dir(&cwd_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let stdout = output.stdout;
    if stdout.len() > MAX_DIFF_BYTES {
        let truncated = String::from_utf8_lossy(&stdout[..MAX_DIFF_BYTES]).into_owned();
        Ok(format!("{truncated}\n\n[diff truncated — output exceeded 200 KB]"))
    } else {
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }
}

#[tauri::command]
pub async fn git_push_force_with_lease(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    let mut args = vec!["push".to_string(), "--force-with-lease".to_string(), remote_str.clone()];
    if let Some(b) = branch {
        args.push(b);
    }
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git_merged(&args_refs, &path)
}

#[tauri::command]
pub async fn git_push_set_upstream(
    path: String,
    remote: String,
    branch: String,
) -> Result<String, String> {
    run_git_merged(&["push", "--set-upstream", &remote, &branch], &path)
}

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_cherry_pick(path: String, hash: String) -> Result<(), String> {
    run_git(&["cherry-pick", &hash], &path).map(|_| ())
}

// ─── Tag Management ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_tags(path: String) -> Result<Vec<String>, String> {
    let output = run_git(&["tag", "--sort=-version:refname"], &path)?;
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
    if let Some(ref msg) = message {
        args.push("-a".to_string());
        args.push(name.clone());
        if let Some(ref h) = hash {
            args.push(h.clone());
        }
        args.push("-m".to_string());
        args.push(msg.clone());
    } else {
        args.push(name.clone());
        if let Some(ref h) = hash {
            args.push(h.clone());
        }
    }
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git(&args_refs, &path).map(|_| ())
}

#[tauri::command]
pub async fn git_delete_tag(path: String, name: String) -> Result<(), String> {
    run_git(&["tag", "-d", &name], &path).map(|_| ())
}

#[tauri::command]
pub async fn git_push_tag(
    path: String,
    name: String,
    remote: Option<String>,
) -> Result<String, String> {
    let remote_str = remote.unwrap_or_else(|| "origin".to_string());
    run_git_merged(&["push", &remote_str, &name], &path)
}
