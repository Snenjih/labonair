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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Cancel01Icon,
  ComputerIcon,
  Delete02Icon,
  Logout01Icon,
  ServerStack01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useCommandSnippetsStore } from "../store/commandSnippetsStore";
import type { CommandSnippet, SnippetExecMode, SnippetTarget } from "../types";

interface Props {
  snippetId: string | null;
  onClose: () => void;
}

interface FormState {
  name: string;
  description: string;
  command: string;
  target: SnippetTarget;
  hostId: string;
  defaultExecMode: SnippetExecMode;
  workingDir: string;
  groupId: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  command: "",
  target: "local",
  hostId: "",
  defaultExecMode: "terminal",
  workingDir: "",
  groupId: "",
};

function snippetToForm(s: CommandSnippet): FormState {
  return {
    name: s.name,
    description: s.description ?? "",
    command: s.command,
    target: s.target as SnippetTarget,
    hostId: s.hostId ?? "",
    defaultExecMode: s.defaultExecMode as SnippetExecMode,
    workingDir: s.workingDir ?? "",
    groupId: s.groupId ?? "",
  };
}

const EXEC_MODES: Array<{ value: SnippetExecMode; icon: typeof Logout01Icon; label: string; description: string }> = [
  { value: "terminal", icon: Logout01Icon, label: "Terminal", description: "Opens a new terminal tab and runs the command." },
  { value: "silent", icon: SlidersHorizontalIcon, label: "Silent", description: "Runs in background, output visible in log drawer." },
  { value: "inject", icon: ComputerIcon, label: "Inject", description: "Pastes command into the active terminal without running." },
];

export function SnippetFormPanel({ snippetId, onClose }: Props) {
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const groups = useCommandSnippetsStore((s) => s.groups);
  const createSnippet = useCommandSnippetsStore((s) => s.createSnippet);
  const updateSnippet = useCommandSnippetsStore((s) => s.updateSnippet);
  const deleteSnippet = useCommandSnippetsStore((s) => s.deleteSnippet);
  const hosts = useHostsStore((s) => s.hosts);

  const isNew = snippetId === null;
  const existing = snippetId ? snippets.find((s) => s.id === snippetId) : null;

  const [form, setForm] = useState<FormState>(existing ? snippetToForm(existing) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(existing ? snippetToForm(existing) : EMPTY_FORM);
  }, [snippetId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.command.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        command: form.command,
        target: form.target,
        hostId: form.target === "ssh" && form.hostId ? form.hostId : null,
        defaultExecMode: form.defaultExecMode,
        workingDir: form.workingDir.trim() || null,
        groupId: form.groupId || null,
        tags: null,
        sortOrder: existing?.sortOrder ?? 0,
      };
      if (isNew) {
        await createSnippet(payload);
      } else {
        await updateSnippet(snippetId!, payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!snippetId) return;
    await deleteSnippet(snippetId);
    onClose();
  }

  const activeExecMode = EXEC_MODES.find((m) => m.value === form.defaultExecMode);

  return (
    <div className="flex h-full flex-col border-l border-border/60 bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">
            {isNew ? "New Snippet" : (existing?.name ?? "Edit Snippet")}
          </p>
          {isNew && <p className="text-[11px] text-muted-foreground">New snippet</p>}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* General section */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">General</p>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Deploy to production"
              className="h-8 bg-background text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description"
              className="h-8 bg-background text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Group</Label>
            <Select
              value={form.groupId || "none"}
              onValueChange={(v) => set("groupId", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8 bg-background text-sm">
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Command section */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Command</p>
          <Textarea
            value={form.command}
            onChange={(e) => set("command", e.target.value)}
            placeholder="Enter command or script..."
            className="min-h-[120px] bg-background font-mono text-xs"
            spellCheck={false}
          />
        </section>

        {/* Execution section */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Execution</p>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target</Label>
            <div className="flex gap-1.5">
              {(["local", "ssh"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("target", t)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium transition-all ${
                    form.target === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <HugeiconsIcon
                    icon={t === "local" ? ComputerIcon : ServerStack01Icon}
                    size={12}
                    strokeWidth={1.5}
                  />
                  {t === "local" ? "Local" : "SSH"}
                </button>
              ))}
            </div>
          </div>

          {form.target === "ssh" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Host</Label>
              <Select
                value={form.hostId || "ask"}
                onValueChange={(v) => set("hostId", v === "ask" ? "" : v)}
              >
                <SelectTrigger className="h-8 bg-background text-sm">
                  <SelectValue placeholder="Ask at runtime" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask">Ask at runtime</SelectItem>
                  {hosts.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.host_address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Default execution mode</Label>
            <Select
              value={form.defaultExecMode}
              onValueChange={(v) => set("defaultExecMode", v as SnippetExecMode)}
            >
              <SelectTrigger className="h-8 bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXEC_MODES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeExecMode && (
              <p className="text-[10px] text-muted-foreground">{activeExecMode.description}</p>
            )}
          </div>

          {form.target === "local" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Working Directory</Label>
              <Input
                value={form.workingDir}
                onChange={(e) => set("workingDir", e.target.value)}
                placeholder="Default: inherit from terminal"
                className="h-8 bg-background font-mono text-xs"
              />
            </div>
          )}
        </section>

        {/* Delete (edit mode) */}
        {!isNew && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full h-8 text-xs">
                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} className="mr-1.5" />
                Delete Snippet
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete snippet?</AlertDialogTitle>
                <AlertDialogDescription>
                  "{existing?.name}" will be permanently deleted.
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

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8"
          disabled={saving || !form.name.trim() || !form.command.trim()}
          onClick={handleSave}
        >
          {saving ? "Saving…" : isNew ? "Create" : "Save"}
        </Button>
      </div>
    </div>
  );
}
