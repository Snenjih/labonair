/// Single-quotes a string for safe inclusion in a remote shell command line.
/// Embedded single quotes are escaped via the standard `'\''` technique
/// (close quote, escaped quote, reopen quote), which also handles embedded
/// newlines, `$()`, backticks, and other shell metacharacters correctly
/// since nothing inside single quotes is interpreted except `'` itself.
pub(crate) fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_plain_string() {
        assert_eq!(shell_quote("hello"), "'hello'");
    }

    #[test]
    fn escapes_embedded_single_quote() {
        assert_eq!(shell_quote("it's a test"), "'it'\\''s a test'");
    }

    #[test]
    fn escapes_multiple_single_quotes() {
        assert_eq!(shell_quote("'a' 'b'"), "''\\''a'\\'' '\\''b'\\'''");
    }

    #[test]
    fn handles_command_substitution_syntax() {
        // Everything inside single quotes is inert — $() and backticks are
        // not interpreted by the shell as long as the quoting is unbroken.
        assert_eq!(shell_quote("$(rm -rf /)"), "'$(rm -rf /)'");
        assert_eq!(shell_quote("`whoami`"), "'`whoami`'");
    }

    #[test]
    fn handles_embedded_newline() {
        assert_eq!(shell_quote("line1\nline2"), "'line1\nline2'");
    }

    #[test]
    fn handles_empty_string() {
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn handles_unicode() {
        assert_eq!(shell_quote("commit: 修复 bug"), "'commit: 修复 bug'");
    }

    #[test]
    fn handles_backslashes() {
        assert_eq!(shell_quote("C:\\path\\to\\file"), "'C:\\path\\to\\file'");
    }
}
