import { create } from "zustand";

export type ConnectionKind = "terminal" | "sftp";
export type ConnectionStatus = "connecting" | "connected" | "error";

export interface ConnectionEntry {
  sessionId: string;
  hostId: string;
  kind: ConnectionKind;
  status: ConnectionStatus;
  error: string | null;
  /** Snapshotted at connect time, not re-derived live — the backend session's
   *  actual transport was fixed at connect time, so re-deriving from a
   *  possibly-since-changed host record would show routing that isn't real. */
  jumpHostName: string | null;
  /** Snapshotted at connect time — survives the host being deleted later. */
  hostLabel: string;
  /** Navigation metadata — only the field matching `kind` is set. */
  workspaceTabId?: number;
  paneId?: string;
  sftpTabId?: number;
  connectedAt: number;
}

interface ConnectionStatusState {
  connections: Record<string, ConnectionEntry>;
  /** Create or fully replace an entry — used at connect-attempt start, when
   *  hostId/kind/jumpHostName/hostLabel are all known. */
  upsert: (sessionId: string, entry: Omit<ConnectionEntry, "sessionId" | "connectedAt">) => void;
  /** Update just the status/error of an existing entry — a no-op if the
   *  entry hasn't been created via `upsert` yet. */
  setStatus: (sessionId: string, status: ConnectionStatus, error?: string | null) => void;
  remove: (sessionId: string) => void;
}

export const useConnectionStatusStore = create<ConnectionStatusState>((set) => ({
  connections: {},

  upsert: (sessionId, entry) =>
    set((s) => ({
      connections: {
        ...s.connections,
        [sessionId]: { ...entry, sessionId, connectedAt: Date.now() },
      },
    })),

  setStatus: (sessionId, status, error = null) =>
    set((s) => {
      const existing = s.connections[sessionId];
      if (!existing) return s;
      return { connections: { ...s.connections, [sessionId]: { ...existing, status, error } } };
    }),

  remove: (sessionId) =>
    set((s) => {
      const { [sessionId]: _drop, ...rest } = s.connections;
      return { connections: rest };
    }),
}));
