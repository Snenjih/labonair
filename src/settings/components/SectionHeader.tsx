type Props = {
  title: string;
  description?: string;
};

export function SectionHeader({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
