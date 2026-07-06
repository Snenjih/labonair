import { describe, expect, it } from "vitest";
import { tokenize, tokenizeFull } from "./commandTokenizer";

describe("tokenize", () => {
  it("returns an empty active token for an empty line", () => {
    const r = tokenize("", 0);
    expect(r.activeTokenIndex).toBe(0);
    expect(r.activeTokenPrefix).toBe("");
    expect(r.precedingTokens).toEqual([]);
  });

  it("splits simple whitespace-separated tokens", () => {
    const r = tokenize("git commit", 10);
    expect(r.precedingTokens).toEqual(["git"]);
    expect(r.activeTokenPrefix).toBe("commit");
  });

  it("treats a trailing space as starting a new, empty active token", () => {
    const r = tokenize("git ", 4);
    expect(r.precedingTokens).toEqual(["git"]);
    expect(r.activeTokenIndex).toBe(1);
    expect(r.activeTokenPrefix).toBe("");
  });

  it("keeps a double-quoted multi-word span as one token", () => {
    const r = tokenize('git commit -m "fix the bug', 'git commit -m "fix the bug'.length);
    expect(r.precedingTokens).toEqual(["git", "commit", "-m"]);
    expect(r.activeTokenPrefix).toBe('"fix the bug');
    expect(r.inUnterminatedQuote).toBe(true);
  });

  it("closes a quoted token once the matching quote appears", () => {
    const line = 'git commit -m "fix the bug" ';
    const r = tokenize(line, line.length);
    expect(r.precedingTokens).toEqual(["git", "commit", "-m", '"fix the bug"']);
    expect(r.inUnterminatedQuote).toBe(false);
    expect(r.activeTokenPrefix).toBe("");
  });

  it("does not split on a backslash-escaped space", () => {
    const line = "cd path\\ with\\ spaces/fil";
    const r = tokenize(line, line.length);
    expect(r.precedingTokens).toEqual(["cd"]);
    expect(r.activeTokenPrefix).toBe("path\\ with\\ spaces/fil");
  });

  it("resets argument position after a pipe", () => {
    const line = "ls -la | grep w";
    const r = tokenize(line, line.length);
    expect(r.precedingTokens).toEqual(["grep"]);
    expect(r.activeTokenPrefix).toBe("w");
    expect(r.activeSegmentIndex).toBe(1);
  });

  it("resets argument position after && and ||", () => {
    const r1 = tokenize("make build && ru", "make build && ru".length);
    expect(r1.precedingTokens).toEqual([]);
    expect(r1.activeTokenPrefix).toBe("ru");

    const r2 = tokenize("cmd1 || cmd2 arg", "cmd1 || cmd2 arg".length);
    expect(r2.precedingTokens).toEqual(["cmd2"]);
    expect(r2.activeTokenPrefix).toBe("arg");
  });

  it("resets argument position after ;", () => {
    const line = "echo a; ec";
    const r = tokenize(line, line.length);
    expect(r.precedingTokens).toEqual([]);
    expect(r.activeTokenPrefix).toBe("ec");
  });
});

describe("tokenizeFull", () => {
  it("splits a full history line into segments of tokens", () => {
    expect(tokenizeFull("git commit -m \"fix bug\"")).toEqual([["git", "commit", "-m", '"fix bug"']]);
  });

  it("splits multiple piped commands into separate segments", () => {
    expect(tokenizeFull("ls -la | grep foo")).toEqual([["ls", "-la"], ["grep", "foo"]]);
  });
});
