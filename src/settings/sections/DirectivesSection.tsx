import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  isValidHandle,
  normalizeHandle,
  type Directive,
} from "@/modules/ai/lib/directives";
import {
  newDirectiveId,
  useDirectivesStore,
} from "@/modules/ai/store/directivesStore";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

export function DirectivesSection() {
  const directives = useDirectivesStore((s) => s.directives);
  const upsertDirective = useDirectivesStore((s) => s.upsert);
  const removeDirective = useDirectivesStore((s) => s.remove);
  const hydrateDirectives = useDirectivesStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateDirectives();
  }, [hydrateDirectives]);

  const [editingDirective, setEditingDirective] = useState<Directive | null>(null);

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Directives"
        description="Reusable instructions you can drop into any prompt with #handle syntax."
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <Label>Directives</Label>
            <span className="text-[10.5px] text-muted-foreground">
              Reusable instructions you can drop into any prompt with{" "}
              <code className="rounded bg-muted/50 px-1 font-mono">#handle</code>.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() =>
              setEditingDirective({
                id: newDirectiveId(),
                handle: "",
                name: "",
                description: "",
                content: "",
              })
            }
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
            New directive
          </Button>
        </div>

        {directives.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-center text-[11px] text-muted-foreground">
            No directives yet. Create one and insert it with{" "}
            <code className="font-mono">#handle</code> in the AI input.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {directives.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2"
              >
                <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  #{d.handle}
                </code>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] font-medium">{d.name}</span>
                  {d.description ? (
                    <span className="truncate text-[10.5px] text-muted-foreground">
                      {d.description}
                    </span>
                  ) : null}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => setEditingDirective(d)}
                  title="Edit"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.75} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeDirective(d.id)}
                  title="Delete"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DirectiveEditorDialog
        directive={editingDirective}
        existing={directives}
        onClose={() => setEditingDirective(null)}
        onSave={(d) => {
          upsertDirective(d);
          setEditingDirective(null);
        }}
      />
    </div>
  );
}

function DirectiveEditorDialog({
  directive,
  existing,
  onClose,
  onSave,
}: {
  directive: Directive | null;
  existing: Directive[];
  onClose: () => void;
  onSave: (d: Directive) => void;
}) {
  const [draft, setDraft] = useState<Directive | null>(directive);
  useEffect(() => setDraft(directive), [directive]);
  if (!draft) return null;

  const handleErr = !draft.handle
    ? "Required."
    : !isValidHandle(draft.handle)
      ? "Lowercase letters, digits, and dashes only."
      : existing.some((d) => d.id !== draft.id && d.handle === draft.handle)
        ? "Already in use."
        : null;
  const canSave =
    !handleErr &&
    draft.name.trim().length > 0 &&
    draft.content.trim().length > 0;

  return (
    <Dialog open={!!directive} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {existing.some((d) => d.id === draft.id) ? "Edit directive" : "New directive"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex w-32 flex-col gap-1">
              <Label>Handle</Label>
              <div className="relative">
                <span className="absolute top-1/2 left-2 -translate-y-1/2 font-mono text-[11.5px] text-muted-foreground">
                  #
                </span>
                <Input
                  value={draft.handle}
                  onChange={(e) =>
                    setDraft({ ...draft, handle: normalizeHandle(e.target.value) })
                  }
                  placeholder="review"
                  className="h-8 pl-5 font-mono text-[11.5px]"
                />
              </div>
              {handleErr ? (
                <span className="text-[10px] text-destructive">{handleErr}</span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Pre-merge review checklist"
                className="h-8 text-[12px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="One line — shown in the # picker"
              className="h-8 text-[12px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Content</Label>
            <Textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Inserted into the prompt as a <directive> block when you use #handle."
              className="min-h-40 resize-y font-mono text-[11.5px] leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => onSave(draft)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
