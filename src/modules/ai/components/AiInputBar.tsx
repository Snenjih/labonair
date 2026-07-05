import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { IS_MAC } from "@/lib/platform";
import { useLocalExplorerStore } from "@/modules/explorer/lib/useLocalExplorerStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useSourceControlStore } from "@/modules/source-control/store/sourceControlStore";
import {
  selectActivePaneId,
  selectActiveTab,
  useTabsStore,
  type TerminalSessionData,
  type WorkspaceTab,
} from "@/modules/tabs";
import { ShellComposerInput } from "@/modules/terminal/block";
import {
  ArrowUpIcon,
  Cancel01Icon,
  CodeIcon,
  ComputerTerminal02Icon,
  Folder01Icon,
  GitBranchIcon,
  HashtagIcon,
  Key01Icon,
  SparklesIcon,
  StopCircleIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useComposer, type FileAttachment } from "../lib/composer";
import { SLASH_COMMANDS } from "../lib/slashCommands";
import type { Directive } from "../lib/directives";
import { useDirectivesStore } from "../store/directivesStore";
import { AgentSwitcher } from "./AgentSwitcher";
import { DirectivePickerContent, type PickerItem } from "./DirectivePicker";
import { FilePickerContent, type FileSearchHit } from "./FilePicker";

type DirectiveTrigger = {
  start: number;
  end: number;
  query: string;
};

function detectDirectiveTrigger(value: string, caret: number): DirectiveTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "#") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      if (!/^[a-z0-9-]*$/i.test(slice)) return null;
      return { start: i, end: caret, query: slice.toLowerCase() };
    }
    if (/\s/.test(ch)) return null;
    if (!/[a-z0-9-]/i.test(ch)) return null;
  }
  return null;
}

type FileTrigger = { start: number; end: number; query: string };

function detectFileTrigger(value: string, caret: number): FileTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      if (/\s/.test(slice)) return null;
      return { start: i, end: caret, query: slice };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

export function AiInputBar() {
  const c = useComposer();
  const directives = useDirectivesStore((s) => s.directives);
  const explorerRoot = useLocalExplorerStore((s) => s.rootPath);

  // ── AI / Command mode switch ──────────────────────────────────────────────
  // Command mode is a per-terminal-session concern (draft, mode selection),
  // not a per-tab one — a split-pane workspace tab has one session per pane,
  // and each keeps its own state independently. See ShellComposerInput for
  // the draft side of this; `modeBySession` here only remembers which mode
  // was last showing for a given session.
  const terminalComposerEnabled = usePreferencesStore((s) => s.terminalComposerEnabled);
  const activeTab = useTabsStore(selectActiveTab);
  const activePaneId = useTabsStore(selectActivePaneId);
  const currentBranch = useSourceControlStore((s) => s.currentBranch);
  const activeWorkspaceTab = activeTab?.kind === "workspace" ? (activeTab as WorkspaceTab) : null;
  const activeSession = activeWorkspaceTab && activePaneId ? activeWorkspaceTab.sessions[activePaneId] : null;
  const canUseCommandMode = terminalComposerEnabled && !!activeSession;

  const modeBySessionRef = useRef(new Map<string, "ai" | "command">());
  const [mode, setModeState] = useState<"ai" | "command">("ai");

  useEffect(() => {
    if (!canUseCommandMode || !activePaneId) {
      setModeState("ai");
      return;
    }
    setModeState(modeBySessionRef.current.get(activePaneId) ?? "command");
  }, [activePaneId, canUseCommandMode]);

  const setMode = (m: "ai" | "command") => {
    setModeState(m);
    if (activePaneId) modeBySessionRef.current.set(activePaneId, m);
  };

  const modeSwitch = canUseCommandMode ? (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
      <button
        type="button"
        onClick={() => setMode("ai")}
        title="AI chat"
        aria-label="AI chat"
        className={cn(
          "flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
          mode === "ai"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <HugeiconsIcon icon={SparklesIcon} size={12} strokeWidth={1.75} />
        AI
      </button>
      <button
        type="button"
        onClick={() => setMode("command")}
        title="Run command"
        aria-label="Run command"
        className={cn(
          "flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
          mode === "command"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <HugeiconsIcon icon={TerminalIcon} size={12} strokeWidth={1.75} />
        Shell
      </button>
    </div>
  ) : null;

  const [trigger, setTrigger] = useState<DirectiveTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [fileTrigger, setFileTrigger] = useState<FileTrigger | null>(null);
  const [fileHits, setFileHits] = useState<FileSearchHit[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileActiveIndex, setFileActiveIndex] = useState(0);
  const fileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: c.value triggers autoresize on content change
  useEffect(() => {
    autoresize(c.textareaRef.current);
  }, [c.value, c.textareaRef]);

  const updateTrigger = () => {
    const el = c.textareaRef.current;
    if (!el) {
      setTrigger(null);
      setFileTrigger(null);
      return;
    }
    const caret = el.selectionStart ?? 0;
    const newDirective = detectDirectiveTrigger(c.value, caret);
    const newFile = newDirective ? null : detectFileTrigger(c.value, caret);
    setTrigger(newDirective);
    setFileTrigger((prev) => {
      if (prev?.query !== newFile?.query) setFileActiveIndex(0);
      return newFile;
    });
  };

  useEffect(() => {
    if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
    if (!fileTrigger?.query) {
      setFileHits([]);
      setFileLoading(false);
      return;
    }
    const root = explorerRoot;
    if (!root) {
      setFileHits([]);
      setFileLoading(false);
      return;
    }
    setFileLoading(true);
    fileDebounceRef.current = setTimeout(async () => {
      try {
        const hits = await invoke<FileSearchHit[]>("fs_search", {
          root,
          query: fileTrigger.query,
          limit: 20,
          showHidden: false,
        });
        setFileHits(hits);
      } catch {
        setFileHits([]);
      } finally {
        setFileLoading(false);
      }
    }, 120);
    return () => {
      if (fileDebounceRef.current) clearTimeout(fileDebounceRef.current);
    };
  }, [fileTrigger?.query, explorerRoot]);

  useEffect(updateTrigger, [c.value, c.textareaRef]);

  const filteredItems = useMemo<PickerItem[]>(() => {
    if (!trigger) return [];
    const q = trigger.query;
    const cmdItems: PickerItem[] = Object.values(SLASH_COMMANDS)
      .filter((c) => !q || c.name.includes(q) || c.label.toLowerCase().includes(q))
      .map((command) => ({ kind: "command", command }));
    const dirItems: PickerItem[] = directives
      .filter(
        (d) =>
          !q ||
          d.handle.includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      )
      .map((directive) => ({ kind: "directive", directive }));
    return [...cmdItems, ...dirItems];
  }, [trigger, directives]);

  useEffect(() => {
    if (activeIndex >= filteredItems.length) setActiveIndex(0);
  }, [filteredItems.length, activeIndex]);

  const pickerOpen = trigger !== null || fileTrigger !== null;

  const onPickFile = (hit: FileSearchHit) => {
    if (!fileTrigger) return;
    const before = c.value.slice(0, fileTrigger.start);
    const after = c.value.slice(fileTrigger.end);

    if (hit.is_dir) {
      const newQuery = `${hit.rel}/`;
      c.setValue(`${before}@${newQuery}${after}`);
      requestAnimationFrame(() => {
        const el = c.textareaRef.current;
        if (!el) return;
        const pos = before.length + 1 + newQuery.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return;
    }

    c.setValue(`${before}${after.replace(/^\s*/, " ").trimEnd() || ""}`);
    setFileTrigger(null);
    setFileActiveIndex(0);
    c.addFileRef(hit.path);
    requestAnimationFrame(() => {
      const el = c.textareaRef.current;
      if (!el) return;
      el.setSelectionRange(before.length, before.length);
    });
  };

  const onPickItem = (item: PickerItem) => {
    if (!trigger) return;
    const before = c.value.slice(0, trigger.start);
    const afterRaw = c.value.slice(trigger.end);
    let insert = "";
    if (item.kind === "directive") {
      const needsSpace = afterRaw.length === 0 || !/^\s/.test(afterRaw);
      insert = `#${item.directive.handle}${needsSpace ? " " : ""}`;
      c.addDirective(item.directive);
    } else {
      c.addCommand(item.command);
    }
    const after = item.kind === "command" ? afterRaw.replace(/^\s+/, "") : afterRaw;
    c.setValue(`${before}${insert}${after}`);
    setTrigger(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = c.textareaRef.current;
      if (!el) return;
      const caret = before.length + insert.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const pickActive = () => {
    const it = filteredItems[activeIndex];
    if (it) onPickItem(it);
  };

  const voiceLabel = c.voice.recording ? "Listening…" : c.voice.transcribing ? "Transcribing…" : null;

  const showCommandMode = mode === "command" && activeSession && activePaneId;

  return (
    <div className="shrink-0 border-t border-border/60 bg-card/40 px-3 py-2">
      <div className="flex flex-col gap-1.5 rounded-lg px-1 py-1">
        {/* Shown identically in both modes — only the row below it changes. */}
        {activeSession && <ContextPillsRow session={activeSession} branch={currentBranch} />}

        {showCommandMode ? (
          <div className="flex items-start gap-2">
            <ShellComposerInput sessionId={activePaneId} cwd={activeSession.cwd ?? null} />
            {modeSwitch}
          </div>
        ) : (
          <>
            <ChipsRow
              files={c.files}
              onRemoveFile={c.removeFile}
              directives={c.pickedDirectives}
              onRemoveDirective={(id) => {
                const dir = c.pickedDirectives.find((d) => d.id === id);
                c.removeDirective(id);
                if (!dir) return;
                const re = new RegExp(`(^|\\s)#${dir.handle}\\b ?`);
                c.setValue((v) => v.replace(re, (_m, lead: string) => lead));
              }}
              commands={c.pickedCommands}
              onRemoveCommand={(name) => c.removeCommand(name)}
            />

            <Popover open={pickerOpen}>
              <PopoverAnchor asChild>
                <div className="flex items-start gap-2">
                  <textarea
                    ref={c.textareaRef}
                    value={c.value}
                    onChange={(e) => c.setValue(e.target.value)}
                    onKeyUp={updateTrigger}
                    onClick={updateTrigger}
                    onSelect={updateTrigger}
                    onKeyDown={(e) => {
                      if (fileTrigger !== null) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setFileActiveIndex((i) => Math.min(i + 1, Math.max(0, fileHits.length - 1)));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setFileActiveIndex((i) => Math.max(0, i - 1));
                          return;
                        }
                        if (e.key === "Tab" || e.key === "Enter") {
                          const hit = fileHits[fileActiveIndex];
                          if (hit) {
                            e.preventDefault();
                            onPickFile(hit);
                            return;
                          }
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setFileTrigger(null);
                          return;
                        }
                      } else if (trigger !== null) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveIndex((i) => Math.min(i + 1, Math.max(0, filteredItems.length - 1)));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveIndex((i) => Math.max(0, i - 1));
                          return;
                        }
                        if (e.key === "Tab" || e.key === "Enter") {
                          if (filteredItems.length > 0) {
                            e.preventDefault();
                            pickActive();
                            return;
                          }
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setTrigger(null);
                          return;
                        }
                      }
                      if (e.key === "Enter") {
                        const isModEnter = e.metaKey || e.ctrlKey;
                        if (c.isBusy) {
                          e.preventDefault();
                          if (isModEnter && !pickerOpen) c.enqueue();
                          return;
                        }
                        if (!e.shiftKey) {
                          e.preventDefault();
                          c.submit();
                        }
                      }
                    }}
                    placeholder="Ask Labonair anything   ·   @ files   ·   # directives"
                    rows={1}
                    className={cn(
                      "max-h-40 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none",
                      "placeholder:text-muted-foreground/60",
                    )}
                  />
                  {modeSwitch}
                  <AgentSwitcher />
                  {c.isBusy ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={c.stop}
                      className="size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                      title="Stop"
                    >
                      <HugeiconsIcon icon={StopCircleIcon} size={13} strokeWidth={1.75} />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      onClick={c.submit}
                      disabled={!c.canSend}
                      className="size-7 shrink-0 rounded-md"
                      title="Send (Enter)"
                    >
                      <HugeiconsIcon icon={ArrowUpIcon} size={13} strokeWidth={1.75} />
                    </Button>
                  )}
                </div>
              </PopoverAnchor>
              {fileTrigger !== null ? (
                <FilePickerContent
                  hits={fileHits}
                  loading={fileLoading}
                  query={fileTrigger.query}
                  activeIndex={fileActiveIndex}
                  onPick={onPickFile}
                  onHover={setFileActiveIndex}
                />
              ) : (
                <DirectivePickerContent
                  items={filteredItems}
                  activeIndex={activeIndex}
                  onPick={onPickItem}
                  onHover={setActiveIndex}
                />
              )}
            </Popover>

            <AnimatePresence initial={false}>
              {voiceLabel && (
                <motion.div
                  key={voiceLabel}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.08 }}
                  className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"
                >
                  {c.voice.recording ? (
                    <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                  ) : (
                    <Spinner className="size-3" />
                  )}
                  <span className="truncate">{voiceLabel}</span>
                </motion.div>
              )}
              {c.isBusy && (
                <motion.div
                  key="queue-hint"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.08 }}
                  className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground/60"
                >
                  <span>{IS_MAC ? "⌘↵" : "Ctrl+↵"} to queue a follow-up</span>
                  {c.queuedCount > 0 && (
                    <span className="rounded bg-muted px-1 font-mono text-[10px]">
                      {c.queuedCount} queued
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

function shortCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length === 0) return "~";
  return `~/${parts.slice(-2).join("/")}`;
}

const contextPillClass =
  "flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground";

/** Small read-only context strip shown above the composer — cwd / git branch
 *  / connection kind. Shown identically in AI and Command mode (only the row
 *  below it changes). Same bordered-pill treatment as the tab bar's tab
 *  chips and ChipsRow's attachment chips, for a consistent chip language
 *  across the app. Reuses the same data StatusBar's CwdBreadcrumb/
 *  GitBranchIcon pills already surface elsewhere, just condensed for the
 *  composer's cramped footprint. */
function ContextPillsRow({ session, branch }: { session: TerminalSessionData; branch: string }) {
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const localShellLabel = terminalShell.split("/").filter(Boolean).pop() || "shell";
  return (
    <div className="flex flex-wrap items-center gap-1 px-1">
      <span className={contextPillClass}>
        <HugeiconsIcon
          icon={session.kind === "ssh" ? ComputerTerminal02Icon : TerminalIcon}
          size={11}
          strokeWidth={1.75}
        />
        {session.kind === "ssh" ? session.title : localShellLabel}
      </span>
      {session.cwd && (
        <span className={cn(contextPillClass, "max-w-48 truncate")}>
          <HugeiconsIcon icon={Folder01Icon} size={11} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{shortCwd(session.cwd)}</span>
        </span>
      )}
      {branch && (
        <span className={cn(contextPillClass, "shrink-0")}>
          <HugeiconsIcon icon={GitBranchIcon} size={11} strokeWidth={1.75} />
          {branch}
        </span>
      )}
    </div>
  );
}

function ChipsRow({
  files,
  onRemoveFile,
  directives,
  onRemoveDirective,
  commands,
  onRemoveCommand,
}: {
  files: FileAttachment[];
  onRemoveFile: (id: string) => void;
  directives: Directive[];
  onRemoveDirective: (id: string) => void;
  commands: { name: string; label: string; icon: typeof HashtagIcon }[];
  onRemoveCommand: (name: string) => void;
}) {
  if (files.length === 0 && directives.length === 0 && commands.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <AnimatePresence initial={false}>
        {commands.map((cmd) => (
          <motion.div
            key={`cmd-${cmd.name}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="group flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[11px]"
            title={cmd.label}
          >
            <HugeiconsIcon icon={cmd.icon} size={11} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="font-medium">#{cmd.name}</span>
            <button
              type="button"
              onClick={() => onRemoveCommand(cmd.name)}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove command"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          </motion.div>
        ))}
        {directives.map((d) => (
          <motion.div
            key={`dir-${d.id}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="group flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground dark:text-primary"
            title={d.description || d.name}
          >
            <HugeiconsIcon icon={HashtagIcon} size={11} strokeWidth={2} className="opacity-80" />
            <span className="font-medium">{d.handle}</span>
            <button
              type="button"
              onClick={() => onRemoveDirective(d.id)}
              className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove directive"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          </motion.div>
        ))}
        {files.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="group flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[11px]"
            title={f.kind === "ref" ? f.path : undefined}
          >
            {f.kind === "image" && f.url ? (
              <img src={f.url} alt="" className="size-4 rounded object-cover" />
            ) : f.kind === "selection" ? (
              <HugeiconsIcon
                icon={f.source === "editor" ? CodeIcon : TerminalIcon}
                size={11}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
            ) : f.kind === "ref" ? (
              <span className="font-mono text-[10px] text-muted-foreground">@</span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">{extOf(f.name)}</span>
            )}
            <span className="max-w-35 truncate">
              {f.name}
              {f.kind === "selection" && f.text ? (
                <span className="ml-1 text-muted-foreground">· {selLineCount(f.text)}L</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onRemoveFile(f.id)}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function selLineCount(text: string): number {
  if (!text) return 0;
  const trimmed = text.replace(/\n+$/, "");
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "FILE" : name.slice(i + 1).toUpperCase();
}

function autoresize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

export type AiInputBarProps = { tabId: number };

export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="shrink-0 border-t border-border/60 bg-card/40 px-3 py-2">
      <div className="flex h-10 items-center justify-between gap-3 rounded-lg px-3 text-xs">
        <span className="text-muted-foreground">
          Connect any AI provider (or use local models) - your key stays in your OS keychain.
        </span>
        <div className="flex items-center gap-2">
          <Button size="xs" onClick={onAdd}>
            <HugeiconsIcon icon={Key01Icon} />
            Add API key
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
