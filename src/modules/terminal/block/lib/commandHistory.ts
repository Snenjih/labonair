import { invoke } from "@tauri-apps/api/core";

// TODO: also search src/modules/snippets (user-saved reusable commands, see
// commandSnippetsStore.ts) as a suggestion source alongside shell history —
// snippets are curated/named, history is just "what the shell already knows
// you ran". Merging the two lets Tab-complete surface saved snippets too.

export type HistorySource = { kind: "local" } | { kind: "ssh"; sessionId: string };

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

const MAX_HISTORY = 1000;

// Deliberately reads the shell's own history file rather than keeping a
// separate self-recorded store — ghost-text and the history popup should
// show exactly what ↑ already surfaces when typing directly into the
// terminal, not a parallel Nexum-only list. Cached per session (different
// sessions can be different hosts/shells with different history), and
// re-fetched by the caller (ShellComposerInput) each time a command
// finishes, which is how newly-run commands show up with no explicit
// "record" step.
const sessionCache = new Map<string, string[]>();

// zsh's EXTENDED_HISTORY option (on by default in most modern setups, e.g.
// Oh My Zsh) prefixes each line with `: <timestamp>:<duration>;`; bash with
// HISTTIMEFORMAT set writes a bare `#<timestamp>` comment line before each
// command. Lines matching neither are used as-is, which covers plain zsh/
// bash history with no such option enabled.
function parseHistoryContent(content: string): string[] {
  const out: string[] = [];
  for (const raw of content.split("\n")) {
    if (!raw) continue;
    if (/^#\d+$/.test(raw.trim())) continue;
    const m = raw.match(/^: \d+:\d+;(.*)$/);
    const cmd = (m ? m[1] : raw).trim();
    if (cmd) out.push(cmd);
  }
  return out;
}

/** De-duplicates keeping each command's most recent occurrence/position,
 *  then caps to the last `cap` entries — oldest-first on return, matching
 *  historyListFor's contract (mirrors how a real shell's `history` reads). */
function dedupeKeepLast(list: string[], cap: number): string[] {
  const seen = new Set<string>();
  const rev: string[] = [];
  for (let i = list.length - 1; i >= 0 && rev.length < cap; i--) {
    if (seen.has(list[i])) continue;
    seen.add(list[i]);
    rev.push(list[i]);
  }
  rev.reverse();
  return rev;
}

// macOS's system-wide /etc/zshrc (and several zsh frameworks) set
// `HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history`. Nexum's own shell-integration
// overrides $ZDOTDIR for every local/SSH session it spawns (see
// pty::shell_init / ssh::shell_integration on the Rust side) so its hooks
// can install without clobbering the user's real rc files — but that means
// HISTFILE also resolves under Nexum's cache dir for the whole session
// unless the user's own .zshrc/framework later resets it back to $HOME.
// Reading only "~/.zsh_history" therefore silently misses everything typed
// inside Nexum itself on a very common setup (verified: this is macOS's
// literal default). Read both locations and merge — whichever one the
// active session's zsh actually wrote to will have the real content, the
// other just contributes nothing.
const ZDOTDIR_OVERRIDE_ZSH_HISTORY = "~/.cache/labonair/shell-integration/zsh/.zsh_history";

async function readTextFile(path: string): Promise<string | null> {
  try {
    const r = await invoke<ReadResult>("fs_read_file", { path });
    return r.kind === "text" ? r.content : null;
  } catch {
    return null; // doesn't exist / unreadable — not fatal, just skip it
  }
}

async function readLocalHistory(): Promise<string[]> {
  // Shell type isn't reliably known frontend-side (terminalShell may be
  // empty = auto-detect) — reading all candidates and merging is simpler
  // and more robust than guessing which one is actually in use. The
  // ZDOTDIR-override path is read last so its entries win ties in
  // dedupeKeepLast (it's the one Nexum's own sessions actually write to).
  const contents = await Promise.all(
    ["~/.zsh_history", "~/.bash_history", ZDOTDIR_OVERRIDE_ZSH_HISTORY].map(readTextFile),
  );
  const combined = contents.filter((c): c is string => c !== null).join("\n");
  return dedupeKeepLast(parseHistoryContent(combined), MAX_HISTORY);
}

async function readSshHistory(sessionId: string): Promise<string[]> {
  try {
    // One-shot exec on the existing SSH session (ssh_exec_command opens its
    // own channel — doesn't touch the visible interactive PTY). `~` expands
    // via the remote shell itself, so this works regardless of remote shell
    // type without needing to know it. Errors from missing files are
    // suppressed so the command still exits 0 with whatever did exist. The
    // remote gets the same ZDOTDIR override for the same reason (see
    // ssh/shell_integration.rs's build_bootstrap_script) so its history can
    // land in the same cache-relative spot.
    const r = await invoke<{ stdout: string; stderr: string; exit_code: number }>("ssh_exec_command", {
      sessionId,
      command: `cat ~/.zsh_history ~/.bash_history ${ZDOTDIR_OVERRIDE_ZSH_HISTORY} 2>/dev/null`,
    });
    return dedupeKeepLast(parseHistoryContent(r.stdout), MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function loadHistory(sessionId: string, source: HistorySource): Promise<void> {
  const list = source.kind === "local" ? await readLocalHistory() : await readSshHistory(source.sessionId);
  sessionCache.set(sessionId, list);
  if (list.length === 0) {
    console.warn(
      `[labonair] command history: 0 entries found for session ${sessionId} (${source.kind}). ` +
        "Checked ~/.zsh_history, ~/.bash_history, and the ZDOTDIR-override path — none had readable content.",
    );
  }
}

/** Oldest-first, for Up/Down history navigation and the history popup
 *  (most recent = last). Empty until the first `loadHistory` resolves. */
export function historyListFor(sessionId: string): string[] {
  return sessionCache.get(sessionId) ?? [];
}

/** Ghost-text suggestion for `prefix` within one session's history — the
 *  most recent matching command (searched newest-first), or null. */
export function suggestFor(sessionId: string, prefix: string): string | null {
  if (!prefix) return null;
  const list = sessionCache.get(sessionId);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== prefix && list[i].startsWith(prefix)) return list[i];
  }
  return null;
}

export function disposeHistory(sessionId: string): void {
  sessionCache.delete(sessionId);
}

// Dev-only inspection hook — call __labonairHistory() in the WebView
// devtools console to see exactly what's cached per session (mirrors the
// __labonairTerm debug hook in terminalSessionRegistry.ts).
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __labonairHistory?: unknown }).__labonairHistory = () =>
    Object.fromEntries(sessionCache.entries());
}
