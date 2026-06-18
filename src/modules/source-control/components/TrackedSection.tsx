import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown01Icon, ArrowRight01Icon, MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { FileChangeItem } from "./FileChangeItem";
import type { FileStatus } from "../types";

interface TrackedSectionProps {
  staged: FileStatus[];
  unstaged: FileStatus[];
  onRefresh: () => void;
}

export function TrackedSection({ staged, unstaged, onRefresh }: TrackedSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);

  const totalCount = staged.length + unstaged.length;
  if (totalCount === 0) return null;

  async function handleStageAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.stageAll(repoRoot);
      onRefresh();
    } catch { /* ignore */ }
  }

  async function handleUnstageAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.unstageAll(repoRoot);
      onRefresh();
    } catch { /* ignore */ }
  }

  return (
    <div className="mb-0.5">
      {/* Section header */}
      <div className="group/hdr flex h-6 items-center gap-1.5 px-3 transition-colors hover:bg-muted/15">
        <button
          type="button"
          className="flex shrink-0 items-center"
          onClick={() => setCollapsed((c) => !c)}
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={8}
            strokeWidth={2.5}
            className="text-muted-foreground/35 transition-colors group-hover/hdr:text-muted-foreground/60"
          />
        </button>

        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="select-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 group-hover/hdr:text-muted-foreground/70">
            Tracked
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">
            {totalCount}
          </span>
        </button>

        {/* Stage all / Unstage all */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
          {staged.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-4 shrink-0"
              title="Unstage All"
              onClick={handleUnstageAll}
            >
              <HugeiconsIcon icon={MinusSignIcon} size={9} strokeWidth={2} />
            </Button>
          )}
          {unstaged.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-4 shrink-0"
              title="Stage All"
              onClick={handleStageAll}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={9} strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>

      {/* Files: staged first, then unstaged */}
      {!collapsed && (
        <div className="px-1 pb-0.5">
          {staged.map((file) => (
            <FileChangeItem
              key={`staged:${file.path}:${file.indexStatus}`}
              file={file}
              section="staged"
              onRefresh={onRefresh}
            />
          ))}
          {unstaged.map((file) => (
            <FileChangeItem
              key={`unstaged:${file.path}:${file.worktreeStatus}`}
              file={file}
              section="unstaged"
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
