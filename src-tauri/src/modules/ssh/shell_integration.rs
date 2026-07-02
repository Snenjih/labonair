// Remote-shell OSC7/133 bootstrap.
//
// `channel.shell()` (see pty.rs) just starts the user's unmodified remote
// login shell, so it never emits the OSC7 cwd-report the local PTY relies on
// (local gets it via ZDOTDIR/--rcfile injection, see pty::shell_init). This
// module reuses the exact same hook scripts, but installs them by writing
// files into the remote's own `~/.cache/labonair/shell-integration/` and
// re-execing into the right shell — all in a single `channel.exec()` round
// trip instead of a separate SFTP write pass.
//
// The heredoc bodies are quoted (`<<'LABONAIR_EOF'`) so the remote shell
// never expands `$PWD`/`$(...)`/etc. while writing the files — identical
// semantics to the local `fs::write` of the same script content.
//
// Detection reads `$SHELL` (set by sshd from the user's /etc/passwd entry)
// rather than probing interactively — same source of truth `pty::shell_init`
// uses locally. Unrecognized shells fall through to a plain login shell with
// no integration, mirroring `Shell::Other` locally: cwd then falls back to
// whatever `useExplorerTarget` already had (host default / static root)
// instead of following `cd`.
use crate::modules::pty::shell_init::{BASHRC, ZLOGIN, ZPROFILE, ZSHENV, ZSHRC};

const HEREDOC_DELIM: &str = "LABONAIR_EOF";

fn heredoc(target_path: &str, content: &str) -> String {
    format!("cat > {target_path} <<'{HEREDOC_DELIM}'\n{content}{HEREDOC_DELIM}\n")
}

/// Builds the `/bin/sh`-compatible bootstrap script. Caller is responsible
/// for shell-quoting the result before passing it to `channel.exec()`.
pub(crate) fn build_bootstrap_script() -> String {
    format!(
        r#"case "$SHELL" in
  */zsh)
    zd="$HOME/.cache/labonair/shell-integration/zsh"
    mkdir -p "$zd" 2>/dev/null
{zshenv}{zprofile}{zshrc}{zlogin}    export ZDOTDIR="$zd"
    exec "$SHELL" -l
    ;;
  */bash)
    bd="$HOME/.cache/labonair/shell-integration/bash"
    mkdir -p "$bd" 2>/dev/null
{bashrc}    exec "$SHELL" --rcfile "$bd/bashrc" -i
    ;;
  *)
    exec "${{SHELL:-/bin/sh}}" -l
    ;;
esac
"#,
        zshenv = heredoc("\"$zd/.zshenv\"", ZSHENV),
        zprofile = heredoc("\"$zd/.zprofile\"", ZPROFILE),
        zshrc = heredoc("\"$zd/.zshrc\"", ZSHRC),
        zlogin = heredoc("\"$zd/.zlogin\"", ZLOGIN),
        bashrc = heredoc("\"$bd/bashrc\"", BASHRC),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn balances_heredoc_delimiters() {
        let script = build_bootstrap_script();
        let opens = script.matches(&format!("<<'{HEREDOC_DELIM}'")).count();
        let closes = script
            .lines()
            .filter(|l| l.trim() == HEREDOC_DELIM)
            .count();
        assert_eq!(opens, 5);
        assert_eq!(closes, 5);
    }

    #[test]
    fn none_of_the_scripts_contain_the_delimiter_line() {
        for script in [ZSHENV, ZPROFILE, ZLOGIN, ZSHRC, BASHRC] {
            assert!(!script.lines().any(|l| l.trim() == HEREDOC_DELIM));
        }
    }

    #[test]
    fn ends_every_branch_with_exec() {
        let script = build_bootstrap_script();
        assert!(script.contains("exec \"$SHELL\" -l"));
        assert!(script.contains("exec \"$SHELL\" --rcfile"));
        assert!(script.contains("exec \"${SHELL:-/bin/sh}\" -l"));
    }
}
