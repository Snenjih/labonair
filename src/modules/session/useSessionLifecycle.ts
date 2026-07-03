import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTabsStore, type WorkspaceTab } from "@/modules/tabs";
import { captureAndSave, clearSnapshot, restoreIfEnabled } from "@/modules/session";
import { saveAllScrollbacks, cleanupScrollbacks } from "./scrollback";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";

export interface SessionLifecycleReturn {
  sessionRestored: boolean;
  prefsHydrated: boolean;
}

function collectAllSessionIds(): string[] {
  const { tabs } = useTabsStore.getState();
  const ids: string[] = [];
  for (const tab of tabs) {
    if (tab.kind !== "workspace") continue;
    for (const s of Object.values((tab as WorkspaceTab).sessions)) {
      if (s.id) ids.push(s.id);
    }
  }
  return ids;
}

export function useSessionLifecycle(): SessionLifecycleReturn {
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const sessionRestore = usePreferencesStore((s) => s.sessionRestore);
  const confirmQuitWithSsh = usePreferencesStore((s) => s.confirmQuitWithSsh);

  const [sessionRestored, setSessionRestored] = useState(false);

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefsHydrated) return;
    if (!sessionRestore) {
      setSessionRestored(true);
      return;
    }
    let alive = true;
    const actions = useTabsStore.getState();
    void restoreIfEnabled({
      setActiveId: actions.setActiveId,
      newTab: actions.newTab,
      newSshTab: actions.newSshTab,
      newQuickSshTab: actions.newQuickSshTab,
      openFileTab: actions.openFileTab,
      newPreviewTab: actions.newPreviewTab,
      openHomeTab: actions.openHomeTab,
      newSftpTab: actions.newSftpTab,
      updateSftpPaths: actions.updateSftpPaths,
      splitPane: actions.splitPane,
      setActivePaneId: actions.setActivePaneId,
    }).then((result) => {
      if (!alive) return;
      if (!result || result.restoredCount === 0) actions.openDefaultTab();
      setSessionRestored(true);
      if (sessionRestore) {
        setTimeout(() => {
          void cleanupScrollbacks(collectAllSessionIds());
        }, 5000);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsHydrated, sessionRestore]);

  // Clear snapshot when session restore is disabled
  useEffect(() => {
    if (prefsHydrated && !sessionRestore) void clearSnapshot();
  }, [prefsHydrated, sessionRestore]);

  // Debounced save via subscribe — no tabs/activeId in deps
  useEffect(() => {
    if (!sessionRestore || !prefsHydrated) return;
    let debounce: ReturnType<typeof setTimeout>;
    const periodic = setInterval(async () => {
      await captureAndSave();
      if (sessionRestore) void saveAllScrollbacks(collectAllSessionIds());
    }, 30_000);
    const unsub = useTabsStore.subscribe(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void captureAndSave(), 3_000);
    });
    return () => {
      unsub();
      clearTimeout(debounce);
      clearInterval(periodic);
    };
  }, [sessionRestore, prefsHydrated]);

  // Keep a ref to latest tabs/activeId for the close handler (no rerender)
  const sessionSaveRef = useRef<{ tabs: ReturnType<typeof useTabsStore.getState>["tabs"]; activeId: number }>(
    {
      tabs: [],
      activeId: -1,
    },
  );
  useEffect(() => {
    return useTabsStore.subscribe((s) => {
      sessionSaveRef.current = { tabs: s.tabs, activeId: s.activeId };
    });
  }, []);

  // Keep confirmQuit in a ref to prevent stale closure in onCloseRequested
  const confirmQuitRef = useRef(confirmQuitWithSsh);
  useEffect(() => {
    confirmQuitRef.current = confirmQuitWithSsh;
  }, [confirmQuitWithSsh]);

  // Window close handler with SSH check + session save + scrollback save
  useEffect(() => {
    if (!sessionRestore && !confirmQuitWithSsh) return;
    let cleanup: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (confirmQuitRef.current) {
          const { tabs: currentTabs } = sessionSaveRef.current;
          const sshCount = currentTabs.filter(
            (t) =>
              t.kind === "workspace" &&
              Object.values((t as WorkspaceTab).sessions).some((s) => s.kind === "ssh"),
          ).length;
          if (sshCount > 0) {
            const ok = await ask(
              `You have ${sshCount} active SSH connection${sshCount > 1 ? "s" : ""}. Quit anyway?`,
              { title: "Active SSH Connections", kind: "warning", okLabel: "Quit", cancelLabel: "Cancel" },
            );
            if (!ok) return;
          }
        }
        try {
          if (sessionRestore) {
            await captureAndSave();
            await saveAllScrollbacks(collectAllSessionIds());
          }
        } finally {
          await invoke("quit_app");
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRestore, confirmQuitWithSsh]);

  return { sessionRestored, prefsHydrated };
}
