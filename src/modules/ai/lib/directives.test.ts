import { describe, expect, it } from "vitest";
import {
  expandDirectiveTokens,
  isValidHandle,
  normalizeHandle,
  type Directive,
} from "./directives";

// ─── normalizeHandle ──────────────────────────────────────────────────────────

describe("normalizeHandle", () => {
  it("lowercases the input", () => {
    expect(normalizeHandle("MyHandle")).toBe("myhandle");
  });

  it("replaces spaces with dashes", () => {
    expect(normalizeHandle("my handle")).toBe("my-handle");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeHandle("  foo  ")).toBe("foo");
  });

  it("removes special characters", () => {
    expect(normalizeHandle("My Handle!")).toBe("my-handle");
  });

  it("collapses multiple dashes into one", () => {
    expect(normalizeHandle("foo--bar")).toBe("foo-bar");
  });

  it("removes leading and trailing dashes", () => {
    expect(normalizeHandle("---foo---")).toBe("foo");
  });

  it("handles an empty string", () => {
    expect(normalizeHandle("")).toBe("");
  });

  it("handles all-special characters", () => {
    expect(normalizeHandle("!!!")).toBe("");
  });

  it("preserves numbers and dashes in valid input", () => {
    expect(normalizeHandle("my-handle-2")).toBe("my-handle-2");
  });
});

// ─── isValidHandle ────────────────────────────────────────────────────────────

describe("isValidHandle", () => {
  it("accepts a simple lowercase handle", () => {
    expect(isValidHandle("myhandle")).toBe(true);
  });

  it("accepts dashes in the middle", () => {
    expect(isValidHandle("my-handle")).toBe(true);
  });

  it("accepts handles with numbers", () => {
    expect(isValidHandle("handle2")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidHandle("")).toBe(false);
  });

  it("rejects handles starting with a dash", () => {
    expect(isValidHandle("-myhandle")).toBe(false);
  });

  it("rejects handles with uppercase letters", () => {
    expect(isValidHandle("MyHandle")).toBe(false);
  });

  it("rejects handles with spaces", () => {
    expect(isValidHandle("my handle")).toBe(false);
  });

  it("rejects handles with special characters", () => {
    expect(isValidHandle("handle!")).toBe(false);
  });

  it("accepts a single lowercase letter", () => {
    expect(isValidHandle("a")).toBe(true);
  });

  it("accepts a single digit", () => {
    expect(isValidHandle("1")).toBe(true);
  });
});

// ─── expandDirectiveTokens ────────────────────────────────────────────────────

function makeDirective(handle: string, content: string): Directive {
  return {
    id: `dir-${handle}`,
    handle,
    name: handle,
    description: "",
    content,
  };
}

describe("expandDirectiveTokens", () => {
  it("replaces a matching token and produces a block", () => {
    const directives = [makeDirective("rules", "Always be helpful.")];
    const { body, blocks } = expandDirectiveTokens("Use #rules please", directives);
    // The regex preserves the leading space before the token, resulting in "Use  please"
    expect(body).toBe("Use  please");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('<directive name="rules">');
    expect(blocks[0]).toContain("Always be helpful.");
  });

  it("leaves unknown tokens unchanged", () => {
    const { body, blocks } = expandDirectiveTokens("Check #unknown token", []);
    expect(body).toBe("Check #unknown token");
    expect(blocks).toHaveLength(0);
  });

  it("deduplicates when the same token appears multiple times", () => {
    const directives = [makeDirective("rules", "content")];
    const { blocks } = expandDirectiveTokens("#rules and #rules again", directives);
    expect(blocks).toHaveLength(1);
  });

  it("expands multiple different tokens", () => {
    const directives = [
      makeDirective("style", "Use TypeScript."),
      makeDirective("format", "Use 2 spaces."),
    ];
    const { blocks } = expandDirectiveTokens("#style and #format", directives);
    expect(blocks).toHaveLength(2);
  });

  it("handles text with no tokens", () => {
    const directives = [makeDirective("rules", "content")];
    const { body, blocks } = expandDirectiveTokens("plain text", directives);
    expect(body).toBe("plain text");
    expect(blocks).toHaveLength(0);
  });

  it("returns empty body and no blocks for empty input", () => {
    const { body, blocks } = expandDirectiveTokens("", []);
    expect(body).toBe("");
    expect(blocks).toHaveLength(0);
  });

  it("trims trailing whitespace from body", () => {
    const directives = [makeDirective("rules", "content")];
    const { body } = expandDirectiveTokens("#rules   ", directives);
    expect(body).toBe("");
  });
});
