import { Command as CommandPrimitive } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import {
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
import { Badge } from "@/components/ui/badge";
import { useCommandStore } from "./useCommandStore";
import { useCommandRegistry } from "./useCommandRegistry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { CommandAction, CommandContext, RegistryCallbacks } from "./types";

type Props = {
  callbacks: RegistryCallbacks;
  activeTabKind: string | undefined;
  activeContext: CommandContext | null;
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

export function CommandPalette({
  callbacks,
  activeTabKind,
  activeContext,
  restoreFocus,
}: Props) {
  const isOpen = useCommandStore((s) => s.isOpen);
  const close = useCommandStore((s) => s.close);
  const recentIds = useCommandStore((s) => s.recentIds);
  const pushRecent = useCommandStore((s) => s.pushRecent);
  const blurAmount = usePreferencesStore((s) => s.commandPaletteBlur);

  const [pages, setPages] = useState<string[]>(["root"]);
  const [search, setSearch] = useState("");
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  const activePage = pages[pages.length - 1];

  const registry = useCommandRegistry(callbacks, activeTabKind, activeContext);
  const currentPage = registry[activePage];

  const navigateTo = useCallback((pageId: string) => {
    setSlideDir("forward");
    setPages((prev) => [...prev, pageId]);
    setSearch("");
  }, []);

  const goBack = useCallback(() => {
    if (pages.length <= 1) return;
    setSlideDir("back");
    setPages((prev) => prev.slice(0, -1));
    setSearch("");
  }, [pages.length]);

  const handleClose = useCallback(() => {
    close();
    setPages(["root"]);
    setSearch("");
  }, [close]);

  useEffect(() => {
    if (!prevOpenRef.current && isOpen) {
      setPages(["root"]);
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

  const breadcrumbLabel = useMemo(() => {
    if (pages.length <= 1) return null;
    return activePage.charAt(0).toUpperCase() + activePage.slice(1);
  }, [pages.length, activePage]);

  const groupedActions = useMemo(
    () => groupBySection(currentPage?.actions ?? []),
    [currentPage],
  );

  const recentActions = useMemo(() => {
    if (search || activePage !== "root") return [];
    const allRootActions = registry["root"]?.actions ?? [];
    return recentIds
      .map((id) => allRootActions.find((a) => a.id === id))
      .filter((a): a is CommandAction => !!a);
  }, [search, activePage, registry, recentIds]);

  if (!currentPage) return null;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          style={{ backdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined }}
        />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          aria-describedby={undefined}
          className="fixed left-1/2 top-[15%] z-[101] w-full max-w-[640px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>

          <CommandPrimitive
            shouldFilter={true}
            filter={(value: string, search: string) => {
              if (!search) return 1;
              const lower = search.toLowerCase();
              return value.toLowerCase().includes(lower) ? 1 : 0;
            }}
            className="flex flex-col"
          >
            {/* Header with search input */}
            <div className="flex h-14 items-center gap-3 border-b border-border/40 px-4">
              {breadcrumbLabel ? (
                <button
                  onClick={goBack}
                  className="flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  <Badge variant="secondary" className="text-[11px]">
                    {breadcrumbLabel}
                  </Badge>
                </button>
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
                transition={{ duration: 0.13, ease: "easeOut" }}
              >
                <CommandPrimitive.List className="no-scrollbar max-h-96 overflow-y-auto overflow-x-hidden scroll-py-1 p-2 outline-none">
                  <CommandPrimitive.Empty className="py-10 text-center text-[13px] text-muted-foreground">
                    No results found.
                  </CommandPrimitive.Empty>

                  {recentActions.length > 0 && (
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

            {/* Footer hints */}
            <div className="flex items-center justify-end gap-3 border-t border-border/30 px-4 py-2">
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
        "group relative flex h-10 cursor-default select-none items-center gap-3 rounded-lg px-3 mx-0.5 my-0.5",
        "text-foreground/80 outline-none transition-colors",
        "data-[selected=true]:bg-accent/50 data-[selected=true]:text-foreground",
      )}
    >
      {action.icon && (
        <span className="shrink-0 text-muted-foreground transition-colors group-data-[selected=true]:text-foreground">
          {action.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {action.title}
      </span>
      {action.subtitle && (
        <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
          {action.subtitle}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {action.rightLabel && (
          <span
            className={cn(
              "text-[10px] font-bold uppercase",
              action.rightLabel === "ON" || action.rightLabel === "active"
                ? "text-emerald-500"
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
