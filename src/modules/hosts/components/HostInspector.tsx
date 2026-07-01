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
import { useTabsStore } from "@/modules/tabs";
import { useCallback, useEffect, useState } from "react";
import type { Host } from "../types";
import { useHostsStore } from "../store/hostsStore";

interface HostInspectorProps {
  hostId: string;
  onClose: () => void;
}

export function HostInspector({ hostId, onClose }: HostInspectorProps) {
  const host = useHostsStore((s) => s.hosts.find((h) => h.id === hostId));
  const groups = useHostsStore((s) => s.groups);
  const updateHost = useHostsStore((s) => s.updateHost);
  const deleteHost = useHostsStore((s) => s.deleteHost);

  const { newSshTab, newSftpTab } = useTabsStore.getState();

  const [draft, setDraft] = useState<Partial<Host>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (host) setDraft(host);
  }, [hostId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = host ? { ...host, ...draft } : null;

  const handleBlur = useCallback(async () => {
    if (!host || !current) return;
    setSaving(true);
    try {
      await updateHost({
        id: host.id,
        name: current.name,
        host_address: current.host_address,
        port: current.port,
        username: current.username,
        auth_method: current.auth_method,
        private_key_path: current.private_key_path,
        group_id: current.group_id,
        tags: current.tags,
        password: password || undefined,
        notes: current.notes,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [host, current, password, updateHost]);

  const handleDelete = useCallback(async () => {
    await deleteHost(hostId);
    onClose();
  }, [hostId, deleteHost, onClose]);

  if (!current) return null;

  const field = (label: string, key: keyof Host, type = "text", placeholder = "") => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={(current[key] as string | number | undefined) ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={handleBlur}
        className="h-8 text-sm bg-background"
      />
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sticky top-0 bg-background z-10">
        <div className="min-w-0 flex-1">
          <input
            value={current.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            onBlur={handleBlur}
            className="w-full bg-transparent text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Host name"
          />
          {saving && <p className="text-[11px] text-muted-foreground">Saving…</p>}
          {saved && !saving && <p className="text-[11px] text-success">Saved</p>}
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

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-3 border-b border-border">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => newSshTab(host!.id, current.name)}>
          Connect SSH
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-8 text-xs"
          onClick={() => newSftpTab(host!.id, current.name)}
        >
          Open SFTP
        </Button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Address */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</p>
          {field("Host / IP Address", "host_address", "text", "192.168.1.1")}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Port</Label>
            <Input
              type="number"
              value={current.port}
              onChange={(e) =>
                setDraft((d) => {
                  const v = parseInt(e.target.value, 10);
                  return { ...d, port: Number.isNaN(v) ? d.port : v };
                })
              }
              onBlur={handleBlur}
              className="h-8 text-sm bg-background"
            />
          </div>
        </section>

        {/* General */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">General</p>
          {field("Display Name", "name", "text", "My Server")}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Group</Label>
            <select
              value={current.group_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, group_id: e.target.value || undefined }))}
              onBlur={handleBlur}
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
        </section>

        {/* SSH / Connection */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            SSH / Connection
          </p>
          {field("Username", "username", "text", "root")}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Auth Method</Label>
            <div className="flex gap-2">
              {(["password", "key"] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => {
                    setDraft((d) => ({ ...d, auth_method: method }));
                    setTimeout(handleBlur, 0);
                  }}
                  className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-all ${
                    current.auth_method === method
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {method === "password" ? "Password" : "Private Key"}
                </button>
              ))}
            </div>
          </div>
          {current.auth_method === "key" &&
            field("Private Key Path", "private_key_path", "text", "~/.ssh/id_rsa")}
        </section>

        {/* Credentials */}
        {current.auth_method === "password" && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credentials</p>
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
              <p className="text-[11px] text-muted-foreground/70">Stored securely in macOS Keychain</p>
            </div>
          </section>
        )}

        {/* Notes */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Notes / Runbook
          </p>
          <textarea
            placeholder="Configuration notes, credentials hints, runbook steps…"
            value={current.notes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            onBlur={handleBlur}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px] max-h-[300px]"
          />
        </section>

        {/* Delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="w-full h-8 text-xs mt-2">
              Delete Host
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{current.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the host and its stored credentials. This action cannot be
                undone.
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
      </div>
    </div>
  );
}
