import { useEffect } from "react";
import { useUpdaterStore } from "./updaterStore";

export type { UpdaterStatus } from "./updaterStore";

interface HookOptions {
  autoCheck?: boolean;
}

export function useUpdater({ autoCheck = true }: HookOptions = {}) {
  const status = useUpdaterStore((s) => s.status);
  const runCheck = useUpdaterStore((s) => s.runCheck);
  const install = useUpdaterStore((s) => s.install);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  useEffect(() => {
    if (!autoCheck) return;
    void runCheck();
  }, [autoCheck, runCheck]);

  return { status, check: runCheck, install, dismiss };
}
