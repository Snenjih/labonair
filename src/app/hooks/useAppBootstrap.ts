import { useEffect, useState } from "react";
import { getAllKeys, useChatStore, type ProviderKeys } from "@/modules/ai";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useDirectivesStore } from "@/modules/ai/store/directivesStore";
import { useCommandSnippetsStore } from "@/modules/snippets";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { onKeysChanged } from "@/modules/settings/store";
import { useKeybindsStore } from "@/modules/shortcuts";
import { bootstrapTransferListeners } from "@/modules/sftp/store/transferStore";
import { useThemeEngine } from "@/lib/useThemeEngine";
import { useTerminalCursorBlinkInterval } from "@/lib/useTerminalCursorBlinkInterval";
import { handleApiError } from "@/lib/errors";
import { homeDir } from "@tauri-apps/api/path";

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
    homeDir().then(setHome).catch(() => setHome(null));
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
  useEffect(() => { void initPrefs(); }, [initPrefs]);

  // Keybinds init
  useEffect(() => { void initKeybinds(); }, [initKeybinds]);

  // Theme engine (owns its own effects internally)
  useThemeEngine();

  // Terminal cursor blink (owns its own effects internally)
  useTerminalCursorBlinkInterval();

  // Sync default model from preferences once hydrated
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  // Hydrate sessions, agents, directives, snippets
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useDirectivesStore.getState().hydrate();
    void useCommandSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  // Bootstrap SFTP transfer listeners
  useEffect(() => { void bootstrapTransferListeners(); }, []);

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
