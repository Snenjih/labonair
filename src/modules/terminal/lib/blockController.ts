import { useCallback, useSyncExternalStore } from "react";
import { useTabsStore } from "@/modules/tabs";
import { getActiveBlockSession } from "@/modules/tabs/store/tabsStore";
import type { BlockMode } from "@/modules/terminal/block";

export function useBlockController() {
  const tabsState = useTabsStore.getState();
  const session = getActiveBlockSession(tabsState);

  const mode = useSyncExternalStore<BlockMode>(
    useCallback((onStoreChange) => {
      const s = getActiveBlockSession(useTabsStore.getState());
      if (!s) return () => {};
      return s.subscribeMode(onStoreChange);
    }, []),
    () => {
      const s = getActiveBlockSession(useTabsStore.getState());
      return s?.getMode() ?? "prompt";
    },
    () => "prompt" as BlockMode,
  );

  const submit = useCallback((text: string) => {
    getActiveBlockSession(useTabsStore.getState())?.submit(text);
  }, []);

  const interrupt = useCallback(() => {
    getActiveBlockSession(useTabsStore.getState())?.interrupt();
  }, []);

  return {
    mode,
    submit,
    interrupt,
    hasSession: session !== null,
  };
}
