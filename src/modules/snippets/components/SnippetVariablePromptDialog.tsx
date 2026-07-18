import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import type { SnippetVariable } from "../types";

interface Props {
  open: boolean;
  snippetName?: string;
  variables: SnippetVariable[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * Shown when a snippet's command contains `${VAR_NAME}` placeholders. Lets
 * the user fill in (or accept the default for) each variable before the
 * command is run — the values are used for this run only, not persisted
 * back to the snippet.
 */
export function SnippetVariablePromptDialog({ open, snippetName, variables, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(variables.map((v) => [v.name, v.defaultValue ?? ""])));
  }, [open, variables]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fill in variables</DialogTitle>
          <DialogDescription>
            {snippetName ? `"${snippetName}"` : "This snippet"} uses variables — fill in a value for each
            one. This is used for this run only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {variables.map((v) => (
            <div key={v.name} className="space-y-1">
              <Label htmlFor={`snippet-var-${v.name}`} className="font-mono text-[11px]">
                {v.name}
              </Label>
              <Input
                id={`snippet-var-${v.name}`}
                value={values[v.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                placeholder={v.defaultValue ?? undefined}
                className="h-8 text-[12px]"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSubmit(values)}>
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
