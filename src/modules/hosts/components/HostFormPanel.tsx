import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostsStore } from "../store/hostsStore";
import { useCredentialsStore } from "../store/credentialsStore";
import { useCommandSnippetsStore } from "@/modules/snippets/store/commandSnippetsStore";
import type {
  CreateHostPayload,
  Host,
  TunnelConfig,
  UpdateHostPayload,
} from "../types";

interface Props {
  /** If null, panel is in "add new" mode */
  hostId: string | null;
  onClose: () => void;
  newSshTab: (hostId: string, title: string) => void;
  newSftpTab: (hostId: string, title: string) => void;
  onNavigateToCredentials?: () => void;
}

type AuthMethod = "password" | "key" | "credential" | "none";
type SaveResult = "success" | "error" | null;

/** Minimum time the saving spinner stays visible, so a fast save doesn't just flicker. */
const MIN_SAVING_DISPLAY_MS = 700;

interface FormState {
  name: string;
  host_address: string;
  port: string;
  username: string;
  auth_method: AuthMethod;
  private_key_path: string;
  credential_id: string;
  group_id: string;
  pin_to_top: boolean;
  // SSH tab
  default_path_ssh: string;
  sudo_password: string;
  keep_alive_interval: string;
  keep_alive_tries: string;
  // SFTP tab
  default_path_sftp: string;
  // Startup snippet
  startup_snippet_id: string;
  startup_snippet_mode: "execute" | "inject";
  // Jump host & notes
  jump_host_id: string;
  notes: string;
}

function hostToForm(host: Host): FormState {
  return {
    name: host.name,
    host_address: host.host_address,
    port: String(host.port),
    username: host.username,
    auth_method: host.auth_method as AuthMethod,
    private_key_path: host.private_key_path ?? "",
    credential_id: host.credential_id ?? "",
    group_id: host.group_id ?? "",
    pin_to_top: host.pin_to_top,
    default_path_ssh: host.default_path_ssh ?? "",
    sudo_password: "",
    keep_alive_interval:
      host.keep_alive_interval != null ? String(host.keep_alive_interval) : "",
    keep_alive_tries:
      host.keep_alive_tries != null ? String(host.keep_alive_tries) : "",
    default_path_sftp: host.default_path_sftp ?? "",
    startup_snippet_id: host.startup_snippet_id ?? "",
    startup_snippet_mode:
      (host.startup_snippet_mode as "execute" | "inject") ?? "execute",
    jump_host_id: host.jump_host_id ?? "",
    notes: host.notes ?? "",
  };
}

const DEFAULT_FORM: FormState = {
  name: "",
  host_address: "",
  port: "22",
  username: "",
  auth_method: "password",
  private_key_path: "",
  credential_id: "",
  group_id: "",
  pin_to_top: false,
  default_path_ssh: "",
  sudo_password: "",
  keep_alive_interval: "60",
  keep_alive_tries: "3",
  default_path_sftp: "",
  startup_snippet_id: "",
  startup_snippet_mode: "execute",
  jump_host_id: "",
  notes: "",
};

function parseTunnels(raw?: string): TunnelConfig[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TunnelConfig[];
  } catch {
    return [];
  }
}

function newTunnel(): TunnelConfig {
  return {
    id: crypto.randomUUID(),
    type: "local",
    local_port: 8080,
    remote_host: "127.0.0.1",
    remote_port: 8080,
  };
}

function buildUpdatePayload(
  host: Host,
  form: FormState,
  password: string,
  tunnels: TunnelConfig[],
): UpdateHostPayload {
  const payload: Record<string, unknown> = {
    id: host.id,
    name: form.name,
    host_address: form.host_address,
    port: parseInt(form.port, 10) || host.port,
    username: form.username,
    auth_method: form.auth_method,
    pin_to_top: form.pin_to_top,
  };
  if (form.private_key_path) payload.private_key_path = form.private_key_path;
  if (form.group_id) payload.group_id = form.group_id;
  if (password) payload.password = password;
  if (form.sudo_password) payload.sudo_password = form.sudo_password;
  if (form.default_path_ssh) payload.default_path_ssh = form.default_path_ssh;
  if (form.default_path_sftp)
    payload.default_path_sftp = form.default_path_sftp;
  if (form.keep_alive_interval)
    payload.keep_alive_interval = parseInt(form.keep_alive_interval, 10);
  if (form.keep_alive_tries)
    payload.keep_alive_tries = parseInt(form.keep_alive_tries, 10);
  payload.tunnels = JSON.stringify(tunnels);
  payload.credential_id =
    form.auth_method === "credential" ? form.credential_id : "";
  payload.startup_snippet_id = form.startup_snippet_id || "";
  payload.startup_snippet_mode = form.startup_snippet_mode;
  payload.jump_host_id = form.jump_host_id || null;
  payload.notes = form.notes || null;
  return payload as unknown as UpdateHostPayload;
}

/** Header save-status indicator: idle (muted) → saving (pulse) → success/error flash (~2.5s) → idle */
function SaveStatusIcon({
  saving,
  result,
}: {
  saving: boolean;
  result: SaveResult;
}) {
  if (saving) {
    // Same spinner as the SSH connect loading screen (SshLoadingScreen.tsx),
    // scaled down to fit the header icon slot.
    return (
      <div
        title="Saving…"
        className="flex shrink-0 items-center justify-center rounded-md p-1"
      >
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-muted border-t-primary" />
      </div>
    );
  }
  const color =
    result === "success"
      ? "text-success"
      : result === "error"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <motion.div
      key={result ?? "idle"}
      initial={result ? { scale: 1 } : false}
      animate={result ? { scale: [1, 1.3, 1] } : {}}
      transition={{ duration: 0.35 }}
      title={
        result === "error"
          ? "Save failed"
          : result === "success"
            ? "Saved"
            : undefined
      }
      className={cn("shrink-0 rounded-md p-1 transition-colors", color)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M2 7l3.5 3.5L12 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}

export function HostFormPanel({
  hostId,
  onClose,
  newSshTab,
  newSftpTab,
  onNavigateToCredentials,
}: Props) {
  const isNew = hostId === "__new__" || hostId === null;

  const host = useHostsStore((s) =>
    isNew ? null : (s.hosts.find((h) => h.id === hostId) ?? null),
  );
  const hosts = useHostsStore((s) => s.hosts);
  const groups = useHostsStore((s) => s.groups);
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const createHost = useHostsStore((s) => s.createHost);
  const updateHost = useHostsStore((s) => s.updateHost);
  const deleteHost = useHostsStore((s) => s.deleteHost);
  const duplicateHost = useHostsStore((s) => s.duplicateHost);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const credentials = useCredentialsStore((s) => s.credentials);
  const credsFetched = useCredentialsStore((s) => s.hasFetched);
  const fetchCredentials = useCredentialsStore((s) => s.fetchCredentials);
  useEffect(() => {
    if (!credsFetched) void fetchCredentials();
  }, [credsFetched, fetchCredentials]);

  const [form, setForm] = useState<FormState>(
    isNew ? DEFAULT_FORM : host ? hostToForm(host) : DEFAULT_FORM,
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tunnels, setTunnels] = useState<TunnelConfig[]>(() =>
    parseTunnels(host?.tunnels),
  );

  const isMountedRef = useRef(true);
  const skipNextSaveRef = useRef(true);
  const pendingSaveRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (saveResultTimeoutRef.current)
        clearTimeout(saveResultTimeoutRef.current);
    };
  }, []);

  // No host-sync effect here on purpose: `form`/`tunnels` are already seeded
  // correctly from `host` by the useState initializers above. HomeDashboard
  // keys the panel by hostId, so switching hosts fully remounts this
  // component rather than updating `hostId` in place — resyncing state here
  // would just re-set it to the same values, causing an extra render that
  // consumes `skipNextSaveRef` a render early and lets the debounce effect
  // below fire a real (no-op) save ~1s after opening. If the panel is ever
  // changed to update in place instead of remounting, this will need a real
  // resync effect that also re-arms `skipNextSaveRef` in the same render
  // that changes `form`/`tunnels`.

  const runSave = useCallback(async () => {
    if (isNew || !host) return;
    const startedAt = Date.now();
    setSaving(true);
    setSaveResult(null);
    if (saveResultTimeoutRef.current)
      clearTimeout(saveResultTimeoutRef.current);
    let result: SaveResult = "success";
    try {
      await updateHost(buildUpdatePayload(host, form, password, tunnels));
    } catch (e) {
      result = "error";
      handleApiError(e, "Failed to save host", "Hosts");
    }
    // Keep the spinner visible for at least MIN_SAVING_DISPLAY_MS — a save that
    // resolves in a few ms would otherwise just flicker.
    const remaining = MIN_SAVING_DISPLAY_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    if (!isMountedRef.current) return;
    setSaving(false);
    setSaveResult(result);
    saveResultTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setSaveResult(null);
    }, 2500);
  }, [isNew, host, form, password, tunnels, updateHost]);

  // Only used by the flush path (host switch / unmount / duplicate) below, which
  // fires from effect cleanups that need whatever `runSave` is current *at that
  // moment*. The normal debounced-save path doesn't need this: its timer callback
  // is created fresh whenever form/tunnels/password change, so it's never stale.
  const latestSaveRef = useRef(runSave);
  useEffect(() => {
    latestSaveRef.current = runSave;
  }, [runSave]);

  // Debounced autosave: any edit (typing, toggles, selects) reschedules a save 1s
  // in the future. Deliberately does NOT flush pending saves on cleanup — its
  // cleanup fires on every edit (to reset the timer), and flushing there would
  // save on every keystroke instead of debouncing. See the effect below for that.
  useEffect(() => {
    if (isNew || !host) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const canSaveEdit =
      form.name.trim() && form.host_address.trim() && form.username.trim();
    if (!canSaveEdit) return;
    pendingSaveRef.current = true;
    debounceTimerRef.current = setTimeout(() => {
      pendingSaveRef.current = false;
      void runSave();
    }, 1000);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [form, tunnels, password]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush a still-pending save when switching hosts or closing the panel, so the
  // last <1s of edits isn't silently dropped. Keyed only on `hostId` so it fires
  // on host-switch/unmount, not on every keystroke.
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void latestSaveRef.current();
      }
    };
  }, [hostId]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.host_address.trim() || !form.username.trim())
      return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        host_address: form.host_address.trim(),
        port: parseInt(form.port, 10) || 22,
        username: form.username.trim(),
        auth_method: form.auth_method,
        pin_to_top: form.pin_to_top,
      };
      if (form.private_key_path)
        payload.private_key_path = form.private_key_path;
      if (form.group_id) payload.group_id = form.group_id;
      if (password) payload.password = password;
      if (form.sudo_password) payload.sudo_password = form.sudo_password;
      if (form.default_path_ssh)
        payload.default_path_ssh = form.default_path_ssh;
      if (form.default_path_sftp)
        payload.default_path_sftp = form.default_path_sftp;
      if (form.keep_alive_interval)
        payload.keep_alive_interval = parseInt(form.keep_alive_interval, 10);
      if (form.keep_alive_tries)
        payload.keep_alive_tries = parseInt(form.keep_alive_tries, 10);
      if (form.auth_method === "credential" && form.credential_id)
        payload.credential_id = form.credential_id;
      if (form.startup_snippet_id) {
        payload.startup_snippet_id = form.startup_snippet_id;
        payload.startup_snippet_mode = form.startup_snippet_mode;
      }
      if (form.jump_host_id) payload.jump_host_id = form.jump_host_id;
      if (form.notes) payload.notes = form.notes;

      const newHost = await createHost(payload as unknown as CreateHostPayload);
      setSelectedHost(newHost.id);
    } catch (e) {
      setError(String(e));
      handleApiError(e, "Failed to save host", "Hosts");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!host) return;
    // Discard any pending autosave first — otherwise the flush-on-hostId-change
    // effect would try to PATCH a host that no longer exists once this resolves.
    pendingSaveRef.current = false;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await deleteHost(host.id);
    onClose();
  }, [host, deleteHost, onClose]);

  const handleDuplicate = useCallback(async () => {
    if (!host) return;
    if (pendingSaveRef.current) {
      // Flush unsaved edits first so the clone reflects the latest state, not
      // the last-persisted snapshot in the store.
      pendingSaveRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      await latestSaveRef.current();
    }
    try {
      const dup = await duplicateHost(host.id);
      setSelectedHost(dup.id);
    } catch (e) {
      handleApiError(e, "Failed to duplicate host", "Hosts");
    }
  }, [host, duplicateHost, setSelectedHost]);

  const f = (
    label: string,
    key: keyof FormState,
    type = "text",
    placeholder = "",
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={form[key] as string}
        onChange={(e) => setForm((d) => ({ ...d, [key]: e.target.value }))}
        className="h-8 text-sm bg-background"
      />
    </div>
  );

  const canSave =
    form.name.trim() && form.host_address.trim() && form.username.trim();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sticky top-0 bg-background z-10">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {isNew ? "New Host" : "Host Details"}
          </p>
          <input
            value={form.name}
            onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))}
            placeholder={isNew ? "e.g. Production Server" : "Host name"}
            className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground truncate"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isNew && host && (
            <SaveStatusIcon saving={saving} result={saveResult} />
          )}
          {!isNew && host && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="Options"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                  >
                    <circle cx="2.5" cy="7" r="1.3" />
                    <circle cx="7" cy="7" r="1.3" />
                    <circle cx="11.5" cy="7" r="1.3" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => newSshTab(host.id, form.name)}>
                  Connect SSH
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => newSftpTab(host.id, form.name)}
                >
                  Open SFTP
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleDuplicate()}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete Host…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            title="Close"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="general"
        className="flex flex-col flex-1 overflow-hidden"
      >
        <TabsList className="mx-4 mt-3 mb-0 shrink-0 grid grid-cols-4">
          <TabsTrigger value="general" className="text-xs">
            General
          </TabsTrigger>
          <TabsTrigger value="ssh" className="text-xs">
            SSH
          </TabsTrigger>
          <TabsTrigger value="sftp" className="text-xs">
            SFTP
          </TabsTrigger>
          <TabsTrigger value="tunnels" className="text-xs">
            Tunnels
          </TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent
          value="general"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0"
        >
          {/* Connection */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Connection
            </p>
            {f("Display Name", "name", "text", "My Server")}
            <div className="flex gap-2">
              <div className="flex-1">
                {f("Host / IP Address", "host_address", "text", "192.168.1.1")}
              </div>
              <div className="w-20">{f("Port", "port", "number", "22")}</div>
            </div>
          </section>

          {/* General */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              General
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group</Label>
              <select
                value={form.group_id}
                onChange={(e) =>
                  setForm((d) => ({ ...d, group_id: e.target.value }))
                }
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon ? `${g.icon} ` : ""}
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">
                  Pin to Top
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Always show this host first
                </p>
              </div>
              <button
                onClick={() =>
                  setForm((d) => ({ ...d, pin_to_top: !d.pin_to_top }))
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  form.pin_to_top ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-primary-foreground shadow transition-transform ${
                    form.pin_to_top ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Authentication */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Authentication
            </p>
            {f("Username", "username", "text", "root")}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Auth Method
              </Label>
              <div className="flex gap-1.5 flex-wrap">
                {(["password", "key", "credential", "none"] as const).map(
                  (method) => (
                    <button
                      key={method}
                      onClick={() =>
                        setForm((d) => ({ ...d, auth_method: method }))
                      }
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                        form.auth_method === method
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {method === "password"
                        ? "Password"
                        : method === "key"
                          ? "SSH Key"
                          : method === "credential"
                            ? "Credential"
                            : "None"}
                    </button>
                  ),
                )}
              </div>
              {form.auth_method === "none" && (
                <p className="text-[11px] text-muted-foreground/70">
                  You will be prompted for a password each time you connect.
                </p>
              )}
            </div>

            {form.auth_method === "key" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Private Key Path
                </Label>
                <Input
                  placeholder="~/.ssh/id_rsa"
                  value={form.private_key_path}
                  onChange={(e) =>
                    setForm((d) => ({ ...d, private_key_path: e.target.value }))
                  }
                  className="h-8 text-sm bg-background"
                />
              </div>
            )}

            {form.auth_method === "credential" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Credential
                </Label>
                <select
                  value={form.credential_id}
                  onChange={(e) =>
                    setForm((d) => ({ ...d, credential_id: e.target.value }))
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select a credential —</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cred_type === "key" ? "SSH Key" : "Password"}
                      )
                    </option>
                  ))}
                </select>
                {onNavigateToCredentials && (
                  <button
                    type="button"
                    onClick={onNavigateToCredentials}
                    className="text-xs text-primary hover:underline"
                  >
                    + Create new credential
                  </button>
                )}
                {credentials.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/70">
                    No credentials yet. Create one first.
                  </p>
                )}
              </div>
            )}

            {form.auth_method === "password" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Password
                </Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 text-sm bg-background"
                />
                <p className="text-[11px] text-muted-foreground/70">
                  Stored securely in local encrypted store
                </p>
              </div>
            )}
          </section>

          {/* Jump Host */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Jump Host (ProxyJump)
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Via Jump Host
              </Label>
              <select
                value={form.jump_host_id}
                onChange={(e) =>
                  setForm((d) => ({ ...d, jump_host_id: e.target.value }))
                }
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None (direct connection)</option>
                {hosts
                  .filter((h) => h.id !== hostId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.host_address}:{h.port})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-muted-foreground/70">
                Connect to this host through another host as a bastion/jump
                server.
              </p>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Notes / Runbook
            </p>
            <div className="space-y-1.5">
              <textarea
                placeholder="Configuration notes, credentials hints, runbook steps…"
                value={form.notes}
                onChange={(e) =>
                  setForm((d) => ({ ...d, notes: e.target.value }))
                }
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px] max-h-[300px]"
              />
            </div>
          </section>

          {/* Add button (new mode only — edit-mode actions live in the header dropdown) */}
          {isNew && (
            <div className="space-y-2">
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              <Button
                size="sm"
                className="w-full h-9"
                onClick={handleCreate}
                disabled={submitting || !canSave}
              >
                {submitting ? "Adding…" : "Add Host"}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* SSH TAB */}
        <TabsContent
          value="ssh"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0"
        >
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Connection
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Default Path
              </Label>
              <Input
                placeholder="/home/user/projects"
                value={form.default_path_ssh}
                onChange={(e) =>
                  setForm((d) => ({ ...d, default_path_ssh: e.target.value }))
                }
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Runs <span className="font-mono">cd &lt;path&gt;</span>{" "}
                automatically after connecting
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Keep-Alive Interval (s)
                </Label>
                <Input
                  type="number"
                  placeholder="60"
                  value={form.keep_alive_interval}
                  onChange={(e) =>
                    setForm((d) => ({
                      ...d,
                      keep_alive_interval: e.target.value,
                    }))
                  }
                  className="h-8 text-sm bg-background"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Max Tries
                </Label>
                <Input
                  type="number"
                  placeholder="3"
                  value={form.keep_alive_tries}
                  onChange={(e) =>
                    setForm((d) => ({ ...d, keep_alive_tries: e.target.value }))
                  }
                  className="h-8 text-sm bg-background"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sudo
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Sudo Password Autofill
              </Label>
              <Input
                type="password"
                placeholder={
                  host?.sudo_password_set
                    ? "••••••••  (set)"
                    : "Leave empty to disable"
                }
                value={form.sudo_password}
                onChange={(e) =>
                  setForm((d) => ({ ...d, sudo_password: e.target.value }))
                }
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Automatically fills sudo password prompts. Stored in macOS
                Keychain.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Startup Snippet
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Snippet</Label>
              <select
                value={form.startup_snippet_id}
                onChange={(e) =>
                  setForm((d) => ({ ...d, startup_snippet_id: e.target.value }))
                }
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None (disabled)</option>
                {snippets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground/70">
                Runs automatically when this host connects via SSH.
              </p>
            </div>
            {form.startup_snippet_id && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <div className="flex gap-1.5">
                  {(["execute", "inject"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        setForm((d) => ({ ...d, startup_snippet_mode: mode }))
                      }
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                        form.startup_snippet_mode === mode
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {mode === "execute" ? "Execute" : "Inject"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  {form.startup_snippet_mode === "execute"
                    ? "Command runs immediately on connect."
                    : "Command is typed into the terminal without running — you confirm with Enter."}
                </p>
              </div>
            )}
          </section>
        </TabsContent>

        {/* SFTP TAB */}
        <TabsContent
          value="sftp"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0"
        >
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Connection
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Default Path
              </Label>
              <Input
                placeholder="/var/www"
                value={form.default_path_sftp}
                onChange={(e) =>
                  setForm((d) => ({ ...d, default_path_sftp: e.target.value }))
                }
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Opens this directory in the SFTP file browser on connect
              </p>
            </div>
          </section>
        </TabsContent>

        {/* TUNNELS TAB */}
        <TabsContent
          value="tunnels"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 mt-0"
        >
          {tunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground/50"
              >
                <path d="M12 5v14M5 12h14M3 3l18 18" />
              </svg>
              <p className="text-xs text-muted-foreground">
                No tunnels configured
              </p>
              <p className="text-[11px] text-muted-foreground/60 max-w-[200px]">
                Local port forwarding routes traffic through this SSH connection
              </p>
              {!isNew && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs mt-1"
                  onClick={() => setTunnels((t) => [...t, newTunnel()])}
                >
                  Add Tunnel
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {tunnels.map((tunnel, i) => (
                  <div
                    key={tunnel.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="space-y-1 w-20">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Local Port
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={tunnel.local_port}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) =>
                              idx === i
                                ? {
                                    ...t,
                                    local_port:
                                      parseInt(e.target.value) || t.local_port,
                                  }
                                : t,
                            );
                            setTunnels(updated);
                          }}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <div className="pt-5 text-muted-foreground text-sm select-none">
                        →
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Remote Host
                        </Label>
                        <Input
                          type="text"
                          placeholder="127.0.0.1"
                          value={tunnel.remote_host}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) =>
                              idx === i
                                ? { ...t, remote_host: e.target.value }
                                : t,
                            );
                            setTunnels(updated);
                          }}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1 w-20">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Remote Port
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={tunnel.remote_port}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) =>
                              idx === i
                                ? {
                                    ...t,
                                    remote_port:
                                      parseInt(e.target.value) || t.remote_port,
                                  }
                                : t,
                            );
                            setTunnels(updated);
                          }}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setTunnels((t) => t.filter((_, idx) => idx !== i))
                        }
                        className="pt-5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove tunnel"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!isNew && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={() => setTunnels((t) => [...t, newTunnel()])}
                >
                  + Add Tunnel
                </Button>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation — triggered from the header dropdown, reachable from any tab */}
      {!isNew && host && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{form.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the host and its stored
                credentials. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/** Utility to fetch sudo password via Tauri for SSH session autofill */
export async function getSudoPassword(hostId: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_sudo_password", { hostId: hostId });
  } catch {
    return null;
  }
}
