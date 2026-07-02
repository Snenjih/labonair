import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { create } from "zustand";
import { useHostsStore } from "@/modules/hosts";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { isLabonairError } from "@/types";

function hostLabelFor(hostId: string): string {
  return useHostsStore.getState().hosts.find((h) => h.id === hostId)?.name ?? hostId;
}

export type LazySessionStatus = "connecting" | "connected" | "auth_required" | "error";

interface LazySessionEntry {
  status: LazySessionStatus;
  error: string | null;
}

interface LazySessionStore {
  sessions: Record<string, LazySessionEntry>;
  setStatus: (sessionId: string, status: LazySessionStatus, error?: string | null) => void;
  clear: (sessionId: string) => void;
}

const useLazySessionStore = create<LazySessionStore>((set) => ({
  sessions: {},
  setStatus: (sessionId, status, error = null) =>
    set((s) => ({ sessions: { ...s.sessions, [sessionId]: { status, error } } })),
  clear: (sessionId) =>
    set((s) => {
      const { [sessionId]: _drop, ...rest } = s.sessions;
      return { sessions: rest };
    }),
}));

// --- module-level lifecycle bookkeeping (ref-counting, idle timers — not
// reactive state, deliberately kept outside the store so re-renders only
// happen for the status field consumers actually read). ---

interface Lifecycle {
  refCount: number;
  hostId: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
  releasedAt: number | null;
  connectPromise: Promise<void> | null;
  /** Auto-reconnect attempts made since the last successful connect — reset
   *  on `acquire()`, manual `reconnect()`, and `session_established`. Caps
   *  against `sshAutoReconnectMaxAttempts` so a host that's simply offline
   *  doesn't retry forever in the background. */
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const lifecycles = new Map<string, Lifecycle>();

function sessionIdFor(hostId: string): string {
  return `explorer:${hostId}`;
}

function disconnect(sessionId: string) {
  const lifecycle = lifecycles.get(sessionId);
  if (lifecycle?.idleTimer) clearTimeout(lifecycle.idleTimer);
  if (lifecycle?.reconnectTimer) clearTimeout(lifecycle.reconnectTimer);
  lifecycles.delete(sessionId);
  useLazySessionStore.getState().clear(sessionId);
  void invoke("sftp_disconnect", { sessionId }).catch(() => {});
}

export interface IdleCandidate {
  sessionId: string;
  refCount: number;
  releasedAt: number | null;
}

/** Pure ordering logic, split out so it's unit-testable without touching the
 *  live `lifecycles` map or timers: given the current idle/active sessions,
 *  returns the session ids to evict (oldest-released-first) to bring the
 *  idle count back down to `maxIdle`. */
export function selectEvictionCandidates(entries: IdleCandidate[], maxIdle: number): string[] {
  const idle = entries
    .filter((e) => e.refCount === 0 && e.releasedAt !== null)
    .sort((a, b) => (a.releasedAt ?? 0) - (b.releasedAt ?? 0));
  const overflow = Math.max(0, idle.length - maxIdle);
  return idle.slice(0, overflow).map((e) => e.sessionId);
}

/** Keeps at most MAX_IDLE_SESSIONS connections alive with no active consumer
 *  — evicts the least-recently-released one immediately instead of waiting
 *  for its idle timer, so hopping across many hosts can't accumulate
 *  unbounded zombie SFTP connections. */
function evictIdleIfOverCap() {
  const entries: IdleCandidate[] = [...lifecycles.entries()].map(([sessionId, l]) => ({
    sessionId,
    refCount: l.refCount,
    releasedAt: l.releasedAt,
  }));
  const maxIdle = usePreferencesStore.getState().explorerMaxIdleSessions;
  for (const sessionId of selectEvictionCandidates(entries, maxIdle)) {
    disconnect(sessionId);
  }
}

async function connect(sessionId: string, hostId: string): Promise<void> {
  useLazySessionStore.getState().setStatus(sessionId, "connecting");
  try {
    // sftp_connect is idempotent (Phase 1) — safe to call even if a previous
    // acquire() for this sessionId is still in flight or already connected.
    await invoke("sftp_connect", { sessionId, hostId });
    useLazySessionStore.getState().setStatus(sessionId, "connected");
  } catch (e) {
    const message = isLabonairError(e) ? e.message : String(e);
    const isAuth = isLabonairError(e) && e.code === "AuthFailed";
    useLazySessionStore.getState().setStatus(sessionId, isAuth ? "auth_required" : "error", message);
    throw e;
  }
}

function acquire(hostId: string): string {
  const sessionId = sessionIdFor(hostId);
  let lifecycle = lifecycles.get(sessionId);
  if (!lifecycle) {
    lifecycle = {
      refCount: 0,
      hostId,
      idleTimer: null,
      releasedAt: null,
      connectPromise: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
    };
    lifecycles.set(sessionId, lifecycle);
  }
  lifecycle.refCount += 1;
  lifecycle.releasedAt = null;
  if (lifecycle.idleTimer) {
    clearTimeout(lifecycle.idleTimer);
    lifecycle.idleTimer = null;
  }
  if (!lifecycle.connectPromise) {
    lifecycle.connectPromise = connect(sessionId, hostId).catch(() => {
      // Leave connectPromise cleared so a later acquire() or manual
      // reconnect() can retry instead of being stuck on the first failure.
      lifecycle!.connectPromise = null;
    });
  }
  return sessionId;
}

function release(hostId: string) {
  const sessionId = sessionIdFor(hostId);
  const lifecycle = lifecycles.get(sessionId);
  if (!lifecycle) return;
  lifecycle.refCount = Math.max(0, lifecycle.refCount - 1);
  if (lifecycle.refCount > 0) return;
  lifecycle.releasedAt = Date.now();
  const idleMs = usePreferencesStore.getState().explorerIdleSessionTimeoutMin * 60_000;
  lifecycle.idleTimer = setTimeout(() => disconnect(sessionId), idleMs);
  evictIdleIfOverCap();
}

function reconnect(hostId: string) {
  const sessionId = sessionIdFor(hostId);
  const lifecycle = lifecycles.get(sessionId);
  if (!lifecycle) return;
  if (lifecycle.reconnectTimer) {
    clearTimeout(lifecycle.reconnectTimer);
    lifecycle.reconnectTimer = null;
  }
  lifecycle.reconnectAttempts = 0;
  lifecycle.connectPromise = connect(sessionId, hostId).catch(() => {
    lifecycle.connectPromise = null;
  });
}

/** Manually retries every lazy explorer session currently in `error` or
 *  `auth_required` — the command palette's "Reconnect Explorer Sessions"
 *  action. Resets the auto-reconnect attempt counter same as a manual
 *  `reconnect()` from the sidebar's Retry button. */
export function reconnectErroredExplorerSessions(): number {
  let count = 0;
  for (const [sessionId, lifecycle] of lifecycles) {
    const status = useLazySessionStore.getState().sessions[sessionId]?.status;
    if (status === "error" || status === "auth_required") {
      reconnect(lifecycle.hostId);
      count++;
    }
  }
  return count;
}

/** Forcibly disconnects a lazy session because the host itself was deleted
 *  from the host manager while it was in use. Unlike a normal `disconnect`,
 *  this deliberately leaves the store entry in an "error" state (instead of
 *  clearing it) so a still-mounted consumer shows a clear "host no longer
 *  exists" message instead of reverting to a perpetual "connecting" spinner. */
function evictForDeletedHost(hostId: string) {
  const sessionId = sessionIdFor(hostId);
  const lifecycle = lifecycles.get(sessionId);
  const label = hostLabelFor(hostId);
  if (lifecycle?.idleTimer) clearTimeout(lifecycle.idleTimer);
  if (lifecycle?.reconnectTimer) clearTimeout(lifecycle.reconnectTimer);
  lifecycles.delete(sessionId);
  useLazySessionStore.getState().setStatus(sessionId, "error", "This host no longer exists.");
  useNotificationStore.getState().addNotification({
    type: "warning",
    title: "Explorer Session Closed",
    message: `"${label}" was deleted while its file tree was open.`,
    source: "Explorer",
  });
  void invoke("sftp_disconnect", { sessionId }).catch(() => {});
}

let _listenersBootstrapped = false;

function bootstrapLazySessionListeners() {
  if (_listenersBootstrapped) return;
  _listenersBootstrapped = true;

  void listen<{ session_id: string; reason: string }>("ssh_connection_lost", (event) => {
    const { session_id, reason } = event.payload;
    const lifecycle = lifecycles.get(session_id);
    if (!lifecycle) return;
    useLazySessionStore.getState().setStatus(session_id, "error", reason);
    lifecycle.connectPromise = null;
    // Mirrors SshTerminalPane's ssh_connection_lost notification — the sidebar
    // tree's lazy session can drop while the panel isn't even mounted (e.g.
    // the user switched sidebar tabs), so the inline ExplorerAuthPrompt error
    // alone wouldn't be seen. Surface it in the notification bell too.
    useNotificationStore.getState().addNotification({
      type: "error",
      title: "Explorer Connection Lost",
      message: reason || "The connection was dropped unexpectedly.",
      source: hostLabelFor(lifecycle.hostId),
    });

    // Mirrors SshTerminalPane's auto-reconnect gate — reuses the same SSH
    // reconnect delay/attempt-cap prefs so the two surfaces behave
    // consistently, rather than introducing a second set of explorer-only
    // timing settings.
    const prefs = usePreferencesStore.getState();
    const isAuthFailure = (reason ?? "").toLowerCase().includes("auth");
    if (
      prefs.explorerAutoReconnect &&
      !isAuthFailure &&
      lifecycle.reconnectAttempts < prefs.sshAutoReconnectMaxAttempts
    ) {
      lifecycle.reconnectAttempts += 1;
      if (lifecycle.reconnectTimer) clearTimeout(lifecycle.reconnectTimer);
      lifecycle.reconnectTimer = setTimeout(() => {
        lifecycle.reconnectTimer = null;
        lifecycle.connectPromise = connect(session_id, lifecycle.hostId).catch(() => {
          lifecycle.connectPromise = null;
        });
      }, prefs.sshAutoReconnectDelay * 1000);
    }
  });

  void listen<{ session_id: string }>("session_established", (event) => {
    const { session_id } = event.payload;
    const lifecycle = lifecycles.get(session_id);
    if (!lifecycle) return;
    lifecycle.reconnectAttempts = 0;
    useLazySessionStore.getState().setStatus(session_id, "connected");
  });

  // A host deleted from the host manager mid-browse must not leave its lazy
  // session connected forever — nothing else would ever call disconnect for
  // it once its bookkeeping has no host row to reference.
  useHostsStore.subscribe((state) => {
    const liveHostIds = new Set(state.hosts.map((h) => h.id));
    for (const lifecycle of lifecycles.values()) {
      if (!liveHostIds.has(lifecycle.hostId)) {
        evictForDeletedHost(lifecycle.hostId);
      }
    }
  });
}

export interface LazyExplorerSession {
  sessionId: string;
  status: LazySessionStatus;
  error: string | null;
  reconnect: () => void;
}

/**
 * Acquires (ref-counted) a lazy SFTP session for `hostId` for as long as the
 * calling component is mounted with a non-null hostId, releasing it on
 * unmount/hostId change. Idempotent against React StrictMode's double-invoke
 * of effects — acquire()/release() only touch a plain refcount, and the
 * underlying sftp_connect call itself is idempotent (Phase 1).
 */
export function useLazyExplorerSession(hostId: string | null): LazyExplorerSession | null {
  bootstrapLazySessionListeners();

  const sessionId = hostId ? sessionIdFor(hostId) : null;
  const entry = useLazySessionStore((s) => (sessionId ? s.sessions[sessionId] : undefined));

  useEffect(() => {
    if (!hostId) return;
    acquire(hostId);
    return () => release(hostId);
  }, [hostId]);

  if (!hostId || !sessionId) return null;
  return {
    sessionId,
    status: entry?.status ?? "connecting",
    error: entry?.error ?? null,
    reconnect: () => reconnect(hostId),
  };
}
