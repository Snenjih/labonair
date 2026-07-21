import { ArrowDown01Icon, ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { buildFileTree, type FileTreeNode } from "../lib/fileTree";
import type { FileStatus } from "../types";
import { FileChangeItem } from "./FileChangeItem";

interface FileTreeListProps {
  files: FileStatus[];
  section: "staged" | "unstaged" | "untracked";
  onRefresh: () => void;
}

interface FileTreeFolderRowProps {
  name: string;
  depth: number;
  children: React.ReactNode;
}

function FileTreeFolderRow({ name, depth, children }: FileTreeFolderRowProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="group/folder flex h-6 w-full items-center gap-1 rounded text-left transition-colors hover:bg-foreground/6"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <HugeiconsIcon
          icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
          size={8}
          strokeWidth={2.5}
          className="shrink-0 text-muted-foreground/50"
        />
        <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={1.75} className="shrink-0 text-info/70" />
        <span className="truncate text-[11px] text-foreground/70">{name}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function FileTreeNodes({
  nodes,
  depth,
  section,
  onRefresh,
}: {
  nodes: FileTreeNode[];
  depth: number;
  section: FileTreeListProps["section"];
  onRefresh: () => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <FileTreeFolderRow key={node.key} name={node.name} depth={depth}>
            <FileTreeNodes nodes={node.children} depth={depth + 1} section={section} onRefresh={onRefresh} />
          </FileTreeFolderRow>
        ) : (
          <div key={node.key} style={{ paddingLeft: depth * 14 }}>
            <FileChangeItem file={node.file} section={section} onRefresh={onRefresh} />
          </div>
        ),
      )}
    </>
  );
}

/** Folder-grouped alternative to a flat file list — same `FileChangeItem`
 *  rows, just nested under collapsible directory headers. Toggled per
 *  section via the "Tree View" option in the top action bar. */
export function FileTreeList({ files, section, onRefresh }: FileTreeListProps) {
  const tree = buildFileTree(files);
  return (
    <div>
      <FileTreeNodes nodes={tree} depth={0} section={section} onRefresh={onRefresh} />
    </div>
  );
}
