import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getStoragePaths } from "@/lib/paths";
import { usePreferencesStore } from "./preferences";

type BackgroundInfo = {
  filename: string;
  path: string;
  size_bytes: number;
};

export function BackgroundImageLayer() {
  const backgroundImage = usePreferencesStore((s) => s.backgroundImage);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!backgroundImage) {
      setBgUrl(null);
      document.documentElement.removeAttribute("data-wallpaper");
      return;
    }

    // Resolve the full absolute path from the backgrounds list so
    // convertFileSrc gets a verified, OS-correct path.
    void invoke<BackgroundInfo[]>("backgrounds_list").then((list) => {
      const found = list.find((b) => b.filename === backgroundImage);
      if (found) {
        setBgUrl(convertFileSrc(found.path));
        document.documentElement.setAttribute("data-wallpaper", "");
      } else {
        // File no longer exists on disk — clear gracefully
        setBgUrl(null);
        document.documentElement.removeAttribute("data-wallpaper");
      }
    }).catch(() => {
      // Fall back to path construction if invoke fails
      getStoragePaths().then((paths) => {
        const sep = paths.config.includes("\\") ? "\\" : "/";
        setBgUrl(convertFileSrc(`${paths.config}${sep}backgrounds${sep}${backgroundImage}`));
        document.documentElement.setAttribute("data-wallpaper", "");
      });
    });
  }, [backgroundImage]);

  // Remove attribute on unmount
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-wallpaper");
    };
  }, []);

  if (!bgUrl) return null;

  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-12px",
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: backgroundOpacity / 100,
          filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
        }}
      />
    </div>,
    document.body,
  );
}
