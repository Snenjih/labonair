import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  PlusSignIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { FileChangeItem } from "./FileChangeItem";
import type { FileStatus } from "../types";

interface FileChangeListProps {
  files: FileStatus[];
  section: "staged" | "unstaged" | "untracked";
  onRefresh: () => void;
}

const SECTION_LABELS: Record<FileChangeListProps["section"], string> = {
  staged: "Staged Changes",
  unstaged: "Changes",
  untracked: "Untracked Files",
};

export function FileChangeList({ files, section, onRefresh }: FileChangeListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const selectSection = useSourceControlStore((s) => s.selectSection);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);

  const label = SECTION_LABELS[section];

  const isSectionSelected =
    selectionMode?.type === 'section' && selectionMode.section === section;

  async function handleSectionAction(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      if (section === "staged") {
        await git.unstageAll(repoRoot);
      } else {
        await git.stageAll(repoRoot);
      }
      onRefresh();
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-1">
      {/* Section header */}
      <div
        className={cn(
          "group/hdr flex h-6 cursor-pointer items-center gap-1 px-2 transition-colors",
          isSectionSelected ? "bg-accent/20" : "hover:bg-muted/20"
        )}
      >
        {/* Chevron — only collapses, stops propagation */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={9}
            strokeWidth={2.5}
            className="shrink-0 text-muted-foreground/40"
          />
        </span>

        {/* Label + count — clicking selects section */}
        <span
          className="flex flex-1 cursor-pointer items-center gap-1"
          onClick={() => {
            if (isSectionSelected) {
              clearSelectedFile();
            } else {
              selectSection(section);
            }
          }}
        >
          <span
            className={cn(
              "select-none truncate text-[10px] font-medium uppercase tracking-wider",
              isSectionSelected
                ? "text-foreground/80"
                : "text-muted-foreground/60 group-hover/hdr:text-muted-foreground"
            )}
          >
            {label}
          </span>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/40">
            {files.length}
          </span>
        </span>

        {/* Stage all / unstage all button */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-0.5 size-4 opacity-0 transition-opacity group-hover/hdr:opacity-100"
          title={section === "staged" ? "Unstage All" : "Stage All"}
          onClick={(e) => {
            e.stopPropagation();
            void handleSectionAction(e);
          }}
        >
          <HugeiconsIcon
            icon={section === "staged" ? MinusSignIcon : PlusSignIcon}
            size={9}
            strokeWidth={2}
          />
        </Button>
      </div>

      {/* File list */}
      {!collapsed && files.length > 0 && (
        <div className="px-1 pb-1">
          {files.map((file) => (
            <FileChangeItem
              key={`${file.path}:${file.indexStatus}:${file.worktreeStatus}`}
              file={file}
              section={section}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
