import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleApiError } from "@/lib/errors";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostsStore } from "../store/hostsStore";
import { useCredentialsStore } from "../store/credentialsStore";
import { useCommandSnippetsStore } from "@/modules/snippets/store/commandSnippetsStore";
import type { CreateHostPayload, Host, TunnelConfig } from "../types";

interface Props {
  /** If null, panel is in "add new" mode */
  hostId: string | null;
  onClose: () => void;
  newSshTab: (hostId: string, title: string) => void;
  newSftpTab: (hostId: string, title: string) => void;
  onNavigateToCredentials?: () => void;
}

type AuthMethod = "password" | "key" | "credential" | "none";

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
    keep_alive_interval: host.keep_alive_interval != null ? String(host.keep_alive_interval) : "",
    keep_alive_tries: host.keep_alive_tries != null ? String(host.keep_alive_tries) : "",
    default_path_sftp: host.default_path_sftp ?? "",
    startup_snippet_id: host.startup_snippet_id ?? "",
    startup_snippet_mode: (host.startup_snippet_mode as "execute" | "inject") ?? "execute",
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
};

function parseTunnels(raw?: string): TunnelConfig[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as TunnelConfig[]; } catch { return []; }
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

export function HostFormPanel({ hostId, onClose, newSshTab, newSftpTab, onNavigateToCredentials }: Props) {
  const isNew = hostId === "__new__" || hostId === null;

  const host = useHostsStore((s) => (isNew ? null : s.hosts.find((h) => h.id === hostId) ?? null));
  const groups = useHostsStore((s) => s.groups);
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const createHost = useHostsStore((s) => s.createHost);
  const updateHost = useHostsStore((s) => s.updateHost);
  const deleteHost = useHostsStore((s) => s.deleteHost);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const credentials = useCredentialsStore((s) => s.credentials);
  const credsFetched = useCredentialsStore((s) => s.hasFetched);
  const fetchCredentials = useCredentialsStore((s) => s.fetchCredentials);
  useEffect(() => { if (!credsFetched) void fetchCredentials(); }, [credsFetched, fetchCredentials]);

  const [form, setForm] = useState<FormState>(isNew ? DEFAULT_FORM : (host ? hostToForm(host) : DEFAULT_FORM));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tunnels, setTunnels] = useState<TunnelConfig[]>(() => parseTunnels(host?.tunnels));

  useEffect(() => {
    if (!isNew && host) {
      setForm(hostToForm(host));
      setTunnels(parseTunnels(host.tunnels));
    }
  }, [hostId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = useCallback(async () => {
    if (isNew || !host) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
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
        if (form.default_path_sftp) payload.default_path_sftp = form.default_path_sftp;
        if (form.keep_alive_interval) payload.keep_alive_interval = parseInt(form.keep_alive_interval, 10);
        if (form.keep_alive_tries) payload.keep_alive_tries = parseInt(form.keep_alive_tries, 10);
        payload.tunnels = JSON.stringify(tunnels);
        payload.credential_id = form.auth_method === "credential" ? form.credential_id : "";
        payload.startup_snippet_id = form.startup_snippet_id || "";
        payload.startup_snippet_mode = form.startup_snippet_mode;
        await updateHost(payload as unknown as import("../types").UpdateHostPayload);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } finally {
        setSaving(false);
      }
    }, 300);
  }, [isNew, host, form, password, tunnels, updateHost]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.host_address.trim() || !form.username.trim()) return;
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
      if (form.private_key_path) payload.private_key_path = form.private_key_path;
      if (form.group_id) payload.group_id = form.group_id;
      if (password) payload.password = password;
      if (form.sudo_password) payload.sudo_password = form.sudo_password;
      if (form.default_path_ssh) payload.default_path_ssh = form.default_path_ssh;
      if (form.default_path_sftp) payload.default_path_sftp = form.default_path_sftp;
      if (form.keep_alive_interval) payload.keep_alive_interval = parseInt(form.keep_alive_interval, 10);
      if (form.keep_alive_tries) payload.keep_alive_tries = parseInt(form.keep_alive_tries, 10);
      if (form.auth_method === "credential" && form.credential_id) payload.credential_id = form.credential_id;
      if (form.startup_snippet_id) {
        payload.startup_snippet_id = form.startup_snippet_id;
        payload.startup_snippet_mode = form.startup_snippet_mode;
      }

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
    await deleteHost(host.id);
    onClose();
  }, [host, deleteHost, onClose]);


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
        onBlur={handleBlur}
        className="h-8 text-sm bg-background"
      />
    </div>
  );

  const canSave = form.name.trim() && form.host_address.trim() && form.username.trim();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="min-w-0 flex-1">
          <input
            value={form.name}
            onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))}
            onBlur={handleBlur}
            placeholder={isNew ? "New Host" : "Host name"}
            className="w-full bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          {saving && <p className="text-[11px] text-muted-foreground">Saving…</p>}
          {saved && !saving && <p className="text-[11px] text-success">Saved</p>}
          {isNew && <p className="text-[11px] text-muted-foreground">New host</p>}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Connect buttons (only in edit mode) */}
      {!isNew && host && (
        <div className="flex gap-2 px-4 py-3 border-b border-border">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => newSshTab(host.id, form.name)}>
            Connect SSH
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => newSftpTab(host.id, form.name)}>
            Open SFTP
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="general" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-4 mt-3 mb-0 shrink-0 grid grid-cols-4">
          <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
          <TabsTrigger value="ssh" className="text-xs">SSH</TabsTrigger>
          <TabsTrigger value="sftp" className="text-xs">SFTP</TabsTrigger>
          <TabsTrigger value="tunnels" className="text-xs">Tunnels</TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent value="general" className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0">
          {/* Connection */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</p>
            {f("Display Name", "name", "text", "My Server")}
            <div className="flex gap-2">
              <div className="flex-1">
                {f("Host / IP Address", "host_address", "text", "192.168.1.1")}
              </div>
              <div className="w-20">
                {f("Port", "port", "number", "22")}
              </div>
            </div>
          </section>

          {/* General */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">General</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group</Label>
              <select
                value={form.group_id}
                onChange={(e) => setForm((d) => ({ ...d, group_id: e.target.value }))}
                onBlur={handleBlur}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon ? `${g.icon} ` : ""}{g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Pin to Top</p>
                <p className="text-[11px] text-muted-foreground">Always show this host first</p>
              </div>
              <button
                onClick={() => { setForm((d) => ({ ...d, pin_to_top: !d.pin_to_top })); setTimeout(handleBlur, 0); }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  form.pin_to_top ? "bg-primary" : "bg-muted"
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.pin_to_top ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>
          </section>

          {/* Authentication */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Authentication</p>
            {f("Username", "username", "text", "root")}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Auth Method</Label>
              <div className="flex gap-1.5 flex-wrap">
                {(["password", "key", "credential", "none"] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => { setForm((d) => ({ ...d, auth_method: method })); setTimeout(handleBlur, 0); }}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                      form.auth_method === method
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {method === "password" ? "Password" : method === "key" ? "SSH Key" : method === "credential" ? "Credential" : "None"}
                  </button>
                ))}
              </div>
              {form.auth_method === "none" && (
                <p className="text-[11px] text-muted-foreground/70">
                  You will be prompted for a password each time you connect.
                </p>
              )}
            </div>

            {form.auth_method === "key" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Private Key Path</Label>
                <Input
                    placeholder="~/.ssh/id_rsa"
                    value={form.private_key_path}
                    onChange={(e) => setForm((d) => ({ ...d, private_key_path: e.target.value }))}
                    onBlur={handleBlur}
                    className="h-8 text-sm bg-background"
                  />
              </div>
            )}

            {form.auth_method === "credential" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Credential</Label>
                <select
                  value={form.credential_id}
                  onChange={(e) => { setForm((d) => ({ ...d, credential_id: e.target.value })); setTimeout(handleBlur, 0); }}
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select a credential —</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cred_type === "key" ? "SSH Key" : "Password"})
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
                  <p className="text-[11px] text-muted-foreground/70">No credentials yet. Create one first.</p>
                )}
              </div>
            )}

            {form.auth_method === "password" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={handleBlur}
                  className="h-8 text-sm bg-background"
                />
                <p className="text-[11px] text-muted-foreground/70">Stored securely in local encrypted store</p>
              </div>
            )}
          </section>

          {/* Add button (new mode) or Delete button (edit mode) */}
          {isNew ? (
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
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full h-8 text-xs mt-2">
                  Delete Host
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{form.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the host and its stored credentials. This action cannot be undone.
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
        </TabsContent>

        {/* SSH TAB */}
        <TabsContent value="ssh" className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0">
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Path</Label>
              <Input
                placeholder="/home/user/projects"
                value={form.default_path_ssh}
                onChange={(e) => setForm((d) => ({ ...d, default_path_ssh: e.target.value }))}
                onBlur={handleBlur}
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Runs <span className="font-mono">cd &lt;path&gt;</span> automatically after connecting
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Keep-Alive Interval (s)</Label>
                <Input
                  type="number"
                  placeholder="60"
                  value={form.keep_alive_interval}
                  onChange={(e) => setForm((d) => ({ ...d, keep_alive_interval: e.target.value }))}
                  onBlur={handleBlur}
                  className="h-8 text-sm bg-background"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Max Tries</Label>
                <Input
                  type="number"
                  placeholder="3"
                  value={form.keep_alive_tries}
                  onChange={(e) => setForm((d) => ({ ...d, keep_alive_tries: e.target.value }))}
                  onBlur={handleBlur}
                  className="h-8 text-sm bg-background"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sudo</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sudo Password Autofill</Label>
              <Input
                type="password"
                placeholder={host?.sudo_password_set ? "••••••••  (set)" : "Leave empty to disable"}
                value={form.sudo_password}
                onChange={(e) => setForm((d) => ({ ...d, sudo_password: e.target.value }))}
                onBlur={handleBlur}
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Automatically fills sudo password prompts. Stored in macOS Keychain.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Startup Snippet</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Snippet</Label>
              <select
                value={form.startup_snippet_id}
                onChange={(e) => {
                  setForm((d) => ({ ...d, startup_snippet_id: e.target.value }));
                  setTimeout(handleBlur, 0);
                }}
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
                      onClick={() => {
                        setForm((d) => ({ ...d, startup_snippet_mode: mode }));
                        setTimeout(handleBlur, 0);
                      }}
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
        <TabsContent value="sftp" className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-0">
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Path</Label>
              <Input
                placeholder="/var/www"
                value={form.default_path_sftp}
                onChange={(e) => setForm((d) => ({ ...d, default_path_sftp: e.target.value }))}
                onBlur={handleBlur}
                className="h-8 text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Opens this directory in the SFTP file browser on connect
              </p>
            </div>
          </section>
        </TabsContent>

        {/* TUNNELS TAB */}
        <TabsContent value="tunnels" className="flex-1 overflow-y-auto px-4 py-4 space-y-3 mt-0">
          {tunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
                <path d="M12 5v14M5 12h14M3 3l18 18" />
              </svg>
              <p className="text-xs text-muted-foreground">No tunnels configured</p>
              <p className="text-[11px] text-muted-foreground/60 max-w-[200px]">Local port forwarding routes traffic through this SSH connection</p>
              {!isNew && (
                <Button size="sm" variant="outline" className="h-7 text-xs mt-1" onClick={() => {
                  const updated = [...tunnels, newTunnel()];
                  setTunnels(updated);
                  setTimeout(handleBlur, 0);
                }}>
                  Add Tunnel
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {tunnels.map((tunnel, i) => (
                  <div key={tunnel.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="space-y-1 w-20">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Local Port</Label>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={tunnel.local_port}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) => idx === i ? { ...t, local_port: parseInt(e.target.value) || t.local_port } : t);
                            setTunnels(updated);
                          }}
                          onBlur={handleBlur}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <div className="pt-5 text-muted-foreground text-sm select-none">→</div>
                      <div className="space-y-1 flex-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Remote Host</Label>
                        <Input
                          type="text"
                          placeholder="127.0.0.1"
                          value={tunnel.remote_host}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) => idx === i ? { ...t, remote_host: e.target.value } : t);
                            setTunnels(updated);
                          }}
                          onBlur={handleBlur}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1 w-20">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Remote Port</Label>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={tunnel.remote_port}
                          onChange={(e) => {
                            const updated = tunnels.map((t, idx) => idx === i ? { ...t, remote_port: parseInt(e.target.value) || t.remote_port } : t);
                            setTunnels(updated);
                          }}
                          onBlur={handleBlur}
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const updated = tunnels.filter((_, idx) => idx !== i);
                          setTunnels(updated);
                          setTimeout(handleBlur, 0);
                        }}
                        className="pt-5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove tunnel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!isNew && (
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => {
                  const updated = [...tunnels, newTunnel()];
                  setTunnels(updated);
                  setTimeout(handleBlur, 0);
                }}>
                  + Add Tunnel
                </Button>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
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
