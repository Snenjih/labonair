import { invoke } from "@tauri-apps/api/core";
import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
}

export function pathCompleteSource(getCwd: () => string | null): CompletionSource {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const before = context.matchBefore(/[\w./~-]+/);
    if (!before || before.text.length === 0) return null;

    const token = before.text;
    // Only do path completion when token looks like a path
    const isPath =
      token.includes("/") ||
      token.startsWith("./") ||
      token.startsWith("~/");
    if (!isPath && token.length < 2) return null;

    const cwd = getCwd() ?? ".";
    const hasSlash = token.includes("/");

    let dirPath: string;
    let prefix: string;

    if (hasSlash) {
      const lastSlash = token.lastIndexOf("/");
      const beforeSlash = token.slice(0, lastSlash) || "/";
      dirPath = beforeSlash.startsWith("/")
        ? beforeSlash
        : `${cwd}/${beforeSlash}`;
      prefix = token.slice(lastSlash + 1);
    } else {
      dirPath = cwd;
      prefix = token;
    }

    let entries: DirEntry[];
    try {
      entries = await invoke<DirEntry[]>("fs_read_dir", {
        path: dirPath,
        showHidden: false,
      });
    } catch {
      return null;
    }

    const options = entries
      .filter((e) => e.name.startsWith(prefix))
      .slice(0, 100)
      .map((e) => ({
        label: e.name + (e.kind === "dir" ? "/" : ""),
        type: e.kind === "dir" ? "type" : "variable",
        apply: e.name + (e.kind === "dir" ? "/" : " "),
        boost: e.kind === "dir" ? 1 : 0,
      }));

    if (options.length === 0) return null;

    return {
      from: before.from + (hasSlash ? token.lastIndexOf("/") + 1 : 0),
      options,
      validFor: /^[\w.-]*$/,
    };
  };
}
