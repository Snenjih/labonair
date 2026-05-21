import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  Credential,
  CreateCredentialPayload,
  GenerateKeypairResult,
  HostRef,
  UpdateCredentialPayload,
} from "../types";

interface CredentialsState {
  credentials: Credential[];
  selectedCredentialId: string | null;
  isLoading: boolean;
  hasFetched: boolean;

  fetchCredentials: () => Promise<void>;
  createCredential: (payload: CreateCredentialPayload) => Promise<Credential>;
  updateCredential: (payload: UpdateCredentialPayload) => Promise<Credential>;
  deleteCredential: (id: string) => Promise<void>;
  duplicateCredential: (id: string) => Promise<Credential>;
  generateKeypair: (credId: string, keyType: string, passphrase?: string) => Promise<GenerateKeypairResult>;
  getHostsUsing: (id: string) => Promise<HostRef[]>;
  setSelectedCredential: (id: string | null) => void;
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  credentials: [],
  selectedCredentialId: null,
  isLoading: false,
  hasFetched: false,

  fetchCredentials: async () => {
    set({ isLoading: true });
    try {
      const credentials = await invoke<Credential[]>("credentials_get_all");
      set({ credentials, hasFetched: true });
    } finally {
      set({ isLoading: false });
    }
  },

  createCredential: async (payload) => {
    const cred = await invoke<Credential>("credentials_create", {
      name: payload.name,
      credType: payload.credType,
      keyPath: payload.keyPath,
      keyType: payload.keyType,
      publicKey: payload.publicKey,
      secret: payload.secret,
    });
    set((s) => ({ credentials: [...s.credentials, cred].sort((a, b) => a.name.localeCompare(b.name)) }));
    return cred;
  },

  updateCredential: async (payload) => {
    const cred = await invoke<Credential>("credentials_update", {
      id: payload.id,
      name: payload.name,
      credType: payload.credType,
      keyPath: payload.keyPath,
      keyType: payload.keyType,
      publicKey: payload.publicKey,
      secret: payload.secret,
    });
    set((s) => ({
      credentials: s.credentials
        .map((c) => (c.id === cred.id ? cred : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return cred;
  },

  deleteCredential: async (id) => {
    await invoke("credentials_delete", { id });
    set((s) => ({ credentials: s.credentials.filter((c) => c.id !== id) }));
  },

  duplicateCredential: async (id) => {
    const src = get().credentials.find((c) => c.id === id);
    if (!src) throw new Error("Credential not found");
    return get().createCredential({
      name: `Copy of ${src.name}`,
      credType: src.cred_type,
      keyPath: src.key_path,
      keyType: src.key_type,
      publicKey: src.public_key,
      secret: undefined,
    });
  },

  generateKeypair: async (credId, keyType, passphrase) => {
    const result = await invoke<GenerateKeypairResult>("credential_generate_keypair", {
      credId,
      keyType,
      passphrase,
    });
    // Refresh this credential in the store
    await get().fetchCredentials();
    return result;
  },

  getHostsUsing: async (id) => {
    return invoke<HostRef[]>("credentials_get_hosts_using", { id });
  },

  setSelectedCredential: (id) => set({ selectedCredentialId: id }),
}));
