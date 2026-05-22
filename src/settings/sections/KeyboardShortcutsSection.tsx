import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { findConflict } from "@/modules/shortcuts/lib/conflictDetector";
import {
  buildDisplayKeysFromBinding,
  eventToBinding,
  getLiveModifierDisplay,
} from "@/modules/shortcuts/lib/captureKeyBinding";
import { useKeybindsStore } from "@/modules/shortcuts/lib/useKeybindsStore";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type Shortcut,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import type { KeyBinding, KeyBindingOrDisabled } from "@/modules/shortcuts/types";
import {
  AlertCircleIcon,
  Cancel01Icon,
  Edit02Icon,
  RotateClockwiseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

type RowState =
  | { kind: "idle" }
  | { kind: "capturing"; liveModifiers: string[] }
  | { kind: "conflict"; captured: KeyBinding; conflictId: ShortcutId; conflictLabel: string };

// ─── Main Section ─────────────────────────────────────────────────────────────

export function KeyboardShortcutsSection() {
  const [search, setSearch] = useState("");
  const overrides = useKeybindsStore((s) => s.overrides);
  const resetAll = useKeybindsStore((s) => s.resetAll);

  const hasOverrides = Object.keys(overrides).length > 0;
  const trimmed = search.trim().toLowerCase();

  const filtered = trimmed
    ? SHORTCUTS.filter((s) => s.label.toLowerCase().includes(trimmed))
    : null;

  const isEmpty = filtered !== null && filtered.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Keyboard Shortcuts"
        description="Customize the keyboard shortcuts for Nexum. Click a shortcut to record a new binding."
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Input
          type="search"
          placeholder="Filter shortcuts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 flex-1 text-[11.5px]"
        />
        {hasOverrides && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
            onClick={() => void resetAll()}
          >
            <HugeiconsIcon icon={RotateClockwiseIcon} size={12} strokeWidth={2} />
            Reset all
          </Button>
        )}
      </div>

      {/* Empty search state */}
      {isEmpty && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-[12px] text-muted-foreground">
            No shortcuts matching &ldquo;{trimmed}&rdquo;
          </p>
        </div>
      )}

      {/* Groups */}
      {!isEmpty && (
        <div className="flex flex-col gap-5">
          {SHORTCUT_GROUPS.map((group) => {
            const items = (filtered ?? SHORTCUTS).filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </h3>
                <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/50 bg-card/30">
                  {items.map((s) => (
                    <ShortcutRow key={s.id} shortcut={s} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ShortcutRow ──────────────────────────────────────────────────────────────

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  const [rowState, setRowState] = useState<RowState>({ kind: "idle" });
  const [isHovered, setIsHovered] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overrides = useKeybindsStore((s) => s.overrides);
  const setKeybind = useKeybindsStore((s) => s.setKeybind);
  const doResetKeybind = useKeybindsStore((s) => s.resetKeybind);
  const getEffectiveDisplayKeys = useKeybindsStore((s) => s.getEffectiveDisplayKeys);

  const hasOverride = shortcut.id in overrides;
  const overrideValue = overrides[shortcut.id];
  const isDisabled = hasOverride && overrideValue === null;
  const effectiveKeys = getEffectiveDisplayKeys(shortcut.id, shortcut.keys);

  const startCapture = useCallback(() => {
    setRowState({ kind: "capturing", liveModifiers: [] });
    setTimeout(() => captureRef.current?.focus(), 0);
  }, []);

  const cancelCapture = useCallback(() => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setRowState({ kind: "idle" });
  }, []);

  const commitBinding = useCallback(
    async (binding: KeyBindingOrDisabled) => {
      await setKeybind(shortcut.id, binding);
      setRowState({ kind: "idle" });
    },
    [shortcut.id, setKeybind],
  );

  const handleOverride = useCallback(async () => {
    if (rowState.kind !== "conflict") return;
    // disable the conflicting shortcut, then set ours
    await setKeybind(rowState.conflictId, null);
    await setKeybind(shortcut.id, rowState.captured);
    setRowState({ kind: "idle" });
  }, [rowState, shortcut.id, setKeybind]);

  // Keyboard capture handler
  useEffect(() => {
    if (rowState.kind !== "capturing") return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === "Escape") {
        cancelCapture();
        return;
      }

      const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt"]);
      if (MODIFIER_KEYS.has(e.key)) {
        setRowState({ kind: "capturing", liveModifiers: getLiveModifierDisplay(e) });
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) {
        setRowState({ kind: "capturing", liveModifiers: [] });
        return;
      }

      // Check for conflicts
      const conflictId = findConflict(binding, shortcut.id, SHORTCUTS, overrides);
      if (conflictId) {
        const conflictShortcut = SHORTCUTS.find((s) => s.id === conflictId);
        setRowState({
          kind: "conflict",
          captured: binding,
          conflictId,
          conflictLabel: conflictShortcut?.label ?? conflictId,
        });
        return;
      }

      // No conflict — auto-commit after short delay
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => {
        void commitBinding(binding);
      }, 150);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (rowState.kind === "capturing") {
        const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt"]);
        if (MODIFIER_KEYS.has(e.key)) {
          setRowState({ kind: "capturing", liveModifiers: getLiveModifierDisplay(e) });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [rowState, shortcut.id, overrides, cancelCapture, commitBinding]);

  return (
    <motion.div
      layout
      className={cn(
        "group relative flex min-h-[38px] items-start gap-3 px-3 py-2.5 transition-colors",
        rowState.kind !== "idle" && "bg-accent/20",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Label */}
      <span
        className={cn(
          "flex-1 text-[12.5px] leading-5",
          rowState.kind !== "idle" ? "text-foreground" : "text-foreground/90",
        )}
      >
        {shortcut.label}
      </span>

      {/* Right side — adapts to state */}
      <div className="flex shrink-0 items-start gap-2" ref={captureRef} tabIndex={-1}>
        <AnimatePresence mode="wait">
          {rowState.kind === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex items-center gap-2"
            >
              {/* Binding display */}
              <div className="flex items-center gap-1.5">
                {hasOverride && (
                  <span
                    className="size-1.5 rounded-full bg-accent-foreground/40"
                    title="Modified"
                  />
                )}
                {isDisabled ? (
                  <span className="text-[12px] text-muted-foreground/50">—</span>
                ) : (
                  <KbdGroup>
                    {effectiveKeys.map((k, i) => (
                      <Kbd key={i}>{k}</Kbd>
                    ))}
                  </KbdGroup>
                )}
              </div>

              {/* Action buttons — visible on hover or when override exists */}
              <div
                className={cn(
                  "flex items-center gap-1 transition-opacity",
                  isHovered || hasOverride ? "opacity-100" : "opacity-0",
                )}
              >
                <button
                  type="button"
                  onClick={startCapture}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Edit shortcut"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={11} strokeWidth={2} />
                </button>
                {hasOverride && (
                  <button
                    type="button"
                    onClick={() => void doResetKeybind(shortcut.id)}
                    className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Reset to default"
                  >
                    <HugeiconsIcon icon={RotateClockwiseIcon} size={11} strokeWidth={2} />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {rowState.kind === "capturing" && (
            <motion.div
              key="capturing"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col items-end gap-1.5"
            >
              <div className="flex items-center gap-2">
                {/* Live capture display */}
                <div className="flex min-w-[120px] items-center gap-1 rounded-md border border-accent bg-accent/10 px-2 py-1">
                  {rowState.liveModifiers.length > 0 ? (
                    <KbdGroup>
                      {rowState.liveModifiers.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Press a key…
                    </span>
                  )}
                  <CaptureBlinkCursor />
                </div>

                {/* Cancel */}
                <button
                  type="button"
                  onClick={cancelCapture}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Cancel"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                </button>
              </div>

              {/* Disable option */}
              <button
                type="button"
                onClick={() => void commitBinding(null)}
                className="text-[10.5px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                Set to none
              </button>
            </motion.div>
          )}

          {rowState.kind === "conflict" && (
            <motion.div
              key="conflict"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col items-end gap-1.5"
            >
              {/* Show the captured binding */}
              <div className="flex items-center gap-2">
                <KbdGroup>
                  {buildDisplayKeysFromBinding(rowState.captured).map((k, i) => (
                    <Kbd key={i}>{k}</Kbd>
                  ))}
                </KbdGroup>
              </div>

              {/* Conflict warning */}
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  size={10}
                  strokeWidth={2}
                  className="text-amber-500/80"
                />
                <span className="text-[10.5px] text-amber-500/80">
                  Used by &ldquo;{rowState.conflictLabel}&rdquo;
                </span>
              </div>

              {/* Override / Cancel */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleOverride()}
                  className="rounded px-1.5 py-0.5 text-[10.5px] text-amber-500/80 transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                >
                  Override
                </button>
                <button
                  type="button"
                  onClick={cancelCapture}
                  className="rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Blink cursor for capture state ──────────────────────────────────────────

function CaptureBlinkCursor() {
  return (
    <motion.span
      className="ml-0.5 inline-block h-3 w-px bg-foreground/60"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear", times: [0, 0.5, 0.5] }}
    />
  );
}
