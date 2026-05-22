import type { Shortcut, ShortcutId } from "../shortcuts";
import type { KeyBinding, KeyBindingMap } from "../types";
import { bindingMatchesEvent } from "./captureKeyBinding";

function syntheticEvent(b: KeyBinding): KeyboardEvent {
  return {
    key: b.key,
    metaKey: b.meta,
    ctrlKey: b.ctrl,
    shiftKey: b.shift,
    altKey: b.alt,
  } as KeyboardEvent;
}

export function findConflict(
  newBinding: KeyBinding,
  excludeId: string,
  shortcuts: Shortcut[],
  overrides: KeyBindingMap,
): ShortcutId | null {
  const synthetic = syntheticEvent(newBinding);
  for (const s of shortcuts) {
    if (s.id === excludeId) continue;
    const override = overrides[s.id];
    if (override === undefined) {
      if (s.match(synthetic)) return s.id as ShortcutId;
    } else if (override !== null) {
      if (bindingMatchesEvent(override as KeyBinding, synthetic)) return s.id as ShortcutId;
    }
  }
  return null;
}
