import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { git } from "../lib/gitInvoke";
import { sortFileStatuses } from "../lib/fileTree";
import { useSourceControlStore } from "../store/sourceControlStore";
import type { FileStatus } from "../types";
import { FileChangeItem } from "./FileChangeItem";
import { FileTreeList } from "./FileTreeList";

interface TrackedSectionProps {
  staged: FileStatus[];
  unstaged: FileStatus[];
  onRefresh: () => void;
}

export function TrackedSection({ staged, unstaged, onRefresh }: TrackedSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const fileListViewMode = useSourceControlStore((s) => s.fileListViewMode);
  const sortByPath = useSourceControlStore((s) => s.sortByPath);

  const totalCount = staged.length + unstaged.length;
  if (totalCount === 0) return null;

  const sortedStaged = sortFileStatuses(staged, sortByPath);
  const sortedUnstaged = sortFileStatuses(unstaged, sortByPath);
  const checkedState: boolean | "indeterminate" =
    unstaged.length === 0 && staged.length > 0 ? true : staged.length === 0 ? false : "indeterminate";

  async function handleStageAll() {
    if (!repoRoot) return;
    try {
      await git.stageAll(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleUnstageAll() {
    if (!repoRoot) return;
    try {
      await git.unstageAll(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  return (
    <div className="mb-0.5">
      {/* Section header */}
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
            Tracked
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">{totalCount}</span>
        </button>

        {/* Stage all / Unstage all — tri-state: checked = all staged,
         *  indeterminate = mixed, unchecked = none staged. */}
        <Checkbox
          checked={checkedState}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) => {
            if (checked) void handleStageAll();
            else void handleUnstageAll();
          }}
          className="shrink-0 opacity-0 transition-opacity group-hover/hdr:opacity-100"
          title={checkedState === true ? "Unstage All" : "Stage All"}
        />
      </div>

      {/* Files: staged first, then unstaged */}
      {!collapsed &&
        (fileListViewMode === "tree" ? (
          <div className="px-1 pb-0.5">
            <FileTreeList files={sortedStaged} section="staged" onRefresh={onRefresh} />
            <FileTreeList files={sortedUnstaged} section="unstaged" onRefresh={onRefresh} />
          </div>
        ) : (
          <div className="px-1 pb-0.5">
            {sortedStaged.map((file) => (
              <FileChangeItem
                key={`staged:${file.path}:${file.indexStatus}`}
                file={file}
                section="staged"
                onRefresh={onRefresh}
              />
            ))}
            {sortedUnstaged.map((file) => (
              <FileChangeItem
                key={`unstaged:${file.path}:${file.worktreeStatus}`}
                file={file}
                section="unstaged"
                onRefresh={onRefresh}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
