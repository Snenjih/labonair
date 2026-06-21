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
  staged: "Staged",
  unstaged: "Changes",
  untracked: "Untracked",
};

export function FileChangeList({ files, section, onRefresh }: FileChangeListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const diffStats = useSourceControlStore((s) => s.diffStats);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const selectSection = useSourceControlStore((s) => s.selectSection);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);

  const isStaged = section === "staged";
  const sectionStats = files.reduce(
    (acc, f) => {
      const stat =
        diffStats.find((s) => s.path === f.path && s.staged === isStaged) ??
        diffStats.find((s) => s.path === f.path);
      if (stat) {
        acc.added += stat.added;
        acc.removed += stat.removed;
      }
      return acc;
    },
    { added: 0, removed: 0 },
  );

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
    <div className="mb-0.5">
      {/* Section header */}
      <div
        className={cn(
          "group/hdr flex h-6 cursor-pointer items-center gap-1.5 px-3 transition-colors",
          isSectionSelected ? "bg-accent/15" : "hover:bg-muted/15"
        )}
      >
        {/* Collapse chevron */}
        <button
          type="button"
          className="flex shrink-0 items-center"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={8}
            strokeWidth={2.5}
            className="text-muted-foreground/35 transition-colors group-hover/hdr:text-muted-foreground/60"
          />
        </button>

        {/* Label + count — clicking selects section */}
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
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
              "select-none text-[10px] font-semibold uppercase tracking-widest",
              isSectionSelected
                ? "text-foreground/75"
                : "text-muted-foreground/50 group-hover/hdr:text-muted-foreground/70"
            )}
          >
            {label}
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">
            {files.length}
          </span>
          {(sectionStats.added > 0 || sectionStats.removed > 0) && (
            <span className="flex items-center gap-1 text-[9px] tabular-nums">
              {sectionStats.added > 0 && (
                <span className="font-medium text-success">+{sectionStats.added}</span>
              )}
              {sectionStats.removed > 0 && (
                <span className="font-medium text-error">−{sectionStats.removed}</span>
              )}
            </span>
          )}
        </button>

        {/* Stage all / unstage all */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-4 shrink-0 opacity-0 transition-opacity group-hover/hdr:opacity-100"
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
        <div className="px-1 pb-0.5">
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
