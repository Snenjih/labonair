import { useEffect, useRef } from "react";
import { getKey } from "@/modules/ai/lib/keyring";
import { onKeysChanged } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";

/**
 * Keeps API key refs up-to-date for the active autocomplete provider
 * and the openai-compatible provider (always tracked independently).
 */
export function useApiKeys() {
  const apiKeyRef = useRef<string | null>(null);
  const openaiCompatibleKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const provider = usePreferencesStore.getState().autocompleteProvider;
      if (provider === "lmstudio") {
        apiKeyRef.current = null;
        return;
      }
      const k = await getKey(provider);
      if (!cancelled) {
        if (provider === "openai-compatible") {
          openaiCompatibleKeyRef.current = k;
        } else {
          apiKeyRef.current = k;
        }
      }
    };
    const refreshCompat = async () => {
      const k = await getKey("openai-compatible");
      if (!cancelled) openaiCompatibleKeyRef.current = k;
    };
    void refresh();
    void refreshCompat();
    let unlistenKeys: (() => void) | undefined;
    void onKeysChanged(() => { void refresh(); void refreshCompat(); }).then((un) => {
      unlistenKeys = un;
    });
    const unsubPrefs = usePreferencesStore.subscribe((state, prev) => {
      if (state.autocompleteProvider !== prev.autocompleteProvider) void refresh();
    });
    return () => {
      cancelled = true;
      unlistenKeys?.();
      unsubPrefs();
    };
  }, []);

  return { apiKeyRef, openaiCompatibleKeyRef };
}
