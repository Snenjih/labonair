export { captureAndSave, captureSnapshot } from "./capture";
export { restoreIfEnabled, restoreSnapshot, type TabActions } from "./restore";
export { clearSnapshot, loadSnapshot, saveSnapshot } from "./store";
export type { RestoreResult, SessionSnapshot, TabSnapshot } from "./types";
export { setScrollbackLive, saveAllScrollbacks, cleanupScrollbacks } from "./scrollback";
export { useSessionLifecycle } from "./useSessionLifecycle";
export type { SessionLifecycleReturn } from "./useSessionLifecycle";
