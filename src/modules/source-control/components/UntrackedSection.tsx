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

interface UntrackedSectionProps {
  files: FileStatus[];
  onRefresh: () => void;
}

export function UntrackedSection({ files, onRefresh }: UntrackedSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const fileListViewMode = useSourceControlStore((s) => s.fileListViewMode);
  const sortByPath = useSourceControlStore((s) => s.sortByPath);

  if (files.length === 0) return null;

  const sortedFiles = sortFileStatuses(files, sortByPath);

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

        <Checkbox
          checked={false}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => void handleStageAll()}
          className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/hdr:opacity-100"
          title="Stage All Untracked"
        />
      </div>

      {!collapsed &&
        (fileListViewMode === "tree" ? (
          <div className="px-1 pb-0.5">
            <FileTreeList files={sortedFiles} section="untracked" onRefresh={onRefresh} />
          </div>
        ) : (
          <div className="px-1 pb-0.5">
            {sortedFiles.map((file) => (
              <FileChangeItem
                key={`untracked:${file.path}`}
                file={file}
                section="untracked"
                onRefresh={onRefresh}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
