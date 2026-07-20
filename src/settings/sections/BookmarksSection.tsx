import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setBookmarksActionCurrentSftp,
  setBookmarksActionCurrentTerminal,
  setBookmarksActionNewSftp,
  setBookmarksActionNewTerminal,
  setBookmarksEnabled,
  setBookmarksPrimaryClickBehavior,
  setBookmarksShowBadge,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function BookmarksSection() {
  const bookmarksEnabled = usePreferencesStore((s) => s.bookmarksEnabled);
  const bookmarksActionNewTerminal = usePreferencesStore((s) => s.bookmarksActionNewTerminal);
  const bookmarksActionCurrentTerminal = usePreferencesStore((s) => s.bookmarksActionCurrentTerminal);
  const bookmarksActionCurrentSftp = usePreferencesStore((s) => s.bookmarksActionCurrentSftp);
  const bookmarksActionNewSftp = usePreferencesStore((s) => s.bookmarksActionNewSftp);
  const bookmarksPrimaryClickBehavior = usePreferencesStore((s) => s.bookmarksPrimaryClickBehavior);
  const bookmarksShowBadge = usePreferencesStore((s) => s.bookmarksShowBadge);

  // Present, not hidden, when the master switch is off — communicates "this
  // is here, turn on Bookmarks to use it" rather than settings evaporating.
  const rowClassName = bookmarksEnabled ? undefined : "opacity-50";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Bookmarks"
        description="Save frequently-used local or host folders and jump to them quickly from the titlebar, breadcrumb, SFTP, and Explorer context menus."
      />

      <div className="flex flex-col gap-2">
        <Label>General</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Enable path bookmarks"
            description="Turn the whole feature on or off — hides the titlebar dropdown and every 'Bookmark this path' menu item when off."
          >
            <Switch checked={bookmarksEnabled} onCheckedChange={(v) => void setBookmarksEnabled(v)} />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Row actions</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            className={rowClassName}
            title="Open in new terminal"
            description="Show the action to open a bookmark in a brand-new terminal tab."
          >
            <Switch
              checked={bookmarksActionNewTerminal}
              disabled={!bookmarksEnabled}
              onCheckedChange={(v) => void setBookmarksActionNewTerminal(v)}
            />
          </SettingRow>
          <SettingRow
            className={rowClassName}
            title="Open in current terminal"
            description="Show the action to cd the currently focused terminal to a bookmark's path."
          >
            <Switch
              checked={bookmarksActionCurrentTerminal}
              disabled={!bookmarksEnabled}
              onCheckedChange={(v) => void setBookmarksActionCurrentTerminal(v)}
            />
          </SettingRow>
          <SettingRow
            className={rowClassName}
            title="Open in current SFTP manager"
            description="Show the action to navigate the currently open SFTP tab to a bookmark's path."
          >
            <Switch
              checked={bookmarksActionCurrentSftp}
              disabled={!bookmarksEnabled}
              onCheckedChange={(v) => void setBookmarksActionCurrentSftp(v)}
            />
          </SettingRow>
          <SettingRow
            className={rowClassName}
            title="Open in new SFTP tab"
            description="Show the action to open a host bookmark in a brand-new SFTP tab. Never shown for local bookmarks."
          >
            <Switch
              checked={bookmarksActionNewSftp}
              disabled={!bookmarksEnabled}
              onCheckedChange={(v) => void setBookmarksActionNewSftp(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Behavior</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            className={rowClassName}
            title="Primary click opens"
            description="What clicking a bookmark's path itself does — reuse the current tab/pane, or always open a new one."
          >
            <Select
              value={bookmarksPrimaryClickBehavior}
              onValueChange={(v) => void setBookmarksPrimaryClickBehavior(v as "current" | "new")}
              disabled={!bookmarksEnabled}
            >
              <SelectTrigger className="h-7 w-40 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current" className="text-[11.5px]">
                  Current tab/pane
                </SelectItem>
                <SelectItem value="new" className="text-[11.5px]">
                  New tab
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            className={rowClassName}
            title="Show bookmark count badge"
            description="Display a small count badge on the titlebar bookmarks icon."
          >
            <Switch
              checked={bookmarksShowBadge}
              disabled={!bookmarksEnabled}
              onCheckedChange={(v) => void setBookmarksShowBadge(v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
