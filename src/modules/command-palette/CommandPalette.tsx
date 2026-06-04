import { Command as CommandPrimitive } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { useCommandStore } from "./useCommandStore";
import { useCommandRegistry } from "./useCommandRegistry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setCommandPaletteSearchMode } from "@/modules/settings/store";
import type { CommandAction, CommandContext, CommandPage, RegistryCallbacks } from "./types";

type Props = {
  callbacks: RegistryCallbacks;
  activeTabKind: string | undefined;
  activeContext: CommandContext | null;
  activeTabId: number;
  restoreFocus: () => void;
};

function groupBySection(actions: CommandAction[]): [string, CommandAction[]][] {
  const map = new Map<string, CommandAction[]>();
  for (const action of actions) {
    const group = map.get(action.section) ?? [];
    group.push(action);
    map.set(action.section, group);
  }
  return [...map.entries()];
}

function pageLabel(pageId: string, registry: Record<string, CommandPage>): string {
  if (pageId === "root") return "Commands";
  const page = registry[pageId];
  if (!page) return pageId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return page.searchPlaceholder
    .replace(/^search\s+/i, "")
    .replace(/\.\.\.$/i, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CommandPalette({
  callbacks,
  activeTabKind,
  activeContext,
  activeTabId,
  restoreFocus,
}: Props) {
  const isOpen = useCommandStore((s) => s.isOpen);
  const close = useCommandStore((s) => s.close);
  const initialPage = useCommandStore((s) => s.initialPage);
  const recentIds = useCommandStore((s) => s.recentIds);
  const pushRecent = useCommandStore((s) => s.pushRecent);
  const blurAmount = usePreferencesStore((s) => s.commandPaletteBlur);
  const opacity = usePreferencesStore((s) => s.commandPaletteOpacity);
  const position = usePreferencesStore((s) => s.commandPalettePosition);
  const animation = usePreferencesStore((s) => s.commandPaletteAnimation);
  const showRecent = usePreferencesStore((s) => s.commandPaletteShowRecent);
  const searchMode = usePreferencesStore((s) => s.commandPaletteSearchMode);
  const closeOnOverlay = usePreferencesStore((s) => s.commandPaletteCloseOnOverlayClick);

  const [pages, setPages] = useState<string[]>(["root"]);
  const [search, setSearch] = useState("");
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");
  const [highlightedValue, setHighlightedValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  const activePage = pages[pages.length - 1];

  const registry = useCommandRegistry(callbacks, activeTabKind, activeContext, activeTabId);
  const currentPage = registry[activePage];

  const navigateTo = useCallback((pageId: string) => {
    setSlideDir("forward");
    setPages((prev) => [...prev, pageId]);
    setSearch("");
    setHighlightedValue("");
  }, []);

  const goBack = useCallback(() => {
    if (pages.length <= 1) return;
    currentPage?.onLeave?.();
    setSlideDir("back");
    setPages((prev) => prev.slice(0, -1));
    setSearch("");
    setHighlightedValue("");
  }, [pages.length, currentPage]);

  const goBackToIndex = useCallback((index: number) => {
    currentPage?.onLeave?.();
    setSlideDir("back");
    setPages((prev) => prev.slice(0, index + 1));
    setSearch("");
    setHighlightedValue("");
  }, [currentPage]);

  const handleClose = useCallback(() => {
    currentPage?.onLeave?.();
    close();
    setPages(["root"]);
    setSearch("");
    setHighlightedValue("");
  }, [close, currentPage]);

  useEffect(() => {
    if (!prevOpenRef.current && isOpen) {
      setPages([initialPage || "root"]);
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (prevOpenRef.current && !isOpen) {
      restoreFocus();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, restoreFocus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (search.length > 0) {
          setSearch("");
        } else if (pages.length > 1) {
          goBack();
        } else {
          handleClose();
        }
        return;
      }
      if (e.key === "Backspace" && search.length === 0 && pages.length > 1) {
        e.preventDefault();
        goBack();
      }
    },
    [search, pages.length, goBack, handleClose],
  );

  const executeAction = useCallback(
    (action: CommandAction) => {
      if (action.subPageId) {
        navigateTo(action.subPageId);
        return;
      }
      if (action.perform) {
        pushRecent(action.id);
        handleClose();
        requestAnimationFrame(() => {
          action.perform!();
        });
      }
    },
    [navigateTo, handleClose, pushRecent],
  );

  const groupedActions = useMemo(
    () => groupBySection(currentPage?.actions ?? []),
    [currentPage],
  );

  const actionByValue = useMemo(() => {
    const map = new Map<string, CommandAction>();
    for (const action of currentPage?.actions ?? []) {
      map.set(`${action.title} ${action.subtitle ?? ""} ${action.section}`.trim(), action);
    }
    return map;
  }, [currentPage]);

  const handleValueChange = useCallback((value: string) => {
    setHighlightedValue(value);
    const action = actionByValue.get(value);
    action?.onPreview?.();
  }, [actionByValue]);

  const recentActions = useMemo(() => {
    if (search || activePage !== "root") return [];
    const allRootActions = registry["root"]?.actions ?? [];
    return recentIds
      .map((id) => allRootActions.find((a) => a.id === id))
      .filter((a): a is CommandAction => !!a);
  }, [search, activePage, registry, recentIds]);

  const visibleCount = useMemo(() => {
    const actions = currentPage?.actions ?? [];
    if (!search) return actions.length;
    return actions.filter((action) => {
      const value = `${action.title} ${action.subtitle ?? ""} ${action.section}`.toLowerCase();
      const s = search.toLowerCase();
      if (searchMode === "startsWith") return value.startsWith(s);
      if (searchMode === "fuzzy") {
        let i = 0;
        for (const ch of value) {
          if (ch === s[i]) i++;
          if (i === s.length) return true;
        }
        return false;
      }
      return value.includes(s);
    }).length;
  }, [search, currentPage, searchMode]);

  const cycleSearchMode = useCallback(() => {
    const modes = ["contains", "startsWith", "fuzzy"] as const;
    const idx = modes.indexOf(searchMode as typeof modes[number]);
    void setCommandPaletteSearchMode(modes[(idx + 1) % modes.length]);
  }, [searchMode]);

  const animDuration =
    animation === "none" ? "0ms" :
    animation === "fast" ? "70ms" :
    animation === "slow" ? "220ms" :
    "130ms";

  const motionDuration =
    animation === "none" ? 0 :
    animation === "fast" ? 0.07 :
    animation === "slow" ? 0.22 :
    0.13;

  const positionStyle: React.CSSProperties = {
    top: position === "high" ? "8%" : position === "center" ? "50%" : "15%",
    transform: position === "center" ? "translateX(-50%) translateY(-50%)" : "translateX(-50%)",
  };

  const contentBg = `color-mix(in oklch, var(--color-card) ${opacity}%, transparent)`;

  if (!currentPage) return null;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(v) => !v && closeOnOverlay && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          style={{
            backdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
            animationDuration: animDuration,
          }}
          onClick={closeOnOverlay ? undefined : (e) => e.stopPropagation()}
        />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          aria-describedby={undefined}
          className="fixed left-1/2 z-[101] w-full max-w-[640px] overflow-hidden rounded-2xl border border-border/60 shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          style={{
            ...positionStyle,
            backgroundColor: contentBg,
            animationDuration: animDuration,
          }}
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>

          <CommandPrimitive
            shouldFilter={true}
            value={highlightedValue}
            onValueChange={handleValueChange}
            filter={(value: string, search: string) => {
              if (!search) return 1;
              const v = value.toLowerCase();
              const s = search.toLowerCase();
              if (searchMode === "startsWith") return v.startsWith(s) ? 1 : 0;
              if (searchMode === "fuzzy") {
                let i = 0;
                for (const ch of v) {
                  if (ch === s[i]) i++;
                  if (i === s.length) return 1;
                }
                return 0;
              }
              return v.includes(s) ? 1 : 0;
            }}
            className="flex flex-col"
          >
            {/* Header with search input */}
            <div className="flex h-14 items-center gap-3 border-b border-border/40 px-4">
              {pages.length > 1 ? (
                <div className="flex shrink-0 items-center gap-1 overflow-hidden">
                  {pages.map((pageId, index) => {
                    const label = pageLabel(pageId, registry);
                    const isCurrent = index === pages.length - 1;
                    return (
                      <Fragment key={pageId}>
                        {index > 0 && (
                          <span className="shrink-0 text-[10px] text-muted-foreground/40">›</span>
                        )}
                        {isCurrent ? (
                          <span className="max-w-[120px] truncate rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-foreground">
                            {label}
                          </span>
                        ) : (
                          <button
                            onClick={() => goBackToIndex(index)}
                            className="max-w-[120px] truncate rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                          >
                            {label}
                          </button>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                value={search}
                onValueChange={setSearch}
                placeholder={currentPage.searchPlaceholder ?? "Search commands..."}
                className="h-auto flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Animated list area */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                initial={{ x: slideDir === "forward" ? 20 : -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: slideDir === "forward" ? -20 : 20, opacity: 0 }}
                transition={{ duration: motionDuration, ease: "easeOut" }}
                style={{ willChange: "transform, opacity" }}
              >
                <CommandPrimitive.List className="no-scrollbar max-h-96 overflow-y-auto overflow-x-hidden scroll-py-1 p-2 outline-none">
                  <CommandPrimitive.Empty className="py-10 text-center text-[13px] text-muted-foreground">
                    No results found.
                  </CommandPrimitive.Empty>

                  {showRecent && recentActions.length > 0 && (
                    <CommandPrimitive.Group
                      heading="Recently Used"
                      className="overflow-hidden **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/70"
                    >
                      {recentActions.map((action) => (
                        <PaletteItem
                          key={`recent-${action.id}`}
                          action={action}
                          onExecute={executeAction}
                        />
                      ))}
                    </CommandPrimitive.Group>
                  )}

                  {groupedActions.map(([section, sectionActions]) => (
                    <CommandPrimitive.Group
                      key={section}
                      heading={section}
                      className="overflow-hidden **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/70"
                    >
                      {sectionActions.map((action) => (
                        <PaletteItem
                          key={action.id}
                          action={action}
                          onExecute={executeAction}
                        />
                      ))}
                    </CommandPrimitive.Group>
                  ))}
                </CommandPrimitive.List>
              </motion.div>
            </AnimatePresence>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-border/30 px-4 py-2">
              <button
                onClick={cycleSearchMode}
                title="Click to cycle search mode"
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/50 ring-1 ring-border/40 transition-colors hover:text-muted-foreground hover:ring-border/70"
              >
                {searchMode}
              </button>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[11px] text-muted-foreground/50">
                {visibleCount} {visibleCount === 1 ? "result" : "results"}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Kbd>↑↓</Kbd> navigate
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Kbd>↵</Kbd> select
                </span>
                {pages.length > 1 && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                    <Kbd>⌫</Kbd> back
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Kbd>Esc</Kbd> close
                </span>
              </div>
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type PaletteItemProps = {
  action: CommandAction;
  onExecute: (action: CommandAction) => void;
};

function PaletteItem({ action, onExecute }: PaletteItemProps) {
  const value = `${action.title} ${action.subtitle ?? ""} ${action.section}`.trim();

  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={() => onExecute(action)}
      className={cn(
        "group relative flex min-h-10 cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 mx-0.5 my-0.5",
        "border-l-2 border-transparent text-foreground/80 outline-none transition-colors",
        "data-[selected=true]:border-primary data-[selected=true]:bg-accent/60 data-[selected=true]:pl-[10px] data-[selected=true]:text-foreground",
      )}
    >
      {action.icon && (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/30 text-muted-foreground transition-colors group-data-[selected=true]:bg-accent/50 group-data-[selected=true]:text-foreground">
          {action.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">
          {action.title}
        </span>
        {action.subtitle && (
          <span className="block truncate text-[11px] leading-tight text-muted-foreground mt-0.5">
            {action.subtitle}
          </span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {action.rightLabel && (
          <span
            className={cn(
              "text-[10px] font-bold uppercase",
              action.rightLabel === "ON" || action.rightLabel === "active"
                ? "text-success"
                : "text-muted-foreground",
            )}
          >
            {action.rightLabel}
          </span>
        )}
        {action.shortcut && (
          <span className="flex items-center gap-1">
            {action.shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        )}
        {action.subPageId && (
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-3 rotate-180 text-muted-foreground"
          />
        )}
      </div>
    </CommandPrimitive.Item>
  );
}
