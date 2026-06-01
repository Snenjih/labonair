import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { setBackgroundImage } from "./store";
import { usePreferencesStore } from "./preferences";

// The wallpaper overlay sits at max z-index ON TOP of everything — including the xterm.js
// canvas, which renders into a <canvas> element that ignores CSS background variables.
// Putting the overlay above the canvas (with pointerEvents:none) is the only approach that
// makes the wallpaper visible through the terminal.
const OVERLAY_Z = 2147483646;
const RESIZE_IDLE_MS = 280;
const FADE_IN_MS = 200;
// Slider stores 0..100. Rendered opacity is halved so the image never exceeds 50% —
// keeps UI and terminal readable at any slider position.
const BG_OPACITY_RENDER_FACTOR = 0.5;

function useWindowResizing(idleMs: number): boolean {
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    let timer: number | null = null;
    let active = false;
    const onResize = () => {
      if (!active) {
        active = true;
        setResizing(true);
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        active = false;
        setResizing(false);
        timer = null;
      }, idleMs);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [idleMs]);
  return resizing;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

export function BackgroundImageLayer() {
  const backgroundImage = usePreferencesStore((s) => s.backgroundImage);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const resizing = useWindowResizing(RESIZE_IDLE_MS);
  const docHidden = useDocumentHidden();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!backgroundImage) {
      setDataUrl(null);
      setVisible(false);
      return;
    }

    setVisible(false);
    let alive = true;

    void invoke<string>("background_read_data_url", { filename: backgroundImage })
      .then((url) => {
        if (!alive) return;
        setDataUrl(url);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (alive) setVisible(true);
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const detail = err instanceof Error ? err.message : String(err);
        addNotification({
          type: "error",
          title: "Background image failed to load",
          message: `"${backgroundImage}" could not be read — falling back to no background. ${detail}`,
          source: "Background",
        });
        void setBackgroundImage("");
        setDataUrl(null);
        setVisible(false);
      });

    return () => {
      alive = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [backgroundImage, addNotification]);

  if (!dataUrl) return null;

  const blurActive = backgroundBlur > 0 && !resizing;
  const renderedOpacity =
    visible && !docHidden && !resizing
      ? (backgroundOpacity / 100) * BG_OPACITY_RENDER_FACTOR
      : 0;

  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: OVERLAY_Z,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: renderedOpacity,
        transition: `opacity ${FADE_IN_MS}ms ease-out`,
        transform: "translateZ(0)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: blurActive ? "-12px" : 0,
          backgroundImage: `url(${dataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: blurActive ? `blur(${backgroundBlur}px)` : undefined,
        }}
      />
    </div>,
    document.body,
  );
}
