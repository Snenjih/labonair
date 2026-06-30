import { describe, expect, it } from "vitest";
import { sameOrigin } from "./urls";

describe("sameOrigin", () => {
  it("returns true for same origin (https)", () => {
    expect(sameOrigin("https://example.com/foo", "https://example.com/bar")).toBe(true);
  });

  it("returns true for same origin with port", () => {
    expect(sameOrigin("http://localhost:3000/a", "http://localhost:3000/b")).toBe(true);
  });

  it("returns false when protocols differ", () => {
    expect(sameOrigin("https://example.com", "http://example.com")).toBe(false);
  });

  it("returns false when hosts differ", () => {
    expect(sameOrigin("https://example.com", "https://other.com")).toBe(false);
  });

  it("returns false when ports differ", () => {
    expect(sameOrigin("http://localhost:3000", "http://localhost:4000")).toBe(false);
  });

  it("falls back to string equality and returns true when both are invalid URLs", () => {
    expect(sameOrigin("not-a-url", "not-a-url")).toBe(true);
  });

  it("returns false when strings differ and both are invalid URLs", () => {
    expect(sameOrigin("foo", "bar")).toBe(false);
  });

  it("returns false when one is valid and the other is not", () => {
    expect(sameOrigin("https://example.com", "not-a-url")).toBe(false);
  });

  it("falls back to string equality and returns true for two empty strings", () => {
    expect(sameOrigin("", "")).toBe(true);
  });
});
