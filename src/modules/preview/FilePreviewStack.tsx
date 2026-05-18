import { cn } from "@/lib/utils";
import type { FilePreviewTab, Tab } from "@/modules/tabs";
import { FilePreviewPane } from "./FilePreviewPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function FilePreviewStack({ tabs, activeId }: Props) {
  const previews = tabs.filter((t): t is FilePreviewTab => t.kind === "file-preview");
  if (previews.length === 0) return null;

  return (
    <div className="relative h-full w-full">
      {previews.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn("absolute inset-0", !visible && "invisible pointer-events-none")}
            aria-hidden={!visible}
          >
            <FilePreviewPane path={t.path} visible={visible} />
          </div>
        );
      })}
    </div>
  );
}
