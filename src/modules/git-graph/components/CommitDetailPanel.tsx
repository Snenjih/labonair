import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { fileIconUrl, folderIconUrl } from "@/modules/explorer/lib/iconResolver";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { getAvatarUrl, getCached, setCached } from "../lib/avatarCache";
import { getAvatarColor } from "../lib/laneColors";
import type { LayoutCommit } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDetailDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseGithubEmail(email: string): { userId: string; username: string } | null {
  const m = /^(\d+)\+(.+)@users\.noreply\.github\.com$/.exec(email);
  return m ? { userId: m[1], username: m[2] } : null;
}

function buildGithubCommitUrl(remoteUrl: string, hash: string): string | null {
  const m =
    /git@github\.com:(.+?)(?:\.git)?$/.exec(remoteUrl) ||
    /https?:\/\/(?:[^@]+@)?github\.com\/(.+?)(?:\.git)?$/.exec(remoteUrl);
  return m ? `https://github.com/${m[1]}/commit/${hash}` : null;
}

// ─── Numstat parsing ─────────────────────────────────────────────────────────

interface FileStat {
  path: string;
  added: number;
  removed: number;
}

function parseNumstat(raw: string): FileStat[] {
  const result: FileStat[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;
    const added = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
    const removed = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;
    const path = parts.slice(2).join("\t");
    if (path) result.push({ path, added, removed });
  }
  return result;
}

// ─── File tree ───────────────────────────────────────────────────────────────

interface FileNode {
  kind: "file";
  name: string;
  added: number;
  removed: number;
}

interface DirNode {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}

type TreeNode = FileNode | DirNode;

function insertPath(
  children: TreeNode[],
  parts: string[],
  pathSoFar: string,
  added: number,
  removed: number,
) {
  if (parts.length === 1) {
    children.push({ kind: "file", name: parts[0], added, removed });
    return;
  }
  const dirName = parts[0];
  const dirPath = pathSoFar ? `${pathSoFar}/${dirName}` : dirName;
  let dir = children.find((n) => n.kind === "dir" && n.name === dirName) as DirNode | undefined;
  if (!dir) {
    dir = { kind: "dir", name: dirName, path: dirPath, children: [] };
    children.push(dir);
  }
  insertPath(dir.children, parts.slice(1), dirPath, added, removed);
}

function buildTree(files: FileStat[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const f of files) {
    insertPath(root, f.path.split("/"), "", f.added, f.removed);
  }
  return root;
}

// ─── Tree renderer ───────────────────────────────────────────────────────────

function TreeNodeRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}) {
  if (node.kind === "file") {
    return (
      <div className="flex items-center gap-1.5 py-[3px] pr-3" style={{ paddingLeft: depth * 12 + 8 }}>
        <img src={fileIconUrl(node.name)} className="size-[14px] shrink-0" alt="" decoding="sync" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/75">{node.name}</span>
        <div className="flex shrink-0 items-center gap-1 font-mono text-[9.5px]">
          {node.added > 0 && <span className="text-success">+{node.added}</span>}
          {node.removed > 0 && <span className="text-error">-{node.removed}</span>}
        </div>
      </div>
    );
  }

  const isCollapsed = collapsed.has(node.path);
  const isRoot = depth === 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => !isRoot && onToggle(node.path)}
        className={cn(
          "flex w-full items-center gap-1.5 py-[3px] pr-3 text-left transition-colors",
          isRoot ? "cursor-default" : "cursor-pointer hover:bg-accent/20",
        )}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <img
          src={folderIconUrl(node.name, !isCollapsed)}
          className="size-[14px] shrink-0"
          alt=""
          decoding="sync"
        />
        <span className={cn("text-[11px]", isRoot ? "font-medium text-foreground/60" : "text-foreground/75")}>
          {node.name}
        </span>
        {!isRoot && (
          <svg
            className={cn(
              "ml-auto shrink-0 text-muted-foreground/40 transition-transform",
              isCollapsed && "-rotate-90",
            )}
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {!isCollapsed && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.kind === "dir" ? child.path : `${node.path}/f${i}`}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Small inline components ─────────────────────────────────────────────────

function InitialsAvatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <div
      className="flex size-full items-center justify-center text-[20px] font-bold text-background"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {initials}
    </div>
  );
}

function MetaRow({
  icon,
  children,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-2 text-left",
        onClick && "cursor-pointer hover:text-foreground transition-colors",
      )}
    >
      <span className="shrink-0 text-muted-foreground/50">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{children}</span>
    </Tag>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CommitDetailPanelProps {
  commit: LayoutCommit;
  onClose: () => void;
  repositoryPath: string;
  sessionId?: string;
  onViewChanges?: (hash: string) => void;
}

export function CommitDetailPanel({
  commit,
  onClose,
  repositoryPath,
  sessionId,
  onViewChanges,
}: CommitDetailPanelProps) {
  const [numstatRaw, setNumstatRaw] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const githubInfo = parseGithubEmail(commit.authorEmail);
  const userId = githubInfo?.userId ?? null;

  // Initialize avatar status from shared cache to avoid re-fetching across panel opens
  const [avatarStatus, setAvatarStatus] = useState<"pending" | "ok" | "error">(() => {
    if (!userId) return "error";
    const cached = getCached(userId);
    if (cached === true) return "ok";
    if (cached === false) return "error";
    return "pending";
  });

  // Reset avatar status when the commit (and thus potentially the author) changes
  useEffect(() => {
    if (!userId) {
      setAvatarStatus("error");
      return;
    }
    const cached = getCached(userId);
    setAvatarStatus(cached === true ? "ok" : cached === false ? "error" : "pending");
  }, [userId]);

  useEffect(() => {
    setNumstatRaw(null);
    void git
      .getCommitNumstat(repositoryPath, commit.hash, sessionId)
      .then(setNumstatRaw)
      .catch(() => setNumstatRaw(""));
    void git
      .getRemoteUrl(repositoryPath, undefined, sessionId)
      .then(setRemoteUrl)
      .catch(() => setRemoteUrl(null));
  }, [repositoryPath, commit.hash, sessionId]);

  const githubCommitUrl = remoteUrl ? buildGithubCommitUrl(remoteUrl, commit.hash) : null;

  const fileStats = numstatRaw ? parseNumstat(numstatRaw) : [];
  const tree = buildTree(fileStats);
  const totalAdded = fileStats.reduce((s, f) => s + f.added, 0);
  const totalRemoved = fileStats.reduce((s, f) => s + f.removed, 0);

  function toggleDir(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-background"
    >
      {/* ── Author header ─────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 flex-col items-center px-4 pb-4 pt-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Avatar */}
        <div className="size-[60px] overflow-hidden rounded-full ring-2 ring-border/60">
          {userId && avatarStatus !== "error" ? (
            <img
              src={getAvatarUrl(userId, 80)}
              alt={commit.authorName}
              className="size-full object-cover"
              onLoad={() => {
                setCached(userId, true);
                setAvatarStatus("ok");
              }}
              onError={() => {
                setCached(userId, false);
                setAvatarStatus("error");
              }}
            />
          ) : (
            <InitialsAvatar name={commit.authorName} />
          )}
        </div>

        <p className="mt-2.5 text-[14px] font-semibold text-foreground">{commit.authorName}</p>
        <p className="text-[12px] text-muted-foreground">{formatDetailDate(commit.timestamp)}</p>
      </div>

      {/* ── Meta rows ─────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-1.5 px-4 pb-4">
        <MetaRow icon={<MailIcon />}>{commit.authorEmail}</MetaRow>
        <MetaRow
          icon={<HashIcon />}
          onClick={() => void navigator.clipboard.writeText(commit.hash)}
          title="Click to copy full hash"
        >
          <code className="font-mono">{commit.hash}</code>
        </MetaRow>
        {githubCommitUrl && (
          <MetaRow icon={<GithubIcon />} onClick={() => void openUrl(githubCommitUrl)}>
            View on GitHub
          </MetaRow>
        )}
      </div>

      <Separator />

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <ScrollArea className="min-h-0 flex-1">
        {/* Commit message */}
        <p className="px-4 py-3 text-[13px] font-medium leading-snug text-foreground">{commit.subject}</p>

        <Separator />

        {/* Files header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[12px] text-foreground/70">{commit.filesChanged} Changed Files</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
            {totalAdded > 0 && <span className="text-success">+{totalAdded}</span>}
            {totalRemoved > 0 && <span className="text-error">−{totalRemoved}</span>}
          </div>
        </div>

        {/* File tree */}
        <div className="pb-4">
          {numstatRaw === null && <p className="px-4 text-[11px] text-muted-foreground">Loading...</p>}
          {tree.map((node, i) => (
            <TreeNodeRow
              key={node.kind === "dir" ? node.path : `root-file-${i}`}
              node={node}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleDir}
            />
          ))}
        </div>
      </ScrollArea>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      {onViewChanges && (
        <div className="shrink-0 border-t border-border p-3">
          <Button variant="ghost" className="w-full text-[12px]" onClick={() => onViewChanges(commit.hash)}>
            View Commit
          </Button>
        </div>
      )}
    </motion.div>
  );
}
