import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { git } from "@/modules/source-control/lib/gitInvoke";
import type { LayoutCommit } from "../types";

interface CommitDetailPanelProps {
  commit: LayoutCommit;
  onClose: () => void;
  repositoryPath: string;
  onOpenFile?: (path: string) => void;
  onViewChanges?: (hash: string) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

interface ParsedFileStat {
  file: string;
  additions: number;
  deletions: number;
}

function parseStatOutput(stat: string): ParsedFileStat[] {
  const lines = stat.split("\n");
  const result: ParsedFileStat[] = [];
  for (const line of lines) {
    // Lines like: " src/foo.ts | 3 +++"
    const match = /^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/.exec(line);
    if (match) {
      const file = match[1].trim();
      const plusMinus = match[3] ?? "";
      const additions = (plusMinus.match(/\+/g) ?? []).length;
      const deletions = (plusMinus.match(/-/g) ?? []).length;
      result.push({ file, additions, deletions });
    }
  }
  return result;
}

export function CommitDetailPanel({
  commit,
  onClose,
  repositoryPath,
  onOpenFile,
  onViewChanges,
}: CommitDetailPanelProps) {
  const [statOutput, setStatOutput] = useState<string | null>(null);
  const [loadingStat, setLoadingStat] = useState(false);

  useEffect(() => {
    setStatOutput(null);
    setLoadingStat(true);
    git
      .getCommitDetail(repositoryPath, commit.hash)
      .then((detail) => setStatOutput(detail))
      .catch(() => setStatOutput(null))
      .finally(() => setLoadingStat(false));
  }, [repositoryPath, commit.hash]);

  const fileStats = statOutput ? parseStatOutput(statOutput) : [];

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-background"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <code
              className="cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Click to copy hash"
              onClick={() => copyToClipboard(commit.hash)}
            >
              {commit.shortHash}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-4 shrink-0"
              title="Copy full hash"
              onClick={() => copyToClipboard(commit.hash)}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </Button>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {commit.authorName} · {formatDate(commit.timestamp)}
          </p>
        </div>
        {onViewChanges && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
            title="View full diff"
            onClick={() => onViewChanges(commit.hash)}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        )}
        <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 py-2">
          {/* Subject */}
          <p className="text-[12px] leading-relaxed text-foreground">{commit.subject}</p>

          {/* Refs */}
          {commit.refs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {commit.refs.map((ref) => (
                <span
                  key={ref}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${commit.color}25`,
                    color: commit.color,
                    border: `1px solid ${commit.color}50`,
                  }}
                >
                  {ref}
                </span>
              ))}
            </div>
          )}

          {/* Parents */}
          {commit.parentHashes.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Parents
              </p>
              <div className="flex flex-wrap gap-1">
                {commit.parentHashes.map((h) => (
                  <code
                    key={h}
                    className="cursor-pointer rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => copyToClipboard(h)}
                    title="Click to copy"
                  >
                    {h.slice(0, 7)}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* File changes */}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Changes
            </p>
            {loadingStat && (
              <p className="text-[11px] text-muted-foreground">Loading...</p>
            )}
            {!loadingStat && fileStats.length === 0 && statOutput !== null && (
              <p className="text-[11px] text-muted-foreground">No file changes</p>
            )}
            {!loadingStat && fileStats.length === 0 && statOutput === null && (
              <p className="text-[11px] text-muted-foreground">Could not load diff</p>
            )}
            <div className="space-y-0.5">
              {fileStats.map((fs, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <button
                    className="min-w-0 flex-1 truncate text-left text-foreground/80 cursor-pointer hover:text-foreground transition-colors"
                    title={onOpenFile ? `Open ${fs.file}` : fs.file}
                    onClick={() => onOpenFile?.(fs.file)}
                  >
                    {fs.file}
                  </button>
                  {fs.additions > 0 && (
                    <span className="shrink-0 font-mono text-[10px] text-green-400">
                      +{fs.additions}
                    </span>
                  )}
                  {fs.deletions > 0 && (
                    <span className="shrink-0 font-mono text-[10px] text-red-400">
                      -{fs.deletions}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
