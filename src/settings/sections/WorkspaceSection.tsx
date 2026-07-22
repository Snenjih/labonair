import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
  setCommandPaletteAnimation,
  setCommandPaletteBlur,
  setCommandPaletteCloseOnOverlayClick,
  setCommandPaletteHistorySize,
  setCommandPaletteOpacity,
  setCommandPalettePosition,
  setCommandPaletteSearchMode,
  setCommandPaletteShowRecent,
  setGitStatusPollIntervalMs,
} from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold tracking-tight text-foreground">{children}</h3>;
}

function SectionDivider() {
  return <div className="border-t border-border/40" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}

function BookmarksContent() {
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

function CommandPaletteContent() {
  const blur = usePreferencesStore((s) => s.commandPaletteBlur);
  const opacity = usePreferencesStore((s) => s.commandPaletteOpacity);
  const position = usePreferencesStore((s) => s.commandPalettePosition);
  const animation = usePreferencesStore((s) => s.commandPaletteAnimation);
  const showRecent = usePreferencesStore((s) => s.commandPaletteShowRecent);
  const historySize = usePreferencesStore((s) => s.commandPaletteHistorySize);
  const searchMode = usePreferencesStore((s) => s.commandPaletteSearchMode);
  const closeOnOverlay = usePreferencesStore((s) => s.commandPaletteCloseOnOverlayClick);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Appearance</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Background blur"
            description="Blur strength applied to the app behind the overlay (0 = off, 20 = strong)."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={20}
                step={1}
                value={[blur]}
                onValueChange={([v]) => void setCommandPaletteBlur(v)}
                className="w-28"
              />
              <span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {blur}px
              </span>
            </div>
          </SettingRow>

          <SettingRow title="Palette opacity" description="Opacity of the command palette panel (60–100%).">
            <div className="flex items-center gap-3">
              <Slider
                min={60}
                max={100}
                step={1}
                value={[opacity]}
                onValueChange={([v]) => void setCommandPaletteOpacity(v)}
                className="w-28"
              />
              <span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {opacity}%
              </span>
            </div>
          </SettingRow>

          <SettingRow title="Open position" description="Vertical position of the palette when it opens.">
            <Select
              value={position}
              onValueChange={(v) => void setCommandPalettePosition(v as "top" | "center" | "high")}
            >
              <SelectTrigger className="h-7 w-32 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top" className="text-[11.5px]">
                  Top (15%)
                </SelectItem>
                <SelectItem value="high" className="text-[11.5px]">
                  High (8%)
                </SelectItem>
                <SelectItem value="center" className="text-[11.5px]">
                  Center
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow title="Animation speed" description="Speed of open/close and page-slide animations.">
            <Select
              value={animation}
              onValueChange={(v) => void setCommandPaletteAnimation(v as "fast" | "normal" | "slow" | "none")}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast" className="text-[11.5px]">
                  Fast
                </SelectItem>
                <SelectItem value="normal" className="text-[11.5px]">
                  Normal
                </SelectItem>
                <SelectItem value="slow" className="text-[11.5px]">
                  Slow
                </SelectItem>
                <SelectItem value="none" className="text-[11.5px]">
                  None
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Behaviour</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Show recent commands"
            description="Display recently used commands at the top of the palette."
          >
            <Switch checked={showRecent} onCheckedChange={(v) => void setCommandPaletteShowRecent(v)} />
          </SettingRow>

          <SettingRow
            title="Recent history size"
            description="How many recently used commands to remember (3–20)."
          >
            <input
              type="number"
              min={3}
              max={20}
              step={1}
              value={historySize}
              onChange={(e) => void setCommandPaletteHistorySize(Number(e.target.value))}
              className="h-7 w-16 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </SettingRow>

          <SettingRow title="Search mode" description="How search queries are matched against command names.">
            <Select
              value={searchMode}
              onValueChange={(v) =>
                void setCommandPaletteSearchMode(v as "contains" | "startsWith" | "fuzzy")
              }
            >
              <SelectTrigger className="h-7 w-32 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains" className="text-[11.5px]">
                  Contains
                </SelectItem>
                <SelectItem value="startsWith" className="text-[11.5px]">
                  Starts with
                </SelectItem>
                <SelectItem value="fuzzy" className="text-[11.5px]">
                  Fuzzy
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            title="Close on outside click"
            description="Close the palette when clicking the background overlay."
          >
            <Switch
              checked={closeOnOverlay}
              onCheckedChange={(v) => void setCommandPaletteCloseOnOverlayClick(v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function SourceControlContent() {
  const gitStatusPollIntervalMs = usePreferencesStore((s) => s.gitStatusPollIntervalMs);

  return (
    <div className="flex flex-col gap-2">
      <SettingRow
        title="Refresh interval"
        description="How often Source Control polls for status changes (in ms). Repositories on a remote SSH host automatically use a longer effective interval — each check is a network round-trip over the same session the file tree uses, so a longer interval reduces load without a second setting to manage."
      >
        <NumInput
          value={gitStatusPollIntervalMs}
          min={2000}
          max={30000}
          step={500}
          onChange={(v) => void setGitStatusPollIntervalMs(v)}
        />
      </SettingRow>
    </div>
  );
}

export function WorkspaceSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Workspace"
        description="Cross-cutting features that aren't tied to a single pane: bookmarks, the command palette, and source control."
      />

      <div className="flex flex-col gap-4">
        <SubSectionTitle>Bookmarks</SubSectionTitle>
        <BookmarksContent />
      </div>

      <SectionDivider />

      <div className="flex flex-col gap-4">
        <SubSectionTitle>Command Palette</SubSectionTitle>
        <CommandPaletteContent />
      </div>

      <SectionDivider />

      <div className="flex flex-col gap-4">
        <SubSectionTitle>Source Control</SubSectionTitle>
        <SourceControlContent />
      </div>
    </div>
  );
}
