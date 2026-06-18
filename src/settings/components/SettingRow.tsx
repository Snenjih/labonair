import { cn } from "@/lib/utils";

type HintVariant = "local" | "info" | "warning";

type Hint = {
  text: string;
  variant?: HintVariant;
};

type Props = {
  title: string;
  description?: string;
  hint?: Hint;
  children: React.ReactNode;
  className?: string;
};

const hintStyles: Record<HintVariant, { bar: string; text: string; dot: string }> = {
  local: {
    bar: "border-l-2 border-info/40 bg-info/5",
    text: "text-info/75",
    dot: "bg-info/60",
  },
  info: {
    bar: "border-l-2 border-info/40 bg-info/5",
    text: "text-info/75",
    dot: "bg-info/60",
  },
  warning: {
    bar: "border-l-2 border-warning/40 bg-warning/5",
    text: "text-warning/75",
    dot: "bg-warning/60",
  },
};

export function SettingRow({ title, description, hint, children, className }: Props) {
  const hintStyle = hint ? hintStyles[hint.variant ?? "info"] : null;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border/60 bg-card/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-3 py-[var(--ui-row-py)]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12.5px] font-medium">{title}</span>
          {description ? (
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              {description}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">{children}</div>
      </div>
      {hint && hintStyle && (
        <div className={cn("mx-2.5 mb-2 flex items-center gap-2 rounded px-2.5 py-1.5", hintStyle.bar)}>
          <span className={cn("mt-px h-1 w-1 shrink-0 rounded-full", hintStyle.dot)} />
          <span className={cn("text-[10px] leading-snug tracking-wide", hintStyle.text)}>
            {hint.text}
          </span>
        </div>
      )}
    </div>
  );
}
