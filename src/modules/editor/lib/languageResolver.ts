import type { Extension } from "@codemirror/state";

type LoaderResult = Extension | { token: unknown };
type LanguageLoader = () => Promise<LoaderResult>;

/**
 * Extension → loader. Each loader is a dynamic import so language packs
 * only enter the bundle when a matching file is opened.
 *
 * Loaders may return either a ready Extension (lang-* packages) or a raw
 * StreamParser (legacy-modes). `resolveLanguage` wraps the latter in
 * StreamLanguage before returning.
 */
const loaders: Record<string, LanguageLoader> = {
  // JavaScript / TypeScript family
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  mjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  cjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),

  rs: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cc: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cxx: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  h: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  hpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),

  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  php: () => import("@codemirror/lang-php").then((m) => m.php({ plain: true })),
  xml: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  svg: () => import("@codemirror/lang-xml").then((m) => m.xml()),

  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),

  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  htm: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),

  // Legacy-modes: loaders return the raw StreamParser; wrapped below.
  sh: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  bash: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  zsh: () => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
  yaml: () => import("@codemirror/legacy-modes/mode/yaml").then((m) => m.yaml),
  yml: () => import("@codemirror/legacy-modes/mode/yaml").then((m) => m.yaml),
  dockerfile: () => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile),
  rb: () => import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby),
  swift: () => import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift),
  kt: () => import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin),
  kts: () => import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin),
};

const filenameOverrides: Record<string, LanguageLoader> = {
  dockerfile: loaders.dockerfile!,
  "dockerfile.dev": loaders.dockerfile!,
};

function extOf(name: string): string | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1 || dot === lower.length - 1) return null;
  return lower.slice(dot + 1);
}

function isStreamParser(v: unknown): boolean {
  return typeof v === "object" && v !== null && typeof (v as { token?: unknown }).token === "function";
}

export async function resolveLanguage(filename: string): Promise<Extension | null> {
  const lower = filename.toLowerCase();
  const base = lower.split("/").pop() ?? lower;

  const byName = filenameOverrides[base];
  const loader = byName ?? loaders[extOf(base) ?? ""];
  if (!loader) return null;

  const result = await loader();
  if (isStreamParser(result)) {
    const { StreamLanguage } = await import("@codemirror/language");
    return StreamLanguage.define(result as Parameters<typeof StreamLanguage.define>[0]);
  }
  return result as Extension;
}
