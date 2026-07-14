import { handleApiError } from "@/lib/errors";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import type { CreateHostPayload, Group, Host, ReorderItem, UpdateHostPayload } from "../types";

type PingStatus = "online" | "offline" | "checking";

interface HostsState {
  hosts: Host[];
  groups: Group[];
  selectedHostId: string | null;
  selectedHostIds: Set<string>;
  lastSingleClickId: string | null;
  isLoading: boolean;
  hasFetched: boolean;
  fetchError: string | null;

  hostStatuses: Record<string, PingStatus>;
  startPingWorker: (intervalSeconds?: number) => void;
  stopPingWorker: () => void;

  fetchData: () => Promise<void>;
  createHost: (payload: CreateHostPayload) => Promise<Host>;
  updateHost: (payload: UpdateHostPayload) => Promise<Host>;
  deleteHost: (id: string) => Promise<void>;
  deleteManyHosts: (ids: string[]) => Promise<void>;
  duplicateHost: (id: string) => Promise<Host>;
  reorderHosts: (items: ReorderItem[]) => Promise<void>;
  togglePin: (id: string) => Promise<void>;

  setSelectedHost: (id: string | null) => void;
  selectHost: (id: string, mode: "single" | "toggle" | "range") => void;
  clearMultiSelect: () => void;

  createGroup: (name: string, icon?: string, color?: string) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
}

let _pingIntervalId: ReturnType<typeof setInterval> | null = null;

async function runPingCycle(
  get: () => HostsState,
  set: (fn: (s: HostsState) => Partial<HostsState>) => void,
) {
  const { hosts } = get();
  // Deduplicate by address:port to avoid redundant pings
  const seen = new Map<string, string[]>(); // key -> hostIds[]
  for (const h of hosts) {
    const key = `${h.host_address}:${h.port}`;
    const bucket = seen.get(key) ?? [];
    bucket.push(h.id);
    seen.set(key, bucket);
  }

  const results = await Promise.allSettled(
    [...seen.entries()].map(async ([key, ids]) => {
      const [addr, portStr] = key.split(":");
      const online = await invoke<boolean>("ping_host", { hostAddress: addr, port: parseInt(portStr, 10) });
      return { ids, online };
    }),
  );

  set((s) => {
    const next = { ...s.hostStatuses };
    for (const r of results) {
      if (r.status === "fulfilled") {
        const status: PingStatus = r.value.online ? "online" : "offline";
        for (const id of r.value.ids) next[id] = status;
      }
    }
    return { hostStatuses: next };
  });
}

export const useHostsStore = create<HostsState>((set, get) => ({
  hosts: [],
  groups: [],
  selectedHostId: null,
  selectedHostIds: new Set(),
  lastSingleClickId: null,
  isLoading: true,
  hasFetched: false,
  fetchError: null,

  hostStatuses: {},

  startPingWorker: (intervalSeconds = 60) => {
    if (_pingIntervalId !== null) {
      clearInterval(_pingIntervalId);
      _pingIntervalId = null;
    }
    void runPingCycle(get, set);
    if (intervalSeconds > 0) {
      _pingIntervalId = setInterval(() => void runPingCycle(get, set), intervalSeconds * 1000);
    }
  },

  stopPingWorker: () => {
    if (_pingIntervalId !== null) {
      clearInterval(_pingIntervalId);
      _pingIntervalId = null;
    }
  },

  fetchData: async () => {
    set({ isLoading: true, fetchError: null });
    try {
      const [hosts, groups] = await Promise.all([
        invoke<Host[]>("hosts_get_all"),
        invoke<Group[]>("groups_get_all"),
      ]);
      set({ hosts, groups, isLoading: false, hasFetched: true, fetchError: null });
    } catch (e) {
      handleApiError(e, "Failed to load hosts", "Hosts");
      const msg = e instanceof Error ? e.message : String(e);
      set({ isLoading: false, hasFetched: true, fetchError: msg });
    }
  },

  createHost: async (payload) => {
    const host = await invoke<Host>("hosts_create", {
      name: payload.name,
      hostAddress: payload.host_address,
      port: payload.port,
      username: payload.username,
      authMethod: payload.auth_method,
      ...(payload.private_key_path !== undefined && { privateKeyPath: payload.private_key_path }),
      ...(payload.group_id !== undefined && { groupId: payload.group_id }),
      ...(payload.tags !== undefined && { tags: payload.tags }),
      ...(payload.password !== undefined && { password: payload.password }),
      ...(payload.sudo_password !== undefined && { sudoPassword: payload.sudo_password }),
      ...(payload.default_path_ssh !== undefined && { defaultPathSsh: payload.default_path_ssh }),
      ...(payload.default_path_sftp !== undefined && { defaultPathSftp: payload.default_path_sftp }),
      pinToTop: payload.pin_to_top ?? false,
      ...(payload.keep_alive_interval !== undefined && { keepAliveInterval: payload.keep_alive_interval }),
      ...(payload.keep_alive_tries !== undefined && { keepAliveTries: payload.keep_alive_tries }),
      ...(payload.sort_order !== undefined && { sortOrder: payload.sort_order }),
      ...(payload.credential_id !== undefined && { credentialId: payload.credential_id }),
      ...(payload.jump_host_id !== undefined && { jumpHostId: payload.jump_host_id }),
      ...(payload.notes !== undefined && { notes: payload.notes }),
    });
    set((s) => ({ hosts: [...s.hosts, host] }));
    return host;
  },

  updateHost: async (payload) => {
    const host = await invoke<Host>("hosts_update", {
      id: payload.id,
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.host_address !== undefined && { hostAddress: payload.host_address }),
      ...(payload.port !== undefined && { port: payload.port }),
      ...(payload.username !== undefined && { username: payload.username }),
      ...(payload.auth_method !== undefined && { authMethod: payload.auth_method }),
      ...(payload.private_key_path !== undefined && { privateKeyPath: payload.private_key_path }),
      ...(payload.group_id !== undefined && { groupId: payload.group_id }),
      ...(payload.tags !== undefined && { tags: payload.tags }),
      ...(payload.password !== undefined && { password: payload.password }),
      ...(payload.sudo_password !== undefined && { sudoPassword: payload.sudo_password }),
      ...(payload.default_path_ssh !== undefined && { defaultPathSsh: payload.default_path_ssh }),
      ...(payload.default_path_sftp !== undefined && { defaultPathSftp: payload.default_path_sftp }),
      ...(payload.pin_to_top !== undefined && { pinToTop: payload.pin_to_top }),
      ...(payload.keep_alive_interval !== undefined && { keepAliveInterval: payload.keep_alive_interval }),
      ...(payload.keep_alive_tries !== undefined && { keepAliveTries: payload.keep_alive_tries }),
      ...(payload.sort_order !== undefined && { sortOrder: payload.sort_order }),
      ...(payload.credential_id !== undefined && { credentialId: payload.credential_id }),
      ...(payload.jump_host_id !== undefined && { jumpHostId: payload.jump_host_id }),
      ...(payload.notes !== undefined && { notes: payload.notes }),
    });
    set((s) => ({
      hosts: s.hosts.map((h) => (h.id === host.id ? host : h)),
    }));
    return host;
  },

  deleteHost: async (id) => {
    await invoke("hosts_delete", { id });
    set((s) => {
      const ids = new Set(s.selectedHostIds);
      ids.delete(id);
      return {
        hosts: s.hosts.filter((h) => h.id !== id),
        selectedHostId: s.selectedHostId === id ? null : s.selectedHostId,
        selectedHostIds: ids,
      };
    });
  },

  deleteManyHosts: async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => invoke("hosts_delete", { id })));
    const deleted = new Set<string>();
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") deleted.add(ids[i]);
      else failed.push(ids[i]);
    });
    set((s) => ({
      hosts: s.hosts.filter((h) => !deleted.has(h.id)),
      selectedHostId: deleted.has(s.selectedHostId ?? "") ? null : s.selectedHostId,
      // Failed deletes stay selected — a still-visible host disappearing from
      // the selection would be confusing given it's still in the list.
      selectedHostIds: new Set([...get().selectedHostIds].filter((id) => !deleted.has(id))),
    }));
    if (failed.length > 0) {
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "Failed to delete some hosts",
        message:
          failed.length === 1
            ? "1 host could not be deleted."
            : `${failed.length} hosts could not be deleted.`,
        source: "Hosts",
      });
    }
  },

  duplicateHost: async (id) => {
    // Goes through a dedicated backend command (not createHost with a
    // client-built payload) specifically so a password-auth host's stored
    // password gets replicated too — `Host` (the read shape returned by
    // fetchData) never carries the plaintext password, so the frontend has
    // no way to copy it into a createHost payload; the backend replicates
    // it directly via the secrets store instead.
    const host = await invoke<Host>("hosts_duplicate", { id });
    set((s) => ({ hosts: [...s.hosts, host] }));
    return host;
  },

  reorderHosts: async (items) => {
    await invoke("hosts_reorder", { items: items.map((i) => ({ id: i.id, sortOrder: i.sort_order })) });
    set((s) => {
      const orderMap = new Map(items.map((i) => [i.id, i.sort_order]));
      const hosts = s.hosts.map((h) => (orderMap.has(h.id) ? { ...h, sort_order: orderMap.get(h.id)! } : h));
      hosts.sort((a, b) => {
        if (a.pin_to_top !== b.pin_to_top) return a.pin_to_top ? -1 : 1;
        return a.sort_order - b.sort_order;
      });
      return { hosts };
    });
  },

  togglePin: async (id) => {
    const host = get().hosts.find((h) => h.id === id);
    if (!host) return;
    await get().updateHost({ id, pin_to_top: !host.pin_to_top });
  },

  setSelectedHost: (id) => set({ selectedHostId: id, selectedHostIds: new Set(), lastSingleClickId: id }),

  selectHost: (id, mode) => {
    const { hosts, selectedHostIds, lastSingleClickId } = get();
    if (mode === "single") {
      set({
        selectedHostId: id,
        selectedHostIds: new Set(),
        lastSingleClickId: id,
      });
    } else if (mode === "toggle") {
      const next = new Set(selectedHostIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ selectedHostIds: next, selectedHostId: null });
    } else if (mode === "range") {
      const ids = hosts.map((h) => h.id);
      const from = ids.indexOf(lastSingleClickId ?? id);
      const to = ids.indexOf(id);
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      const next = new Set(ids.slice(lo, hi + 1));
      set({ selectedHostIds: next, selectedHostId: null });
    }
  },

  clearMultiSelect: () => set({ selectedHostIds: new Set() }),

  createGroup: async (name, icon, color) => {
    const group = await invoke<Group>("groups_create", { name, icon, color });
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  deleteGroup: async (id) => {
    await invoke("groups_delete", { id });
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },

  renameGroup: async (id, name) => {
    const updated = await invoke<Group>("groups_update", { id, name });
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? updated : g)) }));
  },
}));
