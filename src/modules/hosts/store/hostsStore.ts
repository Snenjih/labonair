import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { CreateHostPayload, Group, Host, ReorderItem, UpdateHostPayload } from "../types";

interface HostsState {
  hosts: Host[];
  groups: Group[];
  selectedHostId: string | null;
  selectedHostIds: Set<string>;
  lastSingleClickId: string | null;
  isLoading: boolean;
  hasFetched: boolean;

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
}

export const useHostsStore = create<HostsState>((set, get) => ({
  hosts: [],
  groups: [],
  selectedHostId: null,
  selectedHostIds: new Set(),
  lastSingleClickId: null,
  isLoading: true,
  hasFetched: false,

  fetchData: async () => {
    set({ isLoading: true });
    try {
      const [hosts, groups] = await Promise.all([
        invoke<Host[]>("hosts_get_all"),
        invoke<Group[]>("groups_get_all"),
      ]);
      set({ hosts, groups, isLoading: false, hasFetched: true });
    } catch {
      set({ isLoading: false, hasFetched: true });
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
    await Promise.all(ids.map((id) => invoke("hosts_delete", { id })));
    set((s) => ({
      hosts: s.hosts.filter((h) => !ids.includes(h.id)),
      selectedHostId: ids.includes(s.selectedHostId ?? "") ? null : s.selectedHostId,
      selectedHostIds: new Set(),
    }));
  },

  duplicateHost: async (id) => {
    const src = get().hosts.find((h) => h.id === id);
    if (!src) throw new Error("host not found");
    const payload: CreateHostPayload = {
      name: `Copy of ${src.name}`,
      host_address: src.host_address,
      port: src.port,
      username: src.username,
      auth_method: src.auth_method,
      private_key_path: src.private_key_path,
      group_id: src.group_id,
      tags: src.tags,
      default_path_ssh: src.default_path_ssh,
      default_path_sftp: src.default_path_sftp,
      pin_to_top: false,
      keep_alive_interval: src.keep_alive_interval,
      keep_alive_tries: src.keep_alive_tries,
    };
    return get().createHost(payload);
  },

  reorderHosts: async (items) => {
    await invoke("hosts_reorder", { items: items.map((i) => ({ id: i.id, sortOrder: i.sort_order })) });
    set((s) => {
      const orderMap = new Map(items.map((i) => [i.id, i.sort_order]));
      const hosts = s.hosts.map((h) =>
        orderMap.has(h.id) ? { ...h, sort_order: orderMap.get(h.id)! } : h
      );
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
      if (next.has(id)) next.delete(id); else next.add(id);
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
}));
