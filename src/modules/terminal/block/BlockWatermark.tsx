import { IS_MAC } from "@/lib/platform";

interface BlockWatermarkProps {
  visible: boolean;
}

export function BlockWatermark({ visible }: BlockWatermarkProps) {
  if (!visible) return null;

  const mod = IS_MAC ? "⌘" : "Ctrl";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center select-none">
        <p className="text-xs font-medium text-muted-foreground/40">Block Terminal</p>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground/30">
          <div className="flex items-center gap-2 justify-center">
            <kbd className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[10px] font-mono">↑</kbd>
            <span>Browse command history</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <kbd className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[10px] font-mono">Tab</kbd>
            <span>Autocomplete paths</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className="flex gap-0.5">
              <kbd className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[10px] font-mono">{mod}</kbd>
              <kbd className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[10px] font-mono">↵</kbd>
            </div>
            <span>Submit command</span>
          </div>
        </div>
      </div>
    </div>
  );
}
