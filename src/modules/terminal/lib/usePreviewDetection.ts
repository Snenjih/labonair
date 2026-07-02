import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTabsStore, selectActiveTabKind } from "@/modules/tabs";
import { sameOrigin } from "@/lib/urls";
import type { PreviewTab } from "@/modules/tabs";

export function usePreviewDetection(activeDetectedUrl: string | null): string | null {
  const isWorkspaceTab = useTabsStore((s) => selectActiveTabKind(s) === "workspace");
  const previewTabUrls = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is PreviewTab => t.kind === "preview").map((t) => t.url)),
  );

  return useMemo(() => {
    if (!isWorkspaceTab || !activeDetectedUrl) return null;
    const alreadyOpen = previewTabUrls.some((url) => sameOrigin(url, activeDetectedUrl));
    return alreadyOpen ? null : activeDetectedUrl;
  }, [isWorkspaceTab, activeDetectedUrl, previewTabUrls]);
}
