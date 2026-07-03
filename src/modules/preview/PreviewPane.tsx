import { Alert02Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PreviewAddressBar, type PreviewAddressBarHandle } from "./PreviewAddressBar";

export type PreviewPaneHandle = {
  reload: () => void;
  focusAddressBar: () => void;
  getUrl: () => string;
};

type Props = {
  url: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);

function getUrlExtension(url: string): string {
  try {
    const pathname = url.includes("://") ? new URL(url).pathname : url;
    return pathname.split(".").pop()?.toLowerCase() ?? "";
  } catch {
    return url.split(".").pop()?.toLowerCase() ?? "";
  }
}

export const PreviewPane = forwardRef<PreviewPaneHandle, Props>(function PreviewPane(
  { url, visible, onUrlChange },
  ref,
) {
  // `nonce` is part of the iframe `key`. Bumping it remounts the iframe,
  // which is the only reliable cross-origin reload (calling
  // contentWindow.location.reload() throws on cross-origin frames).
  const [nonce, setNonce] = useState(0);
  const addressRef = useRef<PreviewAddressBarHandle>(null);

  // Convert local absolute paths to asset:// protocol so the iframe can load them
  const resolvedUrl = useMemo(() => {
    if (!url) return url;
    const isLocalPath = /^\//.test(url) || /^[a-zA-Z]:[\\/]/.test(url);
    return isLocalPath ? convertFileSrc(url) : url;
  }, [url]);

  useImperativeHandle(
    ref,
    () => ({
      reload: () => setNonce((n) => n + 1),
      focusAddressBar: () => addressRef.current?.focus(),
      getUrl: () => url,
    }),
    [url],
  );

  const isLocalFilePath = url ? /^\//.test(url) || /^[a-zA-Z]:[\\/]/.test(url) : false;
  const showXfoHint = url ? !isLocalUrl(url) && !isLocalFilePath : false;
  const isImage = url ? IMAGE_EXTENSIONS.has(getUrlExtension(url)) : false;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <PreviewAddressBar
        ref={addressRef}
        url={url}
        onSubmit={onUrlChange}
        onReload={() => setNonce((n) => n + 1)}
      />
      {showXfoHint ? (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 bg-warning/8 px-3 text-[11px] text-warning">
          <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">
            Many public sites refuse to embed (X-Frame-Options). If the page is blank, open it externally.
          </span>
        </div>
      ) : null}
      <div
        className={
          url && !isImage ? "relative min-h-0 flex-1 bg-background" : "relative min-h-0 flex-1 bg-background"
        }
      >
        {url ? (
          isImage ? (
            <ImageViewer key={`${url}#${nonce}`} src={resolvedUrl} />
          ) : (
            <iframe
              key={`${url}#${nonce}`}
              src={resolvedUrl}
              title="Preview"
              className="h-full w-full border-0"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
});

type ZoomState = { zoom: number; tx: number; ty: number };

function ImageViewer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stateRef = useRef<ZoomState>({ zoom: 1, tx: 0, ty: 0 });
  const [transform, setTransform] = useState<ZoomState>({ zoom: 1, tx: 0, ty: 0 });
  const isDragging = useRef(false);
  const dragOrigin = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });

  const applyState = useCallback((next: ZoomState) => {
    stateRef.current = next;
    setTransform(next);
  }, []);

  const fitToContainer = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(1, cw / iw, ch / ih);
    applyState({
      zoom: scale,
      tx: (cw - iw * scale) / 2,
      ty: (ch - ih * scale) / 2,
    });
  }, [applyState]);

  // Wheel zoom centered at cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const prev = stateRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.min(Math.max(prev.zoom * factor, 0.02), 32);
      applyState({
        zoom: newZoom,
        tx: cx - (cx - prev.tx) * (newZoom / prev.zoom),
        ty: cy - (cy - prev.ty) * (newZoom / prev.zoom),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyState]);

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragOrigin.current = {
      mx: e.clientX,
      my: e.clientY,
      tx: stateRef.current.tx,
      ty: stateRef.current.ty,
    };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const { mx, my, tx, ty } = dragOrigin.current;
      applyState({
        ...stateRef.current,
        tx: tx + (e.clientX - mx),
        ty: ty + (e.clientY - my),
      });
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [applyState]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none"
      style={{
        background:
          "repeating-conic-gradient(color-mix(in srgb, var(--color-foreground) 6%, transparent) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px, var(--color-background)",
        cursor: isDragging.current ? "grabbing" : "grab",
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={fitToContainer}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        onLoad={fitToContainer}
        className="absolute top-0 left-0 max-w-none"
        style={{
          transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.zoom})`,
          transformOrigin: "0 0",
        }}
      />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/80 tabular-nums">
        {Math.round(transform.zoom * 100)}%
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground">
        <HugeiconsIcon icon={Globe02Icon} size={20} strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Nothing to preview yet</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Type a URL above, or open the{" "}
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10.5px]">Ports</span> dropdown to jump
          straight to your running dev server. Public sites often block embedding — open them in your browser
          via the link icon if you see a blank page.
        </p>
      </div>
    </div>
  );
}

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return (
      h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" || h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
