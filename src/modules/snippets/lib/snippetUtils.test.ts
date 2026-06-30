import { describe, expect, it } from "vitest";
import { parseTags, serializeTags } from "./snippetUtils";

describe("parseTags", () => {
  it("parses a valid JSON array of strings", () => {
    expect(parseTags('["foo","bar","baz"]')).toEqual(["foo", "bar", "baz"]);
  });

  it("returns empty array for null", () => {
    expect(parseTags(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(parseTags(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseTags("not-json")).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(parseTags('{"key":"value"}')).toEqual([]);
  });

  it("returns empty array for JSON null", () => {
    expect(parseTags("null")).toEqual([]);
  });

  it("handles tags with special characters", () => {
    expect(parseTags('["hello world","foo-bar"]')).toEqual(["hello world", "foo-bar"]);
  });
});

describe("serializeTags", () => {
  it("returns null for an empty array", () => {
    expect(serializeTags([])).toBeNull();
  });

  it("serializes a single tag", () => {
    expect(serializeTags(["foo"])).toBe('["foo"]');
  });

  it("serializes multiple tags", () => {
    expect(serializeTags(["a", "b", "c"])).toBe('["a","b","c"]');
  });

  it("round-trips through parseTags", () => {
    const tags = ["tag1", "tag2", "tag3"];
    const serialized = serializeTags(tags);
    expect(parseTags(serialized)).toEqual(tags);
  });
});
