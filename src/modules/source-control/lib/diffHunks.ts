/**
 * Groups a unified diff (as produced by `git_get_diff`) into per-file,
 * per-hunk structures and builds standalone one-hunk patches from them —
 * the frontend half of hunk-level staging (`git_stage_hunk`/
 * `git_unstage_hunk` apply the patch via `git apply --cached[--reverse]`
 * on the Rust side, see `src-tauri/src/modules/git/mod.rs`).
 *
 * Everything here operates on raw substrings of the original diff text
 * (splitting/rejoining on "\n" only) rather than re-serializing lines —
 * that's what keeps this safe for files with CRLF line endings: git's own
 * diff output terminates *header* lines ("diff --git", "index", "---",
 * "+++", "@@ ... @@") with a plain "\n", while `+`/`-`/context *content*
 * lines carry the file's original line ending (e.g. a trailing "\r") as
 * part of their content, before the "\n" that the diff stream itself adds.
 * Splitting on "\n" and rejoining with "\n" round-trips that untouched.
 */

const FILE_HEADER_RE = /^diff --git a\/.+ b\/(.+)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/;

export interface DiffHunk {
  /** The raw "@@ -a,b +c,d @@ ..." line, including any trailing context git appends. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Raw body lines (context/`+`/`-`/"\ No newline at end of file"), unmodified, in original order. */
  lines: string[];
}

export interface FileDiff {
  /** The b-side path (post-rename path for renames) — matches the `file` argument other git_* commands take. */
  path: string;
  /** Raw lines from "diff --git ..." up to (excluding) the first hunk header — needed to build a standalone patch. */
  headerLines: string[];
  hunks: DiffHunk[];
  isNewFile: boolean;
  isDeletedFile: boolean;
}

/**
 * Parses a (possibly multi-file) diff into per-file hunk structures.
 *
 * Returns `[]` for a diff that was truncated by the backend's 200 KB cap
 * (`git_get_diff`'s `truncate_diff`) — a truncated diff may have a cut-off
 * final hunk, and building a patch from that could silently corrupt the
 * index instead of just failing loudly, so hunk staging is disabled
 * entirely rather than risk it.
 */
export function parseDiffHunks(diffContent: string): FileDiff[] {
  if (!diffContent || diffContent.includes("[diff truncated") || diffContent.includes("[diff too large]")) {
    return [];
  }

  const chunks = diffContent.split(/^(?=diff --git a\/.+ b\/.+$)/m);
  const files: FileDiff[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    // A chunk's raw text always ends with the "\n" that terminates its last
    // line (git's own output, and the boundary right before the next
    // file's "diff --git" line) — that produces one trailing "" element
    // here that isn't a real line (a genuinely blank context line is " ",
    // not ""). Drop it so it isn't mistaken for hunk content.
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    const fileMatch = FILE_HEADER_RE.exec(lines[0] ?? "");
    if (!fileMatch) continue;

    const path = fileMatch[1];
    const firstHunkIdx = lines.findIndex((l) => HUNK_HEADER_RE.test(l));
    const headerLines = firstHunkIdx === -1 ? lines : lines.slice(0, firstHunkIdx);
    const isNewFile = headerLines.some((l) => l.startsWith("new file mode"));
    const isDeletedFile = headerLines.some((l) => l.startsWith("deleted file mode"));

    const hunks: DiffHunk[] = [];
    if (firstHunkIdx !== -1) {
      let i = firstHunkIdx;
      while (i < lines.length) {
        const headerMatch = HUNK_HEADER_RE.exec(lines[i]);
        if (!headerMatch) break;
        const header = lines[i];
        const bodyStart = i + 1;
        let bodyEnd = bodyStart;
        while (bodyEnd < lines.length && !HUNK_HEADER_RE.test(lines[bodyEnd])) bodyEnd++;
        hunks.push({
          header,
          oldStart: Number(headerMatch[1]),
          oldLines: headerMatch[2] !== undefined ? Number(headerMatch[2]) : 1,
          newStart: Number(headerMatch[3]),
          newLines: headerMatch[4] !== undefined ? Number(headerMatch[4]) : 1,
          lines: lines.slice(bodyStart, bodyEnd),
        });
        i = bodyEnd;
      }
    }

    files.push({ path, headerLines, hunks, isNewFile, isDeletedFile });
  }

  return files;
}

/**
 * Builds a standalone one-hunk unified-diff patch (file headers + exactly
 * one `@@` block) suitable for `git apply --cached[--reverse]` — the exact
 * shape a real `git diff` produces for a single-hunk file, just with the
 * other hunks of a multi-hunk file omitted.
 */
export function buildHunkPatch(file: FileDiff, hunk: DiffHunk): string {
  return `${[...file.headerLines, hunk.header, ...hunk.lines].join("\n")}\n`;
}

/**
 * A brand-new (or fully-deleted) file always collapses into exactly one
 * hunk covering the entire file — there's no "unchanged" content on the
 * empty side of the diff to split it into multiple hunks. Applying/
 * reverse-applying a patch shaped like that via `git apply --cached` is
 * more fragile than just using the plain whole-file stage/unstage commands
 * (`git add` / `git restore --staged`), which do the exact same thing far
 * more robustly — so callers should prefer that fallback whenever this
 * returns `true` instead of building/sending a hunk patch.
 */
export function isWholeFileSingleHunk(file: FileDiff): boolean {
  return (file.isNewFile || file.isDeletedFile) && file.hunks.length === 1;
}
