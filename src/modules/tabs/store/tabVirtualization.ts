import { create } from "zustand";
import { saveAllScrollbacks } from "@/modules/session/scrollback";
import { useTabsStore } from "./tabsStore";
import type { WorkspaceTab } from "../types";

// A tab is only suspend-eligible once it's been continuously inactive for
// this long — avoids thrashing xterm/WebGL teardown+recreate on rapid
// alt-tab-style switching (see SshTerminalPane's WebGL context-loss retry
// logic for how expensive repeated context churn already is).
const SUSPEND_DEBOUNCE_MS = 15_000;

// The N most-recently-active tabs are never suspended regardless of idle
// time, so round-robining through a handful of tabs faster than the
// debounce still stays snappy.
const LRU_FLOOR = 6;

type State = {
  suspendedTabIds: Set<number>;
  /** Most-recently-active first. */
  recentTabIds: number[];
};

export const useTabVirtualizationStore = create<State>(() => ({
  suspendedTabIds: new Set(),
  recentTabIds: [],
}));

export function isTabSuspended(tabId: number): boolean {
  return useTabVirtualizationStore.getState().suspendedTabIds.has(tabId);
}

const suspendTimers = new Map<number, ReturnType<typeof setTimeout>>();

function clearSuspendTimer(tabId: number): void {
  const timer = suspendTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    suspendTimers.delete(tabId);
  }
}

function markActive(tabId: number): void {
  clearSuspendTimer(tabId);
  useTabVirtualizationStore.setState((s) => {
    const recentTabIds = [tabId, ...s.recentTabIds.filter((id) => id !== tabId)];
    if (!s.suspendedTabIds.has(tabId)) return { recentTabIds };
    const suspendedTabIds = new Set(s.suspendedTabIds);
    suspendedTabIds.delete(tabId);
    return { suspendedTabIds, recentTabIds };
  });
}

function sessionIdsForTab(tabId: number): string[] {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.kind !== "workspace") return [];
  return Object.keys((tab as WorkspaceTab).sessions);
}

function scheduleSuspend(tabId: number): void {
  clearSuspendTimer(tabId);
  const timer = setTimeout(() => {
    suspendTimers.delete(tabId);
    if (useTabsStore.getState().activeId === tabId) return; // reactivated in the meantime
    const s = useTabVirtualizationStore.getState();
    if (s.suspendedTabIds.has(tabId)) return;
    const floor = new Set(s.recentTabIds.slice(0, LRU_FLOOR));
    if (floor.has(tabId)) return; // still within the always-live floor
    // Snapshot scrollback while the panes are still mounted and live — the
    // `serialize()` read happens synchronously below (before React even
    // re-renders with `suspended=true`), so it captures the full buffer
    // before any xterm instance is disposed. This is what keeps a suspended
    // tab's history from just vanishing if the app quits before it's ever
    // resumed (the periodic 30s save wouldn't otherwise cover the gap).
    void saveAllScrollbacks(sessionIdsForTab(tabId));
    const suspendedTabIds = new Set(s.suspendedTabIds);
    suspendedTabIds.add(tabId);
    useTabVirtualizationStore.setState({ suspendedTabIds });
  }, SUSPEND_DEBOUNCE_MS);
  suspendTimers.set(tabId, timer);
}

/** Drops all virtualization bookkeeping for a tab that's being closed —
 *  distinct from suspending it; the caller is responsible for actually
 *  tearing down/disconnecting any suspended session first. */
export function removeTabFromVirtualization(tabId: number): void {
  clearSuspendTimer(tabId);
  useTabVirtualizationStore.setState((s) => {
    if (!s.suspendedTabIds.has(tabId) && !s.recentTabIds.includes(tabId)) return s;
    const suspendedTabIds = new Set(s.suspendedTabIds);
    suspendedTabIds.delete(tabId);
    return { suspendedTabIds, recentTabIds: s.recentTabIds.filter((id) => id !== tabId) };
  });
}

// Wired reactively to tabsStore's activeId — kept in a separate module so
// tabsStore.ts (already large, and covered by types.test.ts) doesn't need to
// know virtualization exists. Whoever imports this module first (in
// practice, WorkspaceStack.tsx, well before any tab switch happens)
// registers the subscription.
let previousActiveId = useTabsStore.getState().activeId;
if (previousActiveId !== -1) markActive(previousActiveId);

useTabsStore.subscribe((state) => {
  if (state.activeId === previousActiveId) return;
  const prev = previousActiveId;
  previousActiveId = state.activeId;
  markActive(state.activeId);
  if (prev !== -1) scheduleSuspend(prev);
});
