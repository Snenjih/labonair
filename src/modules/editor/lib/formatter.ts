import * as prettier from "prettier/standalone";

type PluginEntry = {
  parser: string;
  plugins: () => Promise<unknown[]>;
};

const PARSER_MAP: Record<string, PluginEntry> = {
  js: {
    parser: "babel",
    plugins: async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")],
  },
  jsx: {
    parser: "babel",
    plugins: async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")],
  },
  mjs: {
    parser: "babel",
    plugins: async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")],
  },
  cjs: {
    parser: "babel",
    plugins: async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")],
  },
  ts: {
    parser: "typescript",
    plugins: async () => [
      await import("prettier/plugins/typescript"),
      await import("prettier/plugins/estree"),
    ],
  },
  tsx: {
    parser: "typescript",
    plugins: async () => [
      await import("prettier/plugins/typescript"),
      await import("prettier/plugins/estree"),
    ],
  },
  json: {
    parser: "json",
    plugins: async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")],
  },
  css: {
    parser: "css",
    plugins: async () => [await import("prettier/plugins/postcss")],
  },
  scss: {
    parser: "scss",
    plugins: async () => [await import("prettier/plugins/postcss")],
  },
  less: {
    parser: "less",
    plugins: async () => [await import("prettier/plugins/postcss")],
  },
  md: {
    parser: "markdown",
    plugins: async () => [await import("prettier/plugins/markdown")],
  },
  markdown: {
    parser: "markdown",
    plugins: async () => [await import("prettier/plugins/markdown")],
  },
  html: {
    parser: "html",
    plugins: async () => [await import("prettier/plugins/html")],
  },
  htm: {
    parser: "html",
    plugins: async () => [await import("prettier/plugins/html")],
  },
  yaml: {
    parser: "yaml",
    plugins: async () => [await import("prettier/plugins/yaml")],
  },
  yml: {
    parser: "yaml",
    plugins: async () => [await import("prettier/plugins/yaml")],
  },
};

/** Returns the formatted string, or null if the file type is unsupported. */
export async function formatDocument(content: string, filePath: string): Promise<string | null> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const entry = PARSER_MAP[ext];
  if (!entry) return null;

  const plugins = await entry.plugins();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prettier.format(content, { parser: entry.parser, plugins: plugins as any[] });
}
