import { ArrowDown01Icon, ArrowRight01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
import type { FileStatus } from "../types";
import { FileChangeItem } from "./FileChangeItem";

interface UntrackedSectionProps {
  files: FileStatus[];
  onRefresh: () => void;
}

export function UntrackedSection({ files, onRefresh }: UntrackedSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);

  if (files.length === 0) return null;

  async function handleStageAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.stageAll(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mb-0.5">
      <div className="group/hdr flex h-6 items-center gap-1.5 px-3 transition-colors hover:bg-foreground/6">
        <button type="button" className="flex shrink-0 items-center" onClick={() => setCollapsed((c) => !c)}>
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={8}
            strokeWidth={2.5}
            className="text-muted-foreground/60 transition-colors group-hover/hdr:text-muted-foreground"
          />
        </button>

        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="select-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 group-hover/hdr:text-muted-foreground/70">
            Untracked
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">{files.length}</span>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-4 shrink-0 opacity-0 transition-opacity group-hover/hdr:opacity-100"
          title="Stage All Untracked"
          onClick={handleStageAll}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={9} strokeWidth={2} />
        </Button>
      </div>

      {!collapsed && (
        <div className="px-1 pb-0.5">
          {files.map((file) => (
            <FileChangeItem
              key={`untracked:${file.path}`}
              file={file}
              section="untracked"
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
