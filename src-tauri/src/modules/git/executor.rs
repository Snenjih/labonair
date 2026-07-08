use crate::modules::sftp::SftpState;
use crate::modules::sftp::net_error::is_network_error;
use crate::modules::ssh::shell::shell_quote;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// The exact error string the local codepath already produces when `git`
/// isn't on PATH (`Command::spawn`'s `io::ErrorKind::NotFound`) — the
/// frontend already special-cases this string (`useGitStatus.ts`), so the
/// remote path re-uses it verbatim instead of inventing a second message.
pub(crate) const GIT_NOT_INSTALLED: &str = "git is not installed or not in PATH";

/// Runs git either against a local working directory or, via an existing
/// SSH/SFTP session, against a directory on a remote host. Every command in
/// this module builds one of these from `resolve_executor` and calls
/// `run`/`run_merged`/`run_raw`/`run_shell_script` instead of shelling out
/// directly, so the local/remote branching lives in exactly one place.
pub(crate) enum GitExecutor {
    Local {
        cwd: String,
    },
    Remote {
        session_id: String,
        cwd: String,
        sftp_state: SftpState,
        app: tauri::AppHandle,
    },
}

pub(crate) fn resolve_executor(
    path: String,
    session_id: Option<String>,
    sftp_state: SftpState,
    app: tauri::AppHandle,
) -> GitExecutor {
    match session_id {
        Some(session_id) => GitExecutor::Remote { session_id, cwd: path, sftp_state, app },
        None => GitExecutor::Local { cwd: path },
    }
}

impl GitExecutor {
    /// Runs a single git subcommand (argv-based, never shell-interpreted
    /// locally), returning trimmed stdout as a lossy-UTF8 string. Non-zero
    /// exit becomes `Err(stderr)`.
    pub(crate) async fn run(&self, args: &[&str]) -> Result<String, String> {
        let raw = self.run_raw(args).await?;
        Ok(String::from_utf8_lossy(&raw).trim_end().to_string())
    }

    /// Same as `run`, merging stdout+stderr into one lossy-UTF8 string —
    /// used for push/pull/fetch where git writes progress to stderr.
    pub(crate) async fn run_merged(&self, args: &[&str]) -> Result<String, String> {
        match self {
            GitExecutor::Local { cwd } => {
                let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
                let cwd = cwd.clone();
                tokio::task::spawn_blocking(move || {
                    let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                    run_local_merged(&refs, &cwd)
                })
                .await
                .map_err(|e| e.to_string())?
            }
            GitExecutor::Remote { .. } => {
                let (stdout, stderr, exit_code) = self.exec_remote_args(args).await?;
                let out = String::from_utf8_lossy(&stdout).into_owned();
                let err = String::from_utf8_lossy(&stderr).trim_end().to_string();
                if exit_code == 0 {
                    Ok(format!("{out}{err}"))
                } else {
                    Err(normalize_git_error(exit_code, &err))
                }
            }
        }
    }

    /// Runs a single git subcommand, returning raw stdout bytes on success
    /// (no lossy conversion applied yet) — used by diff-producing commands
    /// that need to truncate at a byte-accurate UTF-8 boundary first.
    pub(crate) async fn run_raw(&self, args: &[&str]) -> Result<Vec<u8>, String> {
        self.run_raw_tolerant(args, &[]).await
    }

    /// Same as `run_raw`, but treats the exit codes in `tolerated` as success
    /// too — needed for `git diff --no-index`, which exits 1 to mean "the
    /// two sides differ" rather than "the command failed".
    pub(crate) async fn run_raw_tolerant(&self, args: &[&str], tolerated: &[i32]) -> Result<Vec<u8>, String> {
        match self {
            GitExecutor::Local { cwd } => {
                let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
                let cwd = cwd.clone();
                let tolerated = tolerated.to_vec();
                tokio::task::spawn_blocking(move || {
                    let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                    run_local_raw(&refs, &cwd, &tolerated)
                })
                .await
                .map_err(|e| e.to_string())?
            }
            GitExecutor::Remote { .. } => {
                let (stdout, stderr, exit_code) = self.exec_remote_args(args).await?;
                if exit_code == 0 || tolerated.contains(&exit_code) {
                    Ok(stdout)
                } else {
                    let err = String::from_utf8_lossy(&stderr).trim_end().to_string();
                    Err(normalize_git_error(exit_code, &err))
                }
            }
        }
    }

    /// Runs an arbitrary multi-statement `sh`-compatible script (not a
    /// single argv-safe git invocation) against the target's cwd, returning
    /// raw stdout bytes and the exit code regardless of whether it's
    /// non-zero (callers that bundle several probes together, e.g. the
    /// merge/rebase/cherry-pick markers, decide for themselves what a
    /// non-zero exit means instead of treating it as a hard failure).
    /// Used for cases that need real shell semantics (`test -f`, `printf`
    /// section separators) that a plain git subcommand can't express.
    pub(crate) async fn run_shell_script(&self, script: &str) -> Result<(Vec<u8>, i32), String> {
        match self {
            GitExecutor::Local { cwd } => {
                let script = script.to_string();
                let cwd = cwd.clone();
                tokio::task::spawn_blocking(move || run_local_script(&script, &cwd))
                    .await
                    .map_err(|e| e.to_string())?
            }
            GitExecutor::Remote { session_id, cwd, sftp_state, app } => {
                let session_id = session_id.clone();
                let cwd = cwd.clone();
                let sftp_state = sftp_state.clone();
                let app = app.clone();
                let script = format!("cd {} && {}", shell_quote(&cwd), script);
                tokio::task::spawn_blocking(move || {
                    run_remote_script_sync(&sftp_state, &app, &session_id, &script)
                })
                .await
                .map_err(|e| e.to_string())?
                .map(|(stdout, _stderr, exit_code)| (stdout, exit_code))
            }
        }
    }

    async fn exec_remote_args(&self, args: &[&str]) -> Result<(Vec<u8>, Vec<u8>, i32), String> {
        let GitExecutor::Remote { session_id, cwd, sftp_state, app } = self else {
            unreachable!("exec_remote_args called on Local executor");
        };
        let quoted_args: String = args.iter().map(|a| shell_quote(a)).collect::<Vec<_>>().join(" ");
        let cwd_quoted = shell_quote(cwd);
        let build_script =
            |git_bin: &str| format!("LC_ALL=C GIT_TERMINAL_PROMPT=0 {git_bin} -C {cwd_quoted} {quoted_args}");

        let run = |script: String| {
            let session_id = session_id.clone();
            let sftp_state = sftp_state.clone();
            let app = app.clone();
            async move {
                tokio::task::spawn_blocking(move || run_remote_script_sync(&sftp_state, &app, &session_id, &script))
                    .await
                    .map_err(|e| e.to_string())?
            }
        };

        let result = run(build_script("git")).await?;
        if !looks_like_missing_git(result.2, &result.1) {
            return Ok(result);
        }

        // `git` isn't resolvable even under a login shell — try a short,
        // fixed list of common absolute install locations before giving up.
        // Not exhaustive PATH probing, just the handful of cases a
        // non-standard install is likely to hit.
        for candidate in GIT_FALLBACK_PATHS {
            let retry = run(build_script(candidate)).await?;
            if !looks_like_missing_git(retry.2, &retry.1) {
                return Ok(retry);
            }
        }
        Ok(result)
    }
}

/// Fixed, bounded set of common absolute `git` install locations tried when
/// the bare `git` command isn't resolvable even under a login shell — e.g. a
/// non-standard install that isn't on the profile's PATH.
const GIT_FALLBACK_PATHS: &[&str] = &["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];

/// Does this look like `git` itself (not some other command) was reported as
/// missing by the shell? Only meaningful on a 127 exit.
fn looks_like_missing_git(exit_code: i32, stderr: &[u8]) -> bool {
    if exit_code != 127 {
        return false;
    }
    let lower = String::from_utf8_lossy(stderr).to_lowercase();
    lower.contains("git") && (lower.contains("not found") || lower.contains("no such file"))
}

// ─── Local execution (argv-based, mirrors the pre-existing run_git_sync) ───

fn run_local_raw(args: &[&str], cwd: &str, tolerated: &[i32]) -> Result<Vec<u8>, String> {
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
                GIT_NOT_INSTALLED.to_string()
            } else {
                e.to_string()
            }
        })?;

    let code = output.status.code().unwrap_or(-1);
    if output.status.success() || tolerated.contains(&code) {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
        Err(if stderr.is_empty() { format!("git exited with code {code}") } else { stderr })
    }
}

fn run_local_merged(args: &[&str], cwd: &str) -> Result<String, String> {
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
                GIT_NOT_INSTALLED.to_string()
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

/// Runs an arbitrary script locally via `sh -c` (only used by the bundled
/// workspace-state probe, which needs real shell semantics) — everything
/// else stays on the shell-free `Command::args()` path above.
fn run_local_script(script: &str, cwd: &str) -> Result<(Vec<u8>, i32), String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }
    let output = Command::new("sh")
        .arg("-c")
        .arg(script)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .current_dir(&cwd_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    Ok((output.stdout, output.status.code().unwrap_or(-1)))
}

// ─── Remote execution ───────────────────────────────────────────────────────

/// Runs `script` on the remote host via `bash -lc`, falling back to
/// `sh -c` only if the login-shell attempt itself fails with a "bash not
/// found"-shaped error — non-interactive `exec()` channels skip
/// `.bashrc`/profile by default, so a login shell is needed for `git` to
/// resolve the same PATH an interactive SSH session would see. Real
/// transport-level failures (broken pipe, connection reset) are classified
/// via `is_network_error` and reported by removing the dead session +
/// emitting `ssh_connection_lost`, matching the existing SFTP browsing error
/// path so every surface reacts the same way to a dropped connection.
fn run_remote_script_sync(
    sftp_state: &SftpState,
    app: &tauri::AppHandle,
    session_id: &str,
    script: &str,
) -> Result<(Vec<u8>, Vec<u8>, i32), String> {
    let emit_connection_lost = |reason: &str| {
        use tauri::Emitter;
        let _ = app.emit(
            "ssh_connection_lost",
            serde_json::json!({ "session_id": session_id, "reason": reason }),
        );
    };

    let inner_arc = {
        let map = sftp_state.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(session_id).ok_or_else(|| {
            // The session is already confirmed gone here — emit directly
            // instead of routing through `is_network_error`, which exists to
            // *classify* an error we don't yet know the nature of.
            let reason = "no SSH session for this host — reconnect and try again".to_string();
            emit_connection_lost(&reason);
            reason
        })?;
        entry.inner.clone()
    };
    let inner = inner_arc.lock().map_err(|e| e.to_string())?;

    let exec_via = |shell: &str, flag: &str| -> Result<(Vec<u8>, Vec<u8>, i32), String> {
        let mut channel = inner.session.channel_session().map_err(|e| e.to_string())?;
        let cmd = format!("{shell} {flag} {}", shell_quote(script));
        channel.exec(&cmd).map_err(|e| e.to_string())?;

        let mut stdout = Vec::new();
        channel.read_to_end(&mut stdout).map_err(|e| e.to_string())?;
        let mut stderr = Vec::new();
        channel.stderr().read_to_end(&mut stderr).map_err(|e| e.to_string())?;
        channel.wait_close().map_err(|e| e.to_string())?;
        Ok((stdout, stderr, channel.exit_status().unwrap_or(-1)))
    };

    let report_and_pass = |e: String| -> String {
        if is_network_error(&e) {
            if let Ok(mut map) = sftp_state.0.lock() {
                map.remove(session_id);
            }
            emit_connection_lost(&e);
        }
        e
    };

    let attempt = exec_via("bash", "-lc").map_err(report_and_pass)?;

    if attempt.2 == 127 && shell_missing(&attempt.1, "bash") {
        return exec_via("sh", "-c").map_err(report_and_pass);
    }
    Ok(attempt)
}

/// Best-effort heuristic: does stderr look like the *shell itself* (not
/// `git`) was missing? e.g. `sh: bash: not found` / `-sh: bash: command not
/// found`. Used only to decide whether the `sh -c` fallback is worth trying.
fn shell_missing(stderr: &[u8], shell: &str) -> bool {
    let s = String::from_utf8_lossy(stderr).to_lowercase();
    s.contains(shell) && (s.contains("not found") || s.contains("no such file"))
}

/// Maps a non-zero-exit remote failure to the same error strings the local
/// codepath produces, so the frontend's existing string-based handling
/// (`useGitStatus.ts`'s "git not installed" branch) fires unchanged.
fn normalize_git_error(exit_code: i32, stderr: &str) -> String {
    if looks_like_missing_git(exit_code, stderr.as_bytes()) {
        return GIT_NOT_INSTALLED.to_string();
    }
    if stderr.is_empty() {
        format!("git exited with code {exit_code}")
    } else {
        stderr.to_string()
    }
}
