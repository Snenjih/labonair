import { describe, expect, it } from "vitest";
import type { RawFileNode } from "./remoteFsProvider";
import { toFileEntry, toSearchHit } from "./remoteFsProvider";

function node(overrides: Partial<RawFileNode> = {}): RawFileNode {
  return {
    name: "file.txt",
    path: "/var/www/file.txt",
    size: 42,
    modified_at: 1_700_000_000, // seconds
    is_dir: false,
    is_symlink: false,
    permissions: "rw-r--r--",
    ...overrides,
  };
}

describe("toFileEntry", () => {
  it("converts modified_at from seconds to milliseconds", () => {
    const entry = toFileEntry(node({ modified_at: 1_700_000_000 }));
    expect(entry.mtimeMs).toBe(1_700_000_000_000);
  });

  it("maps a plain file to kind 'file'", () => {
    const entry = toFileEntry(node({ is_dir: false, is_symlink: false }));
    expect(entry.kind).toBe("file");
  });

  it("maps a directory to kind 'dir'", () => {
    const entry = toFileEntry(node({ is_dir: true, is_symlink: false }));
    expect(entry.kind).toBe("dir");
  });

  it("maps a symlink to kind 'symlink' even if it resolves to a directory", () => {
    const entry = toFileEntry(node({ is_dir: true, is_symlink: true, symlink_target: "/real/dir" }));
    expect(entry.kind).toBe("symlink");
    expect(entry.symlinkTarget).toBe("/real/dir");
  });

  it("always reports isIgnored as false — no gitignore concept over SFTP", () => {
    const entry = toFileEntry(node());
    expect(entry.isIgnored).toBe(false);
  });

  it("preserves the full path and permissions string as-is", () => {
    const entry = toFileEntry(node({ path: "/a/b/c.txt", permissions: "rwxr-xr-x" }));
    expect(entry.path).toBe("/a/b/c.txt");
    expect(entry.permissions).toBe("rwxr-xr-x");
  });
});

describe("toSearchHit", () => {
  it("derives the name from the last path segment", () => {
    const hit = toSearchHit("/var/www/app/index.php", "/var/www");
    expect(hit.name).toBe("index.php");
  });

  it("derives rel as the path relative to root", () => {
    const hit = toSearchHit("/var/www/app/index.php", "/var/www");
    expect(hit.rel).toBe("app/index.php");
  });

  it("falls back to the full path as rel when it doesn't start with root", () => {
    const hit = toSearchHit("/etc/hosts", "/var/www");
    expect(hit.rel).toBe("/etc/hosts");
  });

  it("always reports is_dir as false — deep search has no stat info per hit", () => {
    const hit = toSearchHit("/var/www/app", "/var/www");
    expect(hit.is_dir).toBe(false);
  });
});
