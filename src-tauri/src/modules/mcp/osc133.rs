use vte::{Parser, Perform};

#[derive(Default)]
struct Performer {
    clean: String,
    done: bool,
    exit_code: Option<i32>,
}

impl Perform for Performer {
    fn print(&mut self, c: char) {
        self.clean.push(c);
    }

    /// C0 control bytes never reach `print` — only `\n`/`\r`/`\t` are kept so
    /// multi-line command output stays readable; other control bytes (bell,
    /// backspace, etc.) are dropped rather than echoed into the captured text.
    fn execute(&mut self, byte: u8) {
        if byte == b'\n' || byte == b'\r' || byte == b'\t' {
            self.clean.push(byte as char);
        }
    }

    /// Only OSC 133 is meaningful here — see `ssh/shell_integration.rs` and
    /// `pty/scripts/{zshrc.zsh,bashrc.bash}` for the exact sequences this
    /// matches (`ESC ] 133 ; D [ ; <exit_code> ] ESC \`). OSC 7 (cwd) and any
    /// other OSC/CSI/ESC sequence are intentionally ignored — this capture
    /// only cares about command-finished + exit code, not terminal redraw.
    fn osc_dispatch(&mut self, params: &[&[u8]], _bell_terminated: bool) {
        if params.len() < 2 || params[0] != b"133" || params[1] != b"D" {
            return;
        }
        self.done = true;
        if let Some(code_bytes) = params.get(2) {
            if let Ok(s) = std::str::from_utf8(code_bytes) {
                self.exit_code = s.parse::<i32>().ok();
            }
        }
    }
}

/// Streaming OSC-133 boundary + plain-text capture for a command injected by
/// the MCP bridge (`modules::mcp`). Feeds raw PTY chunks through a `vte`
/// parser so cursor-movement/color escape sequences never pollute the
/// captured text, while an OSC 133 `D` marker signals the command has
/// finished. Takes raw bytes rather than `&str` — `vte::Parser::advance`
/// decodes UTF-8 itself and correctly buffers a multi-byte sequence split
/// across two `feed()` calls, so this works equally well against SSH's
/// already-UTF-8-repaired chunks (`ssh/pty.rs`'s `flush_carry`) and local
/// PTY's raw, unrepaired bytes (`pty/session.rs`) — no separate repair step
/// needed for either caller.
pub struct Osc133Capture {
    parser: Parser,
    performer: Performer,
}

impl Osc133Capture {
    pub fn new() -> Self {
        Self {
            parser: Parser::new(),
            performer: Performer::default(),
        }
    }

    pub fn feed(&mut self, chunk: &[u8]) {
        self.parser.advance(&mut self.performer, chunk);
    }

    /// `Some(exit_code)` once an OSC 133 `D` marker has been seen — the outer
    /// `Option` is "has the command finished", the inner one is "did the
    /// marker actually carry a parseable exit code" (a bare `D` means
    /// finished with an unknown code, matching the frontend's tolerance in
    /// `osc-handlers.ts`).
    pub fn finished(&self) -> Option<Option<i32>> {
        if self.performer.done {
            Some(self.performer.exit_code)
        } else {
            None
        }
    }

    pub fn clean_output(&self) -> &str {
        &self.performer.clean
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_exit_code_and_strips_escapes() {
        let mut cap = Osc133Capture::new();
        cap.feed(b"\x1b]133;C\x1b\\echo hi\r\nhi\r\n\x1b]133;D;0\x1b\\");
        assert_eq!(cap.finished(), Some(Some(0)));
        assert_eq!(cap.clean_output(), "echo hi\r\nhi\r\n");
    }

    #[test]
    fn bare_d_marks_finished_with_unknown_code() {
        let mut cap = Osc133Capture::new();
        cap.feed(b"\x1b]133;D\x1b\\");
        assert_eq!(cap.finished(), Some(None));
    }

    #[test]
    fn not_finished_without_d_marker() {
        let mut cap = Osc133Capture::new();
        cap.feed(b"still running\r\n");
        assert_eq!(cap.finished(), None);
    }

    #[test]
    fn strips_cursor_and_color_csi_sequences() {
        let mut cap = Osc133Capture::new();
        cap.feed(b"\x1b[31mred\x1b[0m text\x1b]133;D;1\x1b\\");
        assert_eq!(cap.clean_output(), "red text");
        assert_eq!(cap.finished(), Some(Some(1)));
    }

    #[test]
    fn handles_chunked_feed_across_marker_boundary() {
        let mut cap = Osc133Capture::new();
        cap.feed(b"output\x1b]133");
        cap.feed(b";D;42\x1b\\");
        assert_eq!(cap.clean_output(), "output");
        assert_eq!(cap.finished(), Some(Some(42)));
    }

    #[test]
    fn handles_raw_bytes_split_mid_utf8_sequence() {
        // "é" = 0xC3 0xA9 — split across two feed() calls, exactly the
        // scenario local PTY's unrepaired raw-byte tap can produce.
        let mut cap = Osc133Capture::new();
        cap.feed(&[0xC3]);
        cap.feed(&[0xA9]);
        cap.feed(b"\x1b]133;D;0\x1b\\");
        assert_eq!(cap.clean_output(), "é");
        assert_eq!(cap.finished(), Some(Some(0)));
    }
}
