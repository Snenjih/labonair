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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

export function SnippetFormPanel({ snippetId, onClose }: Props) {
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const groups = useCommandSnippetsStore((s) => s.groups);
  const createSnippet = useCommandSnippetsStore((s) => s.createSnippet);
  const updateSnippet = useCommandSnippetsStore((s) => s.updateSnippet);
  const deleteSnippet = useCommandSnippetsStore((s) => s.deleteSnippet);
  const hosts = useHostsStore((s) => s.hosts);

  const isNew = snippetId === null;
  const existing = snippetId ? snippets.find((s) => s.id === snippetId) : null;

  const [form, setForm] = useState<FormState>(
    existing ? snippetToForm(existing) : EMPTY_FORM
  );
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

  return (
    <div className="flex h-full flex-col border-l border-border/60 bg-card">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <span className="text-sm font-semibold">
          {isNew ? "New Snippet" : "Edit Snippet"}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 w-auto justify-start">
          <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
          <TabsTrigger value="execution" className="text-xs">Execution</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* General Tab */}
          <TabsContent value="general" className="m-0 space-y-3 px-3 py-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Deploy to production"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional description"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Command *</Label>
              <Textarea
                value={form.command}
                onChange={(e) => set("command", e.target.value)}
                placeholder="Enter command or script..."
                className="min-h-[120px] font-mono text-xs"
                spellCheck={false}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Group</Label>
              <Select
                value={form.groupId || "none"}
                onValueChange={(v) => set("groupId", v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-8 text-sm">
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
          </TabsContent>

          {/* Execution Tab */}
          <TabsContent value="execution" className="m-0 space-y-4 px-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target</Label>
              <ToggleGroup
                type="single"
                value={form.target}
                onValueChange={(v) => v && set("target", v as SnippetTarget)}
                className="justify-start"
              >
                <ToggleGroupItem value="local" className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={ComputerIcon} size={12} strokeWidth={1.5} />
                  Local
                </ToggleGroupItem>
                <ToggleGroupItem value="ssh" className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={ServerStack01Icon} size={12} strokeWidth={1.5} />
                  SSH
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {form.target === "ssh" && (
              <div className="space-y-1">
                <Label className="text-xs">Host</Label>
                <Select
                  value={form.hostId || "ask"}
                  onValueChange={(v) => set("hostId", v === "ask" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
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
              <Label className="text-xs">Default execution mode</Label>
              <ToggleGroup
                type="single"
                value={form.defaultExecMode}
                onValueChange={(v) => v && set("defaultExecMode", v as SnippetExecMode)}
                className="justify-start"
              >
                <ToggleGroupItem value="terminal" className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={Logout01Icon} size={12} strokeWidth={1.5} />
                  Terminal
                </ToggleGroupItem>
                <ToggleGroupItem value="silent" className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={SlidersHorizontalIcon} size={12} strokeWidth={1.5} />
                  Silent
                </ToggleGroupItem>
                <ToggleGroupItem value="inject" className="gap-1.5 text-xs">
                  <HugeiconsIcon icon={ComputerIcon} size={12} strokeWidth={1.5} />
                  Inject
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-[10px] text-muted-foreground">
                {form.defaultExecMode === "terminal" && "Opens a new terminal tab and runs the command."}
                {form.defaultExecMode === "silent" && "Runs in background, output visible in log drawer."}
                {form.defaultExecMode === "inject" && "Pastes command into the active terminal without running."}
              </p>
            </div>

            {form.target === "local" && (
              <div className="space-y-1">
                <Label className="text-xs">Working Directory</Label>
                <Input
                  value={form.workingDir}
                  onChange={(e) => set("workingDir", e.target.value)}
                  placeholder="Default: inherit from terminal"
                  className="h-8 font-mono text-xs"
                />
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        {!isNew ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive">
                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} className="mr-1" />
                Delete
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
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7"
            disabled={saving || !form.name.trim() || !form.command.trim()}
            onClick={handleSave}
          >
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
