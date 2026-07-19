import { describe, expect, it } from "vitest";
import { extractSnippetVariables, substituteSnippetVariables } from "./snippetVariables";

describe("extractSnippetVariables", () => {
  it("returns an empty array for a command with zero variables", () => {
    expect(extractSnippetVariables("docker compose up -d")).toEqual([]);
  });

  it("extracts a single variable with no default", () => {
    expect(extractSnippetVariables("echo ${NAME}")).toEqual([{ name: "NAME", defaultValue: null }]);
  });

  it("extracts a variable with a default value", () => {
    expect(extractSnippetVariables("deploy ${ENVIRONMENT:-staging}")).toEqual([
      { name: "ENVIRONMENT", defaultValue: "staging" },
    ]);
  });

  it("only lists a duplicate variable name once", () => {
    expect(extractSnippetVariables("echo ${NAME} > ${NAME}.txt")).toEqual([
      { name: "NAME", defaultValue: null },
    ]);
  });

  it("keeps the first occurrence's default when a duplicate repeats without one", () => {
    expect(extractSnippetVariables("echo ${NAME:-world} && echo ${NAME}")).toEqual([
      { name: "NAME", defaultValue: "world" },
    ]);
  });

  it("does not let a name that is a substring of another collide", () => {
    expect(extractSnippetVariables("echo ${VAR} ${VAR_2}")).toEqual([
      { name: "VAR", defaultValue: null },
      { name: "VAR_2", defaultValue: null },
    ]);
  });

  it("preserves first-occurrence order across multiple distinct variables", () => {
    expect(extractSnippetVariables("scp ${SRC} user@${HOST_NAME}:${DEST}")).toEqual([
      { name: "SRC", defaultValue: null },
      { name: "HOST_NAME", defaultValue: null },
      { name: "DEST", defaultValue: null },
    ]);
  });

  it("excludes common shell/environment variable names like PATH", () => {
    expect(extractSnippetVariables("echo $PATH && echo ${PATH}")).toEqual([]);
  });

  it("excludes reserved names even mixed with real placeholders", () => {
    expect(extractSnippetVariables("HOME=${HOME} ${TARGET_DIR:-/tmp}")).toEqual([
      { name: "TARGET_DIR", defaultValue: "/tmp" },
    ]);
  });

  it("does not match shell positional/special params like ${1} or ${@}", () => {
    expect(extractSnippetVariables("echo ${1} ${@} ${#}")).toEqual([]);
  });

  it("does not match lowercase or mixed-case names", () => {
    expect(extractSnippetVariables("echo ${name} ${Name}")).toEqual([]);
  });
});

describe("substituteSnippetVariables", () => {
  it("substitutes a single variable", () => {
    expect(substituteSnippetVariables("echo ${NAME}", { NAME: "world" })).toBe("echo world");
  });

  it("substitutes duplicate occurrences with the same value", () => {
    expect(substituteSnippetVariables("echo ${NAME} > ${NAME}.txt", { NAME: "log" })).toBe(
      "echo log > log.txt",
    );
  });

  it("substitutes the default-value syntax form", () => {
    expect(substituteSnippetVariables("deploy ${ENVIRONMENT:-staging}", { ENVIRONMENT: "prod" })).toBe(
      "deploy prod",
    );
  });

  it("leaves reserved shell variable names untouched", () => {
    expect(substituteSnippetVariables("echo ${PATH}", {})).toBe("echo ${PATH}");
  });

  it("leaves placeholders untouched when no value was supplied for them", () => {
    expect(substituteSnippetVariables("echo ${NAME}", {})).toBe("echo ${NAME}");
  });

  it("is a no-op for a command with no variables", () => {
    expect(substituteSnippetVariables("docker compose up -d", {})).toBe("docker compose up -d");
  });
});
