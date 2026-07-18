use crate::modules::sftp::net_error::is_network_error;
use crate::modules::ssh::SshState;
use crate::modules::ssh::shell::shell_quote;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;

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
        ssh_state: SshState,
        app: tauri::AppHandle,
    },
}

pub(crate) fn resolve_executor(
    path: String,
    session_id: Option<String>,
    ssh_state: SshState,
    app: tauri::AppHandle,
) -> GitExecutor {
    match session_id {
        Some(session_id) => GitExecutor::Remote { session_id, cwd: path, ssh_state, app },
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
            GitExecutor::Remote { session_id, cwd, ssh_state, app } => {
                let script = format!("cd {} && {}", shell_quote(cwd), script);
                run_remote_script(ssh_state, app, session_id, &script)
                    .await
                    .map(|(stdout, _stderr, exit_code)| (stdout, exit_code))
            }
        }
    }

    /// Runs a single git subcommand with `stdin_bytes` piped to the child's
    /// stdin — used exclusively by hunk staging's `git apply --cached[
    /// --reverse]`, which reads the patch to apply from stdin. Every other
    /// command in this module runs with no stdin at all (`Stdio::null()`),
    /// so this is a dedicated variant rather than a retrofit of
    /// `run`/`run_raw`/`run_merged`.
    pub(crate) async fn run_with_stdin(&self, args: &[&str], stdin_bytes: Vec<u8>) -> Result<(), String> {
        match self {
            GitExecutor::Local { cwd } => run_local_with_stdin(args, cwd, &stdin_bytes).await.map(|_| ()),
            GitExecutor::Remote { session_id, cwd, ssh_state, app } => {
                let quoted_args: String = args.iter().map(|a| shell_quote(a)).collect::<Vec<_>>().join(" ");
                let cwd_quoted = shell_quote(cwd);
                let script = format!("LC_ALL=C GIT_TERMINAL_PROMPT=0 git -C {cwd_quoted} {quoted_args}");
                let (_stdout, stderr, exit_code) =
                    run_remote_script_with_stdin(ssh_state, app, session_id, &script, &stdin_bytes).await?;
                if exit_code == 0 {
                    Ok(())
                } else {
                    let err = String::from_utf8_lossy(&stderr).trim_end().to_string();
                    Err(normalize_git_error(exit_code, &err))
                }
            }
        }
    }

    async fn exec_remote_args(&self, args: &[&str]) -> Result<(Vec<u8>, Vec<u8>, i32), String> {
        let GitExecutor::Remote { session_id, cwd, ssh_state, app } = self else {
            unreachable!("exec_remote_args called on Local executor");
        };
        let quoted_args: String = args.iter().map(|a| shell_quote(a)).collect::<Vec<_>>().join(" ");
        let cwd_quoted = shell_quote(cwd);
        let build_script =
            |git_bin: &str| format!("LC_ALL=C GIT_TERMINAL_PROMPT=0 {git_bin} -C {cwd_quoted} {quoted_args}");

        let run = |script: String| async move { run_remote_script(ssh_state, app, session_id, &script).await };

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

/// Runs a git subcommand locally with `stdin_bytes` piped to its stdin —
/// the only local execution path that needs a real (non-null) stdin, so it
/// uses `tokio::process::Command` directly instead of the
/// `spawn_blocking`-wrapped sync `std::process::Command` the other local
/// paths use. Writes the patch, then explicitly closes the write half by
/// dropping it *before* awaiting the child's output: git reads its patch
/// from stdin until EOF, so a stdin handle left open would make `git apply`
/// hang forever waiting for more input that will never come.
async fn run_local_with_stdin(args: &[&str], cwd: &str, stdin_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let cwd_path = PathBuf::from(cwd);
    if !cwd_path.is_dir() {
        return Err(format!("not a directory: {cwd}"));
    }

    let mut child = TokioCommand::new("git")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args)
        .current_dir(&cwd_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GIT_NOT_INSTALLED.to_string()
            } else {
                e.to_string()
            }
        })?;

    {
        // `.take()` moves the handle out of `child` into this block scope —
        // it's dropped (closing the pipe's write end) at the end of the
        // block, before `wait_with_output()` is called below.
        let mut stdin = child.stdin.take().ok_or_else(|| "failed to open child stdin".to_string())?;
        stdin.write_all(stdin_bytes).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
    let code = output.status.code().unwrap_or(-1);
    if output.status.success() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
        Err(if stderr.is_empty() { format!("git exited with code {code}") } else { stderr })
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
async fn run_remote_script(
    ssh_state: &SshState,
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

    let session = {
        let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
        map.get(session_id)
            .ok_or_else(|| {
                // The session is already confirmed gone here — emit directly
                // instead of routing through `is_network_error`, which exists
                // to *classify* an error we don't yet know the nature of.
                let reason = "no SSH session for this host — reconnect and try again".to_string();
                emit_connection_lost(&reason);
                reason
            })?
            .clone()
    };

    let report_and_pass = |e: String| -> String {
        if is_network_error(&e) {
            if let Ok(mut map) = ssh_state.0.lock() {
                map.remove(session_id);
            }
            emit_connection_lost(&e);
        }
        e
    };

    // One `.wait()` loop interleaves stdout/stderr as they arrive off the same
    // message stream, mirroring `ssh/exec.rs::ssh_exec_command` and
    // `sftp/worker.rs::compute_remote_md5` — replaces the old sequential
    // `read_to_end(stdout)` then `stderr().read_to_end()` pattern, which risked
    // stalling if the remote process filled its stderr flow-control window
    // while stdout was still draining.
    let exec_via = |shell: &'static str, flag: &'static str| {
        let session = session.clone();
        let cmd = format!("{shell} {flag} {}", shell_quote(script));
        async move {
            let mut channel = session
                .handle
                .channel_open_session()
                .await
                .map_err(|e| e.to_string())?;
            channel.exec(true, cmd).await.map_err(|e| e.to_string())?;

            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            let mut exit_code: i32 = -1;
            while let Some(msg) = channel.wait().await {
                match msg {
                    russh::ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
                    russh::ChannelMsg::ExtendedData { data, ext: 1 } => stderr.extend_from_slice(&data),
                    russh::ChannelMsg::ExtendedData { .. } => {}
                    // `ExitStatus` is sent by the server *after* `Eof` (and
                    // before `Close`), so breaking on Eof/Close here would
                    // discard it and leave `exit_code` stuck at -1 forever —
                    // matches russh's own client_exec_simple.rs example,
                    // which explicitly warns against leaving the loop early.
                    // `channel.wait()` returns `None` on its own once the
                    // channel is fully closed, ending the loop naturally.
                    russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
                    _ => {}
                }
            }
            Ok::<(Vec<u8>, Vec<u8>, i32), String>((stdout, stderr, exit_code))
        }
    };

    let attempt = exec_via("bash", "-lc").await.map_err(report_and_pass)?;

    if attempt.2 == 127 && shell_missing(&attempt.1, "bash") {
        return exec_via("sh", "-c").await.map_err(report_and_pass);
    }
    Ok(attempt)
}

/// Same execution shape as `run_remote_script` (login-shell exec via `bash
/// -lc`, falling back to `sh -c` only if bash itself is missing; dead-session
/// detection via `is_network_error`) but additionally pipes `stdin_bytes` to
/// the remote process before reading its output. Used only by the hunk
/// staging `git apply --cached` path, which reads the patch to apply from
/// stdin — every other remote command has nothing to write, so this is a
/// separate function rather than an extra parameter threaded through
/// `run_remote_script`.
async fn run_remote_script_with_stdin(
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    session_id: &str,
    script: &str,
    stdin_bytes: &[u8],
) -> Result<(Vec<u8>, Vec<u8>, i32), String> {
    let emit_connection_lost = |reason: &str| {
        use tauri::Emitter;
        let _ = app.emit(
            "ssh_connection_lost",
            serde_json::json!({ "session_id": session_id, "reason": reason }),
        );
    };

    let session = {
        let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
        map.get(session_id)
            .ok_or_else(|| {
                let reason = "no SSH session for this host — reconnect and try again".to_string();
                emit_connection_lost(&reason);
                reason
            })?
            .clone()
    };

    let report_and_pass = |e: String| -> String {
        if is_network_error(&e) {
            if let Ok(mut map) = ssh_state.0.lock() {
                map.remove(session_id);
            }
            emit_connection_lost(&e);
        }
        e
    };

    let exec_via = |shell: &'static str, flag: &'static str| {
        let session = session.clone();
        let cmd = format!("{shell} {flag} {}", shell_quote(script));
        async move {
            let mut channel = session
                .handle
                .channel_open_session()
                .await
                .map_err(|e| e.to_string())?;
            channel.exec(true, cmd).await.map_err(|e| e.to_string())?;

            // Write the patch to the remote process's stdin, then signal EOF
            // — *before* entering the read loop below. `git apply` blocks
            // reading stdin until it sees EOF, so this must happen first or
            // the exchange deadlocks (we'd be waiting for output the remote
            // process won't produce until it's done reading, and it won't
            // finish reading until we send EOF).
            channel.data_bytes(stdin_bytes.to_vec()).await.map_err(|e| e.to_string())?;
            channel.eof().await.map_err(|e| e.to_string())?;

            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            let mut exit_code: i32 = -1;
            while let Some(msg) = channel.wait().await {
                match msg {
                    russh::ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
                    russh::ChannelMsg::ExtendedData { data, ext: 1 } => stderr.extend_from_slice(&data),
                    russh::ChannelMsg::ExtendedData { .. } => {}
                    // Same Eof/ExitStatus ordering caveat as `run_remote_script`:
                    // the server sends `ExitStatus` *after* `Eof` (and before
                    // `Close`), so breaking out of this loop early would leave
                    // `exit_code` stuck at -1. `channel.wait()` returns `None`
                    // on its own once the channel is fully closed.
                    russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
                    _ => {}
                }
            }
            Ok::<(Vec<u8>, Vec<u8>, i32), String>((stdout, stderr, exit_code))
        }
    };

    let attempt = exec_via("bash", "-lc").await.map_err(report_and_pass)?;

    if attempt.2 == 127 && shell_missing(&attempt.1, "bash") {
        return exec_via("sh", "-c").await.map_err(report_and_pass);
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
