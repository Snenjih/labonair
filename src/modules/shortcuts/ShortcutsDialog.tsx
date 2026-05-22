import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SHORTCUTS, SHORTCUT_GROUPS } from "./shortcuts";
import { useKeybindsStore } from "./lib/useKeybindsStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  const getEffectiveDisplayKeys = useKeybindsStore((s) => s.getEffectiveDisplayKeys);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Quick reference for Nexum controls.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-2">
          {SHORTCUT_GROUPS.map((group) => {
            const items = SHORTCUTS.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group}
                </h3>
                <ul className="flex flex-col divide-y divide-border/60">
                  {items.map((s) => {
                    const displayKeys = getEffectiveDisplayKeys(s.id, s.keys);
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between py-2"
                      >
                        <span className="text-sm text-foreground/90">
                          {s.label}
                        </span>
                        {displayKeys.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        ) : (
                          <KbdGroup>
                            {displayKeys.map((k, i) => (
                              <Kbd key={i}>{k}</Kbd>
                            ))}
                          </KbdGroup>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
