import { Chat, type UIMessage } from "@ai-sdk/react";
import { type ChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { create } from "zustand";
import {
  DEFAULT_MODEL_ID,
  findModel,
  getModel,
  providerNeedsKey,
  type ModelId,
  type ProviderId,
} from "../config";
import { parseModelRef } from "../lib/modelRef";
import { useProvidersStore } from "./providersStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { BUILTIN_AGENTS } from "../lib/agents";
import { useAgentsStore } from "./agentsStore";
import { usePlanStore } from "./planStore";
import { useTodosStore } from "./todoStore";
import { EMPTY_PROVIDER_KEYS, hasAnyKey, type ProviderKeys } from "../lib/keyring";
import {
  deleteSessionData,
  deriveTitle,
  loadAll,
  loadMessages,
  newSessionId,
  saveActiveId,
  saveMessages,
  saveSessionsList,
  type SessionMeta,
} from "../lib/sessions";
import { createContextAwareTransport } from "../lib/transport";
import { clearSessionShell, type ToolContext } from "../tools/tools";

type Live = {
  getCwd: () => string | null;
  getTerminalContext: () => string | null;
  injectIntoActivePty: (text: string) => boolean;
  getWorkspaceRoot: () => string | null;
  getActiveFile: () => string | null;
  openPreview: (url: string) => boolean;
  getActiveTabKind: () => string | null;
  getActiveSshTabId: () => string | null;
  getTerminalTabs: () => { id: string; label: string; index: number }[];
  openTerminalWithCommand: (command: string) => void;
  injectIntoTerminal: (tabId: string, command: string) => void;
};

export type AgentRunStatus = "idle" | "thinking" | "streaming" | "awaiting-approval" | "error";

export type QueuedMessage = { id: string; text: string; createdAt: number };

export type AgentTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
};

export type AgentMeta = {
  status: AgentRunStatus;
  step: string | null;
  approvalsPending: number;
  error: string | null;
  tokens: AgentTokens;
  lastInputTokens: number;
  lastCachedTokens: number;
  hitStepCap: boolean;
  compactionNotice: { droppedCount: number; at: number } | null;
};

const ZERO_TOKENS: AgentTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  reasoningTokens: 0,
};

const IDLE_META: AgentMeta = {
  status: "idle",
  step: null,
  approvalsPending: 0,
  error: null,
  tokens: ZERO_TOKENS,
  lastInputTokens: 0,
  lastCachedTokens: 0,
  hitStepCap: false,
  compactionNotice: null,
};

/**
 * Derives the `AgentRunStatus` + pending-approval count from a Chat
 * instance's raw `status`/`messages` — the exact mapping `AgentRunBridge`
 * applies when it mounts for a session (`components/AgentRunBridge.tsx`).
 * Shared here so any code path that needs to know a chat's *real* current
 * status without a mounted bridge (LRU eviction, session switch) reuses the
 * same logic instead of re-deriving it.
 */
export function deriveRunStatus(
  status: "submitted" | "streaming" | "ready" | "error",
  messages: UIMessage[],
): { status: AgentRunStatus; approvalsPending: number } {
  let approvalsPending = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const p of m.parts) {
      if ((p as { state?: string }).state === "approval-requested") approvalsPending++;
    }
  }
  let runStatus: AgentRunStatus;
  if (approvalsPending > 0) runStatus = "awaiting-approval";
  else if (status === "submitted") runStatus = "thinking";
  else if (status === "streaming") runStatus = "streaming";
  else if (status === "error") runStatus = "error";
  else runStatus = "idle";
  return { status: runStatus, approvalsPending };
}

/** Resolves the `ProviderId` backing the currently globally-selected model,
 *  or null for a dynamically-fetched model id not in the static `MODELS`
 *  list (can't determine its provider without a network round trip). */
function activeModelProviderId(): ProviderId | null {
  const { modelDefId } = parseModelRef(useChatStore.getState().selectedModelId);
  return findModel(modelDefId)?.provider ?? null;
}

export type MiniState = {
  open: boolean;
};

export type PendingSelection = {
  id: string;
  text: string;
  source: "terminal" | "editor";
};

export type ApprovalResponder = (approvalId: string, approved: boolean) => void;

type StoreState = {
  live: Live;
  setLive: (live: Live) => void;

  /**
   * Set by AgentRunBridge each render. Lets surfaces outside the chat hook
   * tree (e.g. the AI diff tab in the editor area) resolve a pending tool
   * approval through the active session's `addToolApprovalResponse`.
   */
  approvalResponder: ApprovalResponder | null;
  setApprovalResponder: (fn: ApprovalResponder | null) => void;
  respondToApproval: (approvalId: string, approved: boolean) => void;

  apiKeys: ProviderKeys;
  setApiKeys: (keys: ProviderKeys) => void;
  setApiKey: (provider: ProviderId, key: string | null) => void;

  selectedModelId: ModelId;
  setSelectedModelId: (id: ModelId) => void;
  favoriteModelIds: string[];
  recentModelIds: string[];
  toggleFavoriteModel: (id: string) => void;

  mini: MiniState;
  openMini: () => void;
  closeMini: () => void;
  toggleMini: () => void;

  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  focusSignal: number;
  pendingPrefill: string | null;
  focusInput: (prefill?: string | null) => void;
  consumePrefill: () => string | null;

  pendingSelections: PendingSelection[];
  attachSelection: (text: string, source: "terminal" | "editor") => void;
  consumeSelections: () => PendingSelection[];

  agentMeta: AgentMeta;
  patchAgentMeta: (patch: Partial<AgentMeta>) => void;
  resetAgentMeta: () => void;

  // Sessions
  sessionsHydrated: boolean;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  hydrateSessions: () => Promise<void>;
  newSession: () => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  /** Persist messages of a session and bump its updatedAt + auto-title. */
  persistMessages: (id: string, messages: UIMessage[]) => void;

  // Per-session message queue — messages typed while AI is busy, auto-sent on idle
  queues: Record<string, QueuedMessage[]>;
  enqueueMessage: (sessionId: string, text: string) => QueuedMessage | null;
  dequeueMessage: (sessionId: string) => QueuedMessage | null;
  cancelQueuedMessage: (sessionId: string, id: string) => void;
  clearQueue: (sessionId: string) => void;
};

const NOOP_LIVE: Live = {
  getCwd: () => null,
  getTerminalContext: () => null,
  injectIntoActivePty: () => false,
  getWorkspaceRoot: () => null,
  getActiveFile: () => null,
  openPreview: () => false,
  getActiveTabKind: () => null,
  getActiveSshTabId: () => null,
  getTerminalTabs: () => [],
  openTerminalWithCommand: () => {},
  injectIntoTerminal: () => {},
};

// Per-session Chat instances. Transport reads the keys map lazily, so a key
// change does not require rebuilding chats.
const CHATS_LRU_CAP = 8;
const chats = new Map<string, Chat<UIMessage>>();

function touchChat(id: string, c: Chat<UIMessage>): void {
  // Move to Map insertion-order tail (= most-recently-used position).
  chats.delete(id);
  chats.set(id, c);
  if (chats.size <= CHATS_LRU_CAP) return;
  const activeId = useChatStore.getState().activeSessionId;
  for (const oldest of chats.keys()) {
    if (oldest === activeId) continue;
    const evicted = chats.get(oldest);
    if (pendingPersist.has(oldest)) {
      // A mounted AgentRunBridge already queued a debounced write — flush it.
      flushPersistEntry(oldest);
    } else if (evicted) {
      // No bridge was ever mounted for this background session (it only
      // streams via its own Chat object, see AgentRunBridge's single-
      // activeSessionId-only mount), so nothing was ever queued here even if
      // it's mid-stream — read its current messages directly before it gets
      // stopped, or an in-progress response is both killed and never saved.
      void saveMessages(oldest, evicted.messages);
    }
    void evicted?.stop();
    // Same reasoning as `deleteSession` below — an evicted background
    // session's backing Rust shell process would otherwise leak for the rest
    // of the app's lifetime, since nothing else ever closes it.
    void clearSessionShell(oldest);
    chats.delete(oldest);
    if (chats.size <= CHATS_LRU_CAP) break;
  }
}
// Initial messages for a session, populated at hydration time and consumed
// when the matching Chat is constructed.
const seedMessages = new Map<string, UIMessage[]>();

// Trailing debounce for per-token message persistence. Streaming fires
// `persistMessages` on every token; without this we'd JSON-serialize the
// full message array and round-trip to the store plugin per token, which
// stalls the UI. Flush on idle (status transition) via `flushPersist`.
const PERSIST_DEBOUNCE_MS = 300;
const pendingPersist = new Map<string, { latest: UIMessage[]; timer: ReturnType<typeof setTimeout> }>();

function flushPersistEntry(id: string) {
  const entry = pendingPersist.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingPersist.delete(id);
  void saveMessages(id, entry.latest);
}

export function flushPersist(id?: string): void {
  if (id) {
    flushPersistEntry(id);
    return;
  }
  for (const key of Array.from(pendingPersist.keys())) flushPersistEntry(key);
}

function makeChat(sessionId: string): Chat<UIMessage> {
  // Per-session read cache: paths the model has called `read_file` on.
  // `edit`/`multi_edit` enforce read-before-edit by checking membership.
  const readCache = new Set<string>();
  const toolContext: ToolContext = {
    getCwd: () => useChatStore.getState().live.getCwd(),
    getWorkspaceRoot: () => useChatStore.getState().live.getWorkspaceRoot(),
    getTerminalContext: () => useChatStore.getState().live.getTerminalContext(),
    injectIntoActivePty: (text) => useChatStore.getState().live.injectIntoActivePty(text),
    openPreview: (url) => useChatStore.getState().live.openPreview(url),
    readCache,
    getSessionId: () => sessionId,
    getActiveTabKind: () => useChatStore.getState().live.getActiveTabKind(),
    getActiveSshTabId: () => useChatStore.getState().live.getActiveSshTabId(),
    getTerminalTabs: () => useChatStore.getState().live.getTerminalTabs(),
    openTerminalWithCommand: (command) => useChatStore.getState().live.openTerminalWithCommand(command),
    injectIntoTerminal: (tabId, command) => useChatStore.getState().live.injectIntoTerminal(tabId, command),
  };

  const transport = createContextAwareTransport({
    getKeys: () => useChatStore.getState().apiKeys,
    getInstances: () => useProvidersStore.getState().instances,
    getInstanceKeys: () => useProvidersStore.getState().instanceKeys,
    toolContext,
    getModelId: () => useChatStore.getState().selectedModelId,
    getCustomInstructions: () => usePreferencesStore.getState().customInstructions,
    getAgentPersona: () => {
      const { activeId, customAgents } = useAgentsStore.getState();
      const all = [...BUILTIN_AGENTS, ...customAgents];
      const a = all.find((x) => x.id === activeId) ?? BUILTIN_AGENTS[0];
      return { name: a.name, instructions: a.instructions };
    },
    getLive: () => {
      const live = useChatStore.getState().live;
      return {
        cwd: live.getCwd(),
        terminal: live.getTerminalContext(),
        workspaceRoot: live.getWorkspaceRoot(),
        activeFile: live.getActiveFile(),
      };
    },
    getLmstudioBaseURL: () => usePreferencesStore.getState().lmstudioBaseURL,
    getLmstudioChatModelId: () => usePreferencesStore.getState().lmstudioChatModelId || undefined,
    getOpenaiCompatibleBaseURL: () => usePreferencesStore.getState().openaiCompatibleBaseURL || undefined,
    getOpenaiCompatibleModelId: () => usePreferencesStore.getState().openaiCompatibleModelId || undefined,
    getMlxBaseURL: () => usePreferencesStore.getState().mlxBaseURL || undefined,
    getMlxChatModelId: () => usePreferencesStore.getState().mlxChatModelId || undefined,
    getOllamaBaseURL: () => usePreferencesStore.getState().ollamaBaseURL || undefined,
    getOllamaChatModelId: () => usePreferencesStore.getState().ollamaChatModelId || undefined,
    getPlanMode: () => usePlanStore.getState().active,
    getMaxAgentSteps: () => usePreferencesStore.getState().aiMaxAgentSteps,
    getTemperature: () => usePreferencesStore.getState().aiTemperature,
    getTerminalContextLines: () => usePreferencesStore.getState().aiTerminalContextLines,
    onStep: (step) => {
      useChatStore.getState().patchAgentMeta({ step });
    },
    onUsage: ({ inputTokens, outputTokens, cacheReadTokens, reasoningTokens, isFinal }) => {
      const s = useChatStore.getState();
      if (isFinal) {
        s.patchAgentMeta({
          tokens: { inputTokens, outputTokens, cacheReadTokens, reasoningTokens },
          lastInputTokens: inputTokens,
          lastCachedTokens: cacheReadTokens,
        });
      } else {
        const prev = s.agentMeta.tokens;
        s.patchAgentMeta({
          tokens: {
            inputTokens: prev.inputTokens + inputTokens,
            outputTokens: prev.outputTokens + outputTokens,
            cacheReadTokens: prev.cacheReadTokens + cacheReadTokens,
            reasoningTokens: prev.reasoningTokens + reasoningTokens,
          },
          lastInputTokens: inputTokens,
          lastCachedTokens: cacheReadTokens,
        });
      }
    },
    onFinishMeta: ({ hitStepCap }) => {
      useChatStore.getState().patchAgentMeta({ hitStepCap });
    },
    onCompaction: ({ droppedCount }) => {
      useChatStore.getState().patchAgentMeta({
        compactionNotice: { droppedCount, at: Date.now() },
      });
    },
  }) as unknown as ChatTransport<UIMessage>;

  const initialMessages = seedMessages.get(sessionId);
  seedMessages.delete(sessionId);

  return new Chat<UIMessage>({
    id: sessionId,
    transport,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (e) => {
      useChatStore.getState().patchAgentMeta({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    },
  });
}

export const useChatStore = create<StoreState>((set, get) => ({
  live: NOOP_LIVE,
  setLive: (live) => set({ live }),

  approvalResponder: null,
  setApprovalResponder: (fn) => set({ approvalResponder: fn }),
  respondToApproval: (approvalId, approved) => {
    const fn = get().approvalResponder;
    if (fn) fn(approvalId, approved);
  },

  apiKeys: { ...EMPTY_PROVIDER_KEYS },
  // Resetting `agentMeta` to idle here used to be unconditional — but
  // `setApiKeys` is called from a global `onKeysChanged` listener that fires
  // on ANY provider key edit anywhere in Settings, so editing an unrelated
  // provider's key while a session is mid-stream/awaiting-approval falsely
  // cleared that status. This is a partial mitigation, not a full fix: there
  // is currently no per-session provider/model binding (`selectedModelId` is
  // one global value shared by every session), so this can only compare
  // against the *globally* selected model, not each session's own model.
  setApiKeys: (keys) => {
    const prev = get().apiKeys;
    const changedProviders = (Object.keys(keys) as ProviderId[]).filter((p) => prev[p] !== keys[p]);
    const activeProvider = activeModelProviderId();
    const affectsActiveModel = activeProvider === null || changedProviders.includes(activeProvider);
    set({
      apiKeys: keys,
      ...(affectsActiveModel && get().agentMeta.status !== "idle" ? { agentMeta: IDLE_META } : {}),
    });
  },
  setApiKey: (provider, key) => {
    const next = { ...get().apiKeys, [provider]: key };
    const activeProvider = activeModelProviderId();
    const affectsActiveModel = activeProvider === null || activeProvider === provider;
    set({
      apiKeys: next,
      ...(affectsActiveModel && get().agentMeta.status !== "idle" ? { agentMeta: IDLE_META } : {}),
    });
  },

  selectedModelId: (() => {
    try {
      return (localStorage.getItem("labonair-selected-model") as ModelId | null) ?? DEFAULT_MODEL_ID;
    } catch {
      return DEFAULT_MODEL_ID;
    }
  })(),
  setSelectedModelId: (id) => {
    const recents = [id, ...get().recentModelIds.filter((r) => r !== id)].slice(0, 10);
    set({ selectedModelId: id, recentModelIds: recents });
    try {
      localStorage.setItem("labonair-selected-model", id);
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("labonair-recent-models", JSON.stringify(recents));
    } catch {
      /* ignore */
    }
  },
  favoriteModelIds: (() => {
    try {
      return JSON.parse(localStorage.getItem("labonair-favorite-models") ?? "[]") as string[];
    } catch {
      return [];
    }
  })(),
  recentModelIds: (() => {
    try {
      return JSON.parse(localStorage.getItem("labonair-recent-models") ?? "[]") as string[];
    } catch {
      return [];
    }
  })(),
  toggleFavoriteModel: (id) => {
    const favs = get().favoriteModelIds;
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    set({ favoriteModelIds: next });
    try {
      localStorage.setItem("labonair-favorite-models", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },

  mini: { open: false },
  openMini: () => set({ mini: { open: true } }),
  closeMini: () => set({ mini: { open: false } }),
  toggleMini: () => set((s) => ({ mini: { open: !s.mini.open } })),

  panelOpen: false,
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  focusSignal: 0,
  pendingPrefill: null,
  focusInput: (prefill = null) =>
    set((s) => ({
      panelOpen: true,
      focusSignal: s.focusSignal + 1,
      pendingPrefill: prefill ?? null,
    })),
  consumePrefill: () => {
    const v = get().pendingPrefill;
    if (v != null) set({ pendingPrefill: null });
    return v;
  },

  pendingSelections: [],
  attachSelection: (text, source) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({
      panelOpen: true,
      focusSignal: s.focusSignal + 1,
      pendingSelections: [...s.pendingSelections, { id, text: trimmed, source }],
    }));
  },
  consumeSelections: () => {
    const v = get().pendingSelections;
    if (v.length > 0) set({ pendingSelections: [] });
    return v;
  },

  agentMeta: IDLE_META,
  patchAgentMeta: (patch) => set((s) => ({ agentMeta: { ...s.agentMeta, ...patch } })),
  resetAgentMeta: () => set({ agentMeta: IDLE_META }),

  sessionsHydrated: false,
  sessions: [],
  activeSessionId: null,

  hydrateSessions: async () => {
    if (get().sessionsHydrated) return;
    const { sessions } = await loadAll();

    // Reuse the most recent untitled "New chat" session if one exists from
    // the previous run — no point stacking empty placeholder sessions every
    // launch. Otherwise prepend a fresh one.
    const reusable = sessions[0]?.title === "New chat" ? sessions[0] : null;
    let nextSessions: SessionMeta[];
    let freshId: string;
    if (reusable) {
      nextSessions = sessions;
      freshId = reusable.id;
    } else {
      freshId = newSessionId();
      const fresh: SessionMeta = {
        id: freshId,
        title: "New chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      nextSessions = [fresh, ...sessions];
      void saveSessionsList(nextSessions);
    }
    void saveActiveId(freshId);

    set({
      sessions: nextSessions,
      activeSessionId: freshId,
      sessionsHydrated: true,
    });
  },

  newSession: () => {
    get().clearQueue(get().activeSessionId ?? "");
    const id = newSessionId();
    const meta: SessionMeta = {
      id,
      title: "New chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [meta, ...get().sessions];
    set({ sessions: next, activeSessionId: id, agentMeta: IDLE_META });
    void saveSessionsList(next);
    void saveActiveId(id);
    return id;
  },

  switchSession: (id) => {
    if (get().activeSessionId === id) return;
    if (!get().sessions.some((s) => s.id === id)) return;
    get().clearQueue(get().activeSessionId ?? "");

    // Lazily seed the chat with persisted messages the first time we open
    // this session. Subsequent switches reuse the cached Chat instance.
    const flip = (chat?: Chat<UIMessage>) => {
      // A cached chat may still be streaming/awaiting-approval in the
      // background (see `touchChat`'s LRU note) — hardcoding idle here used
      // to briefly show the wrong status until `AgentRunBridge` re-mounted
      // and corrected it. Derive the real status up front instead.
      const meta = chat ? { ...IDLE_META, ...deriveRunStatus(chat.status, chat.messages) } : IDLE_META;
      set({ activeSessionId: id, agentMeta: meta });
      void saveActiveId(id);
    };
    if (chats.has(id) || seedMessages.has(id)) {
      const existing = chats.get(id);
      if (existing) touchChat(id, existing);
      flip(existing);
      return;
    }
    void loadMessages(id).then((m) => {
      if (m && m.length > 0 && !chats.has(id)) seedMessages.set(id, m);
      flip();
    });
  },

  deleteSession: (id) => {
    const remaining = get().sessions.filter((s) => s.id !== id);
    chats.get(id)?.stop();
    chats.delete(id);
    seedMessages.delete(id);
    const pend = pendingPersist.get(id);
    if (pend) {
      clearTimeout(pend.timer);
      pendingPersist.delete(id);
    }
    void deleteSessionData(id);
    void useTodosStore.getState().clearSession(id);
    void clearSessionShell(id);
    get().clearQueue(id);

    if (remaining.length === 0) {
      const fresh: SessionMeta = {
        id: newSessionId(),
        title: "New chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      set({ sessions: [fresh], activeSessionId: fresh.id });
      void saveSessionsList([fresh]);
      void saveActiveId(fresh.id);
      return;
    }

    const wasActive = get().activeSessionId === id;
    const nextActive = wasActive ? remaining[0].id : get().activeSessionId;
    set({ sessions: remaining, activeSessionId: nextActive });
    void saveSessionsList(remaining);
    if (wasActive) void saveActiveId(nextActive);
  },

  renameSession: (id, title) => {
    const next = get().sessions.map((s) => (s.id === id ? { ...s, title, updatedAt: Date.now() } : s));
    set({ sessions: next });
    void saveSessionsList(next);
  },

  queues: {},
  enqueueMessage: (sessionId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const msg: QueuedMessage = {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      createdAt: Date.now(),
    };
    set((s) => ({
      queues: { ...s.queues, [sessionId]: [...(s.queues[sessionId] ?? []), msg] },
    }));
    return msg;
  },
  dequeueMessage: (sessionId) => {
    const queue = get().queues[sessionId];
    if (!queue?.length) return null;
    const [first, ...rest] = queue;
    set((s) => ({ queues: { ...s.queues, [sessionId]: rest } }));
    return first;
  },
  cancelQueuedMessage: (sessionId, id) => {
    set((s) => ({
      queues: {
        ...s.queues,
        [sessionId]: (s.queues[sessionId] ?? []).filter((m) => m.id !== id),
      },
    }));
  },
  clearQueue: (sessionId) => {
    if (!sessionId) return;
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [sessionId]: _dropped, ...rest } = s.queues;
      return { queues: rest };
    });
  },

  persistMessages: (id, messages) => {
    // Debounce the message-blob write so streaming doesn't pound the store.
    const existing = pendingPersist.get(id);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const entry = pendingPersist.get(id);
      if (!entry) return;
      pendingPersist.delete(id);
      void saveMessages(id, entry.latest);
    }, PERSIST_DEBOUNCE_MS);
    pendingPersist.set(id, { latest: messages, timer });

    // Update zustand session list only when the derived title actually
    // changes — otherwise we'd rewrite the sessions array (and trigger
    // re-renders + a store write) on every token.
    const sessions = get().sessions;
    const meta = sessions.find((s) => s.id === id);
    if (!meta) return;
    const isUntitled = !meta.title || meta.title === "New chat";
    if (!isUntitled) return;
    const nextTitle = deriveTitle(messages);
    if (nextTitle === meta.title) return;
    const next = sessions.map((s) => (s.id === id ? { ...s, title: nextTitle, updatedAt: Date.now() } : s));
    set({ sessions: next });
    void saveSessionsList(next);
  },
}));

export function getAgentMeta(): AgentMeta {
  return useChatStore.getState().agentMeta;
}

export function getActiveProviderKey(): string | null {
  const { selectedModelId, apiKeys } = useChatStore.getState();
  return apiKeys[getModel(selectedModelId).provider] ?? null;
}

export function hasKeyForModel(modelId: ModelId): boolean {
  const { apiKeys } = useChatStore.getState();
  const m = getModel(modelId);
  // Keyless and optional-key providers are always considered "ready"
  if (!providerNeedsKey(m.provider) || m.provider === "openai-compatible") return true;
  return !!apiKeys[m.provider];
}

/** Whether at least one usable AI provider is configured — checks both the
 *  current multi-instance store (`useProvidersStore`) and the legacy
 *  single-key-per-provider store, since an instance only needs *a* key
 *  somewhere on one of its providers to make the composer usable. */
export function useHasComposer(): boolean {
  const instances = useProvidersStore((s) => s.instances);
  const instanceKeys = useProvidersStore((s) => s.instanceKeys);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const hasUsableInstance = instances.some((i) => !providerNeedsKey(i.providerId) || !!instanceKeys[i.id]);
  return hasUsableInstance || hasAnyKey(apiKeys);
}

export function getOrCreateChat(sessionId: string): Chat<UIMessage> {
  const existing = chats.get(sessionId);
  if (existing) {
    touchChat(sessionId, existing);
    return existing;
  }
  const c = makeChat(sessionId);
  touchChat(sessionId, c);
  return c;
}

export function getChat(sessionId?: string): Chat<UIMessage> | undefined {
  if (sessionId) return chats.get(sessionId);
  const id = useChatStore.getState().activeSessionId;
  return id ? chats.get(id) : undefined;
}

export async function sendMessage(text: string): Promise<boolean> {
  const state = useChatStore.getState();
  const sessionId = state.activeSessionId;
  if (!sessionId) return false;
  const selectedModel = getModel(state.selectedModelId);
  // Allow keyless (lmstudio) and optional-key (openai-compatible) providers
  const requiresKey =
    providerNeedsKey(selectedModel.provider) && selectedModel.provider !== "openai-compatible";
  if (requiresKey && !getActiveProviderKey()) return false;
  const c = getOrCreateChat(sessionId);
  await c.sendMessage({ text });
  return true;
}

export function stop(): void {
  const id = useChatStore.getState().activeSessionId;
  if (!id) return;
  void chats.get(id)?.stop();
}
