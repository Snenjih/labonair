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

async function readLocalHistory(): Promise<string[]> {
  let combined = "";
  // Shell type isn't reliably known frontend-side (terminalShell may be
  // empty = auto-detect) — reading both and merging is simpler and more
  // robust than guessing which one is actually in use.
  for (const path of ["~/.zsh_history", "~/.bash_history"]) {
    try {
      const r = await invoke<ReadResult>("fs_read_file", { path });
      if (r.kind === "text") combined += `${r.content}\n`;
    } catch {
      // File doesn't exist or isn't readable — try the next candidate.
    }
  }
  return dedupeKeepLast(parseHistoryContent(combined), MAX_HISTORY);
}

async function readSshHistory(sessionId: string): Promise<string[]> {
  try {
    // One-shot exec on the existing SSH session (ssh_exec_command opens its
    // own channel — doesn't touch the visible interactive PTY). `~` expands
    // via the remote shell itself, so this works regardless of remote shell
    // type without needing to know it. Errors from missing files are
    // suppressed so the command still exits 0 with whatever did exist.
    const r = await invoke<{ stdout: string; stderr: string; exit_code: number }>("ssh_exec_command", {
      sessionId,
      command: "cat ~/.zsh_history ~/.bash_history 2>/dev/null",
    });
    return dedupeKeepLast(parseHistoryContent(r.stdout), MAX_HISTORY);
  } catch {
    return [];
  }
}

export async function loadHistory(sessionId: string, source: HistorySource): Promise<void> {
  const list = source.kind === "local" ? await readLocalHistory() : await readSshHistory(source.sessionId);
  sessionCache.set(sessionId, list);
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
