import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowReloadHorizontalIcon, FileIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
]);

const HTML_EXTS = new Set(["html", "htm"]);

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

function fileKind(path: string): "html" | "markdown" | "image" | "unknown" {
  const ext = extOf(path);
  if (HTML_EXTS.has(ext)) return "html";
  if (ext === "md") return "markdown";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "unknown";
}

type Props = {
  path: string;
  visible: boolean;
};

export function FilePreviewPane({ path, visible }: Props) {
  const [nonce, setNonce] = useState(0);
  const assetUrl = convertFileSrc(path);
  const kind = fileKind(path);

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Toolbar path={path} onReload={() => setNonce((n) => n + 1)} />
      <div className="relative min-h-0 flex-1 bg-white">
        {kind === "html" && (
          <HtmlPreview key={`${path}#${nonce}`} assetUrl={assetUrl} basePath={path} />
        )}
        {kind === "markdown" && (
          <MarkdownPreview key={`${path}#${nonce}`} path={path} />
        )}
        {kind === "image" && (
          <div className="flex h-full w-full items-center justify-center bg-checkerboard p-4">
            <img
              src={assetUrl}
              alt={path.split("/").pop()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        {kind === "unknown" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Preview not available for this file type.
          </div>
        )}
      </div>
    </div>
  );
}

function Toolbar({ path, onReload }: { path: string; onReload: () => void }) {
  const name = path.split("/").pop() ?? path;
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-card px-3">
      <HugeiconsIcon icon={FileIcon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{name}</span>
      <button
        onClick={onReload}
        className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Reload"
      >
        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function HtmlPreview({ assetUrl, basePath }: { assetUrl: string; basePath: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Intercept link clicks so internal navigation stays inside the pane
        const handleClick = (e: MouseEvent) => {
          const anchor = (e.target as Element).closest("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href");
          if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) return;
          e.preventDefault();
          // Resolve relative href against current directory
          const dir = basePath.substring(0, basePath.lastIndexOf("/") + 1);
          const resolved = convertFileSrc(dir + href);
          if (iframe.contentWindow) {
            iframe.contentWindow.location.href = resolved;
          }
        };
        doc.addEventListener("click", handleClick);
        return () => doc.removeEventListener("click", handleClick);
      } catch {
        // cross-origin — ignore
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [basePath]);

  return (
    <iframe
      ref={iframeRef}
      src={assetUrl}
      title="HTML Preview"
      className="h-full w-full border-0"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

type ReadResult = { content: string } | { too_large: boolean } | { binary: boolean };

function MarkdownPreview({ path }: { path: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dir = path.substring(0, path.lastIndexOf("/") + 1);

  useEffect(() => {
    invoke<ReadResult>("fs_read_file", { path })
      .then((result) => {
        if ("content" in result) {
          // Replace local image src with asset:// URLs
          const md = result.content.replace(
            /!\[([^\]]*)\]\(([^)]+)\)/g,
            (_match, alt, src) => {
              if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("asset://")) {
                return `![${alt}](${src})`;
              }
              const absPath = src.startsWith("/") ? src : dir + src;
              return `![${alt}](${convertFileSrc(absPath)})`;
            },
          );
          const rendered = marked.parse(md) as string;
          setHtml(rendered);
        } else {
          setError("File is binary or too large to preview.");
        }
      })
      .catch((err: unknown) => setError(String(err)));
  }, [path, dir]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">{error}</div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-6 text-foreground">
      <div
        className="markdown-body mx-auto max-w-3xl"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered from local files only
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
