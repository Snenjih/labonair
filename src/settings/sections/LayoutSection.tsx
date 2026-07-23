import {
  AiScanIcon,
  ArrowUpDownIcon,
  Bookmark02Icon,
  Download01Icon,
  FlashIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  GitBranchIcon,
  Globe02Icon,
  LayoutTopIcon,
  Notification03Icon,
  RefreshIcon,
  Route01Icon,
  ShieldUserIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type BarId, type BarItemId, DEFAULT_BAR_ITEM_PLACEMENTS } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setBarItemPlacement, setBarItemPlacements } from "@/modules/settings/store";
import { SettingRow } from "../components/SettingRow";

type ItemConfig = { id: BarItemId; label: string; description: string; icon: typeof Download01Icon };

const BADGE_ITEMS: ItemConfig[] = [
  {
    id: "updater",
    label: "Updater",
    description: "Update-available indicator button.",
    icon: Download01Icon,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Notification history bell.",
    icon: Notification03Icon,
  },
  {
    id: "jumpHosts",
    label: "Jump Host Connections",
    description: "Active jump-host connection list.",
    icon: Route01Icon,
  },
  {
    id: "agentAccess",
    label: "AI Agent Access",
    description: "Tabs granted to the external AI agent bridge.",
    icon: ShieldUserIcon,
  },
  {
    id: "transfers",
    label: "Transfers",
    description: "SFTP transfer queue and progress.",
    icon: ArrowUpDownIcon,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    description: "Saved path bookmarks dropdown.",
    icon: Bookmark02Icon,
  },
];

const PANEL_ITEMS: ItemConfig[] = [
  {
    id: "explorerPanel",
    label: "Explorer",
    description: "File explorer sidebar panel.",
    icon: FolderTreeIcon,
  },
  { id: "snippetsPanel", label: "Snippets", description: "Command snippets sidebar panel.", icon: FlashIcon },
  {
    id: "sourceControlPanel",
    label: "Source Control",
    description: "Git staging sidebar panel.",
    icon: GitBranchIcon,
  },
  {
    id: "tabsPanel",
    label: "Tabs",
    description: "Sidebar tab list — only shown when the tab bar location is set to Sidebar.",
    icon: LayoutTopIcon,
  },
];

const INFO_ITEMS: ItemConfig[] = [
  {
    id: "cwdBreadcrumb",
    label: "Working Directory",
    description: "Current directory breadcrumb path.",
    icon: FolderOpenIcon,
  },
  {
    id: "cursorPosition",
    label: "Cursor Position",
    description: "Line/column indicator, shown for editor tabs only.",
    icon: SourceCodeIcon,
  },
  {
    id: "previewUrl",
    label: "Dev Server Preview",
    description: "Quick-open chip for detected dev server URLs.",
    icon: Globe02Icon,
  },
];

const AI_ITEMS: ItemConfig[] = [
  {
    id: "ai",
    label: "AI Controls",
    description: "Agent status pill and chat open/close controls.",
    icon: AiScanIcon,
  },
];

/**
 * Titlebar/statusbar item positioning — a subsection embedded inside
 * Appearance rather than its own top-level settings page, since it's just
 * another facet of "how the app looks." Right-click any titlebar or
 * statusbar item to reposition or hide it directly; this subsection is the
 * escape hatch to bring hidden items back or manage everything at once.
 */
export function BarItemLayoutSettings() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
          Titlebar & Statusbar Items
        </span>
        <button
          type="button"
          onClick={() => void resetBarLayout()}
          className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[10.5px] text-foreground transition-colors hover:bg-accent"
        >
          <HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={1.75} />
          Reset to defaults
        </button>
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        Right-click any titlebar or statusbar item to reposition or hide it — use the switches below to bring
        hidden items back.
      </p>

      <Group label="Badges" items={BADGE_ITEMS} />
      <Group label="Panels" items={PANEL_ITEMS} />
      <Group label="Info" items={INFO_ITEMS} />
      <Group label="AI" items={AI_ITEMS} />
    </div>
  );
}

async function resetBarLayout(): Promise<void> {
  await setBarItemPlacements(DEFAULT_BAR_ITEM_PLACEMENTS);
}

function Group({ label, items }: { label: string; items: ItemConfig[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <BarItemRow key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
}

function BarItemRow({ id, label, description, icon }: ItemConfig) {
  const placement = usePreferencesStore((s) => s.barItemPlacements[id]);
  if (!placement) return null;
  const shown = !placement.hidden;
  const surfaceMode = (placement.extra?.surfaceMode as "panel" | "mini" | undefined) ?? "panel";

  return (
    <SettingRow title={label} description={description} className={cn(!shown && "opacity-60")}>
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
        {shown && (
          <Select
            value={placement.bar}
            onValueChange={(v) => void setBarItemPlacement(id, { bar: v as BarId })}
          >
            <SelectTrigger className="h-7 w-24 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="titlebar" className="text-[11px]">
                Titlebar
              </SelectItem>
              <SelectItem value="statusbar" className="text-[11px]">
                Statusbar
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {shown && (
          <SideToggle
            value={placement.side}
            leftLabel="Left"
            rightLabel="Right"
            onChange={(side) => void setBarItemPlacement(id, { side })}
          />
        )}
        {shown && id === "ai" && (
          <SideToggle
            value={surfaceMode === "mini" ? "right" : "left"}
            leftLabel="Panel"
            rightLabel="Mini"
            onChange={(v) =>
              void setBarItemPlacement("ai", {
                extra: { ...placement.extra, surfaceMode: v === "right" ? "mini" : "panel" },
              })
            }
          />
        )}
        <Switch checked={shown} onCheckedChange={(v) => void setBarItemPlacement(id, { hidden: !v })} />
      </div>
    </SettingRow>
  );
}

function SideToggle({
  value,
  leftLabel,
  rightLabel,
  onChange,
}: {
  value: "left" | "right";
  leftLabel: string;
  rightLabel: string;
  onChange: (v: "left" | "right") => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => onChange("left")}
        className={cn(
          "h-7 px-2 text-[11px] transition-colors",
          value === "left" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
        )}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("right")}
        className={cn(
          "h-7 px-2 text-[11px] transition-colors border-l border-border/60",
          value === "right" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
        )}
      >
        {rightLabel}
      </button>
    </div>
  );
}
