export function BlockInputBar() {
  return (
    <div className="h-9 shrink-0 border-t border-border bg-background flex items-center px-3 gap-2 pointer-events-none select-none">
      <span className="text-primary font-mono text-sm leading-none">›</span>
      <span className="text-muted-foreground text-xs">Type a command…</span>
    </div>
  );
}
