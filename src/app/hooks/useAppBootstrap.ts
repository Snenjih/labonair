import { homeDir } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { handleApiError } from "@/lib/errors";
import { runStoreMigration } from "@/lib/storeMigration";
import { useLayoutEngine } from "@/lib/useLayoutEngine";
import { useTerminalCursorBlinkInterval } from "@/lib/useTerminalCursorBlinkInterval";
import { useThemeEngine } from "@/lib/useThemeEngine";
import { getAllKeys, type ProviderKeys, useChatStore } from "@/modules/ai";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useDirectivesStore } from "@/modules/ai/store/directivesStore";
import { useProvidersStore } from "@/modules/ai/store/providersStore";
import { usePathBookmarksStore } from "@/modules/bookmarks/store/pathBookmarksStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { onKeysChanged } from "@/modules/settings/store";
import { bootstrapSftpConnectionListener } from "@/modules/sftp/store/sftpStore";
import {
  bootstrapTransferListeners,
  bootstrapTransferSettingsSync,
} from "@/modules/sftp/store/transferStore";
import { useKeybindsStore } from "@/modules/shortcuts";
import { useCommandSnippetsStore } from "@/modules/snippets";

export interface AppBootstrapReturn {
  keysLoaded: boolean;
  apiKeys: ProviderKeys;
  home: string | null;
}

export function useAppBootstrap(): AppBootstrapReturn {
  // Stable store actions — fetched once, never cause re-renders
  const { setApiKeys, setSelectedModelId, hydrateSessions } = useChatStore.getState();

  // Reactive selectors
  const apiKeys = useChatStore((s) => s.apiKeys);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);

  const initPrefs = usePreferencesStore((s) => s.init);
  const initKeybinds = useKeybindsStore((s) => s.init);

  const [keysLoaded, setKeysLoaded] = useState(false);
  const [home, setHome] = useState<string | null>(null);

  // Home directory
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  // API keys loading + live listener
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    reload();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys]);

  // Preferences init
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);

  // Keybinds init
  useEffect(() => {
    void initKeybinds();
  }, [initKeybinds]);

  // Theme engine (owns its own effects internally)
  useThemeEngine();

  // Layout engine — applies --radius and density class to <html>
  useLayoutEngine();

  // Terminal cursor blink (owns its own effects internally)
  useTerminalCursorBlinkInterval();

  // Sync default model from preferences once hydrated
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  // Run store migration (nexum → labonair) before hydrating sessions
  useEffect(() => {
    void runStoreMigration();
  }, []);

  // Hydrate sessions immediately
  useEffect(() => {
    void hydrateSessions();
  }, [hydrateSessions]);

  // Providers store: init once, then reload whenever the settings window changes providers
  useEffect(() => {
    const store = useProvidersStore.getState();
    void store.init();
    let unlisten: (() => void) | null = null;
    void store
      .onProvidersChanged(() => {
        void useProvidersStore.getState().reload();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // Defer non-critical hydrations until the browser is idle
  useEffect(() => {
    const cb = () => {
      void useAgentsStore.getState().hydrate();
      void useDirectivesStore.getState().hydrate();
      void useCommandSnippetsStore.getState().hydrate();
      void usePathBookmarksStore.getState().hydrate();
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(cb, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(cb, 1000);
    return () => clearTimeout(id);
  }, []);

  // Bootstrap SFTP transfer listeners
  useEffect(() => {
    void bootstrapTransferListeners();
  }, []);

  // Push worker-wide transfer settings (concurrency, chunk size, default
  // conflict policy) to the Rust worker once at startup and on every change.
  useEffect(() => {
    bootstrapTransferSettingsSync();
  }, []);

  // Bootstrap SFTP connection-lost listener (dead sessions → reconnect banner)
  useEffect(() => {
    void bootstrapSftpConnectionListener();
  }, []);

  // Global unhandled error handlers
  useEffect(() => {
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      e.preventDefault();
      handleApiError(e.reason, "Unhandled Error", "System");
    }
    function onError(e: ErrorEvent) {
      handleApiError(e.error ?? e.message, "Runtime Error", "System");
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return { keysLoaded, apiKeys, home };
}
