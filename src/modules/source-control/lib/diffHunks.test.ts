import { describe, expect, it } from "vitest";
import { buildHunkPatch, isWholeFileSingleHunk, parseDiffHunks } from "./diffHunks";

// Fixtures below are byte-for-byte copies of real `git diff` output
// (verified manually against an actual repo during development), not
// hand-typed approximations — including the exact trailing-context text
// git appends to a hunk header (e.g. "@@ ... @@ a10").

const TWO_HUNK_DIFF = [
  "diff --git a/tracked.txt b/tracked.txt",
  "index fe7fa38..e0b0b1c 100644",
  "--- a/tracked.txt",
  "+++ b/tracked.txt",
  "@@ -1,5 +1,5 @@",
  " a1",
  "-a2",
  "+a2_CHANGED",
  " a3",
  " a4",
  " a5",
  "@@ -11,5 +11,5 @@ a10",
  " a11",
  " a12",
  " a13",
  "-a14",
  "+a14_CHANGED",
  " a15",
  "",
].join("\n");

const NEW_FILE_DIFF = [
  "diff --git a/newfile.txt b/newfile.txt",
  "new file mode 100644",
  "index 0000000..71ac1b5",
  "--- /dev/null",
  "+++ b/newfile.txt",
  "@@ -0,0 +1,8 @@",
  "+a",
  "+b",
  "+c",
  "+d",
  "+e",
  "+f",
  "+g",
  "+h",
  "",
].join("\n");

const DELETED_FILE_DIFF = [
  "diff --git a/newfile.txt b/newfile.txt",
  "deleted file mode 100644",
  "index 71ac1b5..0000000",
  "--- a/newfile.txt",
  "+++ /dev/null",
  "@@ -1,8 +0,0 @@",
  "-a",
  "-b",
  "-c",
  "-d",
  "-e",
  "-f",
  "-g",
  "-h",
  "",
].join("\n");

const CRLF_DIFF = [
  "diff --git a/crlf.txt b/crlf.txt",
  "index 46b21fa..f146c25 100644",
  "--- a/crlf.txt",
  "+++ b/crlf.txt",
  "@@ -1,5 +1,5 @@",
  " x1\r",
  "-x2\r",
  "+X2_CHANGED\r",
  " x3\r",
  " x4\r",
  " x5\r",
  "",
].join("\n");

describe("parseDiffHunks", () => {
  it("splits a modified file into its two hunks with parsed line numbers", () => {
    const files = parseDiffHunks(TWO_HUNK_DIFF);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file.path).toBe("tracked.txt");
    expect(file.isNewFile).toBe(false);
    expect(file.isDeletedFile).toBe(false);
    expect(file.hunks).toHaveLength(2);

    expect(file.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 5, newStart: 1, newLines: 5 });
    expect(file.hunks[1]).toMatchObject({ oldStart: 11, oldLines: 5, newStart: 11, newLines: 5 });
    // Trailing context text after the closing "@@" must survive verbatim.
    expect(file.hunks[1].header).toBe("@@ -11,5 +11,5 @@ a10");
  });

  it("detects a new file and flags it via isNewFile", () => {
    const [file] = parseDiffHunks(NEW_FILE_DIFF);
    expect(file.isNewFile).toBe(true);
    expect(file.isDeletedFile).toBe(false);
    expect(file.hunks).toHaveLength(1);
    expect(isWholeFileSingleHunk(file)).toBe(true);
  });

  it("detects a deleted file and flags it via isDeletedFile", () => {
    const [file] = parseDiffHunks(DELETED_FILE_DIFF);
    expect(file.isDeletedFile).toBe(true);
    expect(file.isNewFile).toBe(false);
    expect(isWholeFileSingleHunk(file)).toBe(true);
  });

  it("does not flag a normal multi-hunk modification as a whole-file single hunk", () => {
    const [file] = parseDiffHunks(TWO_HUNK_DIFF);
    expect(isWholeFileSingleHunk(file)).toBe(false);
  });

  it("preserves CRLF line endings on content lines untouched", () => {
    const [file] = parseDiffHunks(CRLF_DIFF);
    expect(file.hunks[0].lines).toContain(" x1\r");
    expect(file.hunks[0].lines).toContain("-x2\r");
    expect(file.hunks[0].lines).toContain("+X2_CHANGED\r");
  });

  it("returns an empty array for a diff truncated by the backend's size cap", () => {
    const truncated = TWO_HUNK_DIFF + "\n\n[diff truncated — output exceeded 200 KB]";
    expect(parseDiffHunks(truncated)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseDiffHunks("")).toEqual([]);
  });

  it("parses multiple files in a combined diff independently", () => {
    const combined = `${TWO_HUNK_DIFF}\n${NEW_FILE_DIFF}`;
    const files = parseDiffHunks(combined);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("tracked.txt");
    expect(files[1].path).toBe("newfile.txt");
    expect(files[1].isNewFile).toBe(true);
  });
});

describe("buildHunkPatch", () => {
  it("builds a standalone, apply-ready patch for a single hunk of a multi-hunk file", () => {
    const [file] = parseDiffHunks(TWO_HUNK_DIFF);
    const patch = buildHunkPatch(file, file.hunks[0]);
    expect(patch).toBe(
      [
        "diff --git a/tracked.txt b/tracked.txt",
        "index fe7fa38..e0b0b1c 100644",
        "--- a/tracked.txt",
        "+++ b/tracked.txt",
        "@@ -1,5 +1,5 @@",
        " a1",
        "-a2",
        "+a2_CHANGED",
        " a3",
        " a4",
        " a5",
        "",
      ].join("\n"),
    );
  });

  it("round-trips CRLF content bytes exactly (no lossy re-join)", () => {
    const [file] = parseDiffHunks(CRLF_DIFF);
    const patch = buildHunkPatch(file, file.hunks[0]);
    expect(patch).toContain(" x1\r\n");
    expect(patch).toContain("-x2\r\n");
    expect(patch).toContain("+X2_CHANGED\r\n");
  });
});
