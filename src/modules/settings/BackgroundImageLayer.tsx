import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { setBackgroundImage } from "./store";
import { usePreferencesStore } from "./preferences";

function clearWallpaperDom() {
  document.documentElement.removeAttribute("data-wallpaper");
  document.documentElement.style.removeProperty("--ui-alpha");
}

export function BackgroundImageLayer() {
  const backgroundImage = usePreferencesStore((s) => s.backgroundImage);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  // Load image as base64 data URL via IPC — no asset protocol scope issues.
  useEffect(() => {
    if (!backgroundImage) {
      setDataUrl(null);
      clearWallpaperDom();
      return;
    }

    void invoke<string>("background_read_data_url", { filename: backgroundImage })
      .then((url) => {
        setDataUrl(url);
        document.documentElement.setAttribute("data-wallpaper", "");
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        addNotification({
          type: "error",
          title: "Background image failed to load",
          message: `"${backgroundImage}" could not be read — falling back to no background. ${detail}`,
          source: "Background",
        });
        // Clear preference so the app doesn't retry a broken image on every launch
        void setBackgroundImage("");
        setDataUrl(null);
        clearWallpaperDom();
      });
  }, [backgroundImage, addNotification]);

  // Keep --ui-alpha in sync with the opacity slider.
  // opacity=0   → --ui-alpha=1.0  (fully opaque surfaces, wallpaper hidden)
  // opacity=90  → --ui-alpha=0.10 (very transparent surfaces, wallpaper fully visible)
  useEffect(() => {
    if (!backgroundImage) return;
    const alpha = Math.max(0.10, 1 - backgroundOpacity / 100);
    document.documentElement.style.setProperty("--ui-alpha", alpha.toFixed(3));
  }, [backgroundImage, backgroundOpacity]);

  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-wallpaper");
      document.documentElement.style.removeProperty("--ui-alpha");
    };
  }, []);

  if (!dataUrl) return null;

  // Portal to document.body at z-index:0.
  // App root div sits at z-index:1 above this layer.
  // UI surfaces use --background/--card with var(--ui-alpha) for transparency.
  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: backgroundBlur > 0 ? "-12px" : 0,
          backgroundImage: `url(${dataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
        }}
      />
    </div>,
    document.body,
  );
}
