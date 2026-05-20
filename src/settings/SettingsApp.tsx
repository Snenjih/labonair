import { Input } from "@/components/ui/input";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useThemeEngine } from "@/lib/useThemeEngine";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  SETTING_DEFINITIONS,
  type SettingCategory,
} from "@/modules/settings/definitions";
import {
  AiScanIcon,
  InformationCircleIcon,
  PaintBoardIcon,
  PaintBrush01Icon,
  Settings01Icon,
  SourceCodeIcon,
  TerminalIcon,
  UserMultiple02Icon,
  LockPasswordIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useState } from "react";
import * as store from "@/modules/settings/store";
import type { PrefKey } from "@/modules/settings/store";
import { AboutSection } from "./sections/AboutSection";
import { SecuritySection } from "./sections/SecuritySection";
import { AgentsSection } from "./sections/AgentsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { CommandPaletteSection } from "./sections/CommandPaletteSection";
import { EditorSection } from "./sections/EditorSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ModelsSection } from "./sections/ModelsSection";
import { TerminalSection } from "./sections/TerminalSection";
import { ThemeMarketplace } from "./sections/ThemeMarketplace";
import { SettingRow } from "./components/SettingRow";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferencesStore as usePrefs } from "@/modules/settings/preferences";

type SidebarItem = {
  id: SettingsTab;
  category: SettingCategory | null;
  label: string;
  icon: typeof Settings01Icon;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "general", category: "General", label: "General", icon: Settings01Icon },
  { id: "appearance", category: "Appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "themes", category: null, label: "Themes", icon: PaintBrush01Icon },
  { id: "terminal", category: "Terminal", label: "Terminal", icon: TerminalIcon },
  { id: "editor", category: "Editor", label: "Editor", icon: SourceCodeIcon },
  { id: "command-palette", category: "Command Palette", label: "Command Palette", icon: Search01Icon },
  { id: "models", category: "Models", label: "Models", icon: AiScanIcon },
  { id: "agents", category: "Agents", label: "Agents", icon: UserMultiple02Icon },
  { id: "security", category: null, label: "Security", icon: LockPasswordIcon },
  { id: "about", category: "About", label: "About", icon: InformationCircleIcon },
];

const VALID_TABS = SIDEBAR_ITEMS.map((s) => s.id);

function readInitialTab(): SettingsTab {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  const t = url.searchParams.get("tab");
  if (t === "ai" || t === "connections") return "models";
  if (t && (VALID_TABS as string[]).includes(t)) return t as SettingsTab;
  return "general";
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsTab>(readInitialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const init = usePreferencesStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);
  useThemeEngine();

  useEffect(() => {
    const apply = (detail: string) => {
      if (detail === "ai" || detail === "connections") {
        setActive("models");
        return;
      }
      if ((VALID_TABS as string[]).includes(detail)) {
        setActive(detail as SettingsTab);
      }
    };
    const unlistenPromise = getCurrentWebviewWindow().listen<string>(
      "nexum:settings-tab",
      (e) => apply(e.payload),
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  const trimmed = searchQuery.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const searchResults = isSearching
    ? SETTING_DEFINITIONS.filter(
        (def) =>
          def.label.toLowerCase().includes(trimmed) ||
          def.description.toLowerCase().includes(trimmed),
      )
    : [];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground select-none">
      {/* Titlebar */}
      <header
        data-tauri-drag-region
        className={`flex h-11 shrink-0 items-center border-b border-border/60 bg-card/60 ${
          IS_MAC ? "pr-3 pl-22" : "pr-0 pl-3"
        }`}
      >
        <span
          className="flex-1 text-center text-[12.5px] font-medium"
          data-tauri-drag-region
        >
          Settings
        </span>
        {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls />}
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar */}
        <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-border/60 bg-card/30 p-2">
          <div className="mb-1 px-1">
            <Input
              type="search"
              placeholder="Search settings…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-[11.5px]"
            />
          </div>
          <nav className="flex flex-col gap-0.5">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActive(item.id);
                  setSearchQuery("");
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
                  active === item.id && !isSearching
                    ? "bg-accent/50 text-foreground"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={item.icon} size={13} strokeWidth={1.75} />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-6 pb-7">
          <div className={cn("mx-auto w-full", active === "themes" ? "max-w-[680px]" : "max-w-[580px]")}>
            {isSearching ? (
              <SearchResults query={trimmed} results={searchResults} />
            ) : (
              <>
                {active === "general" && <GeneralSection />}
                {active === "appearance" && <AppearanceSection />}
                {active === "themes" && <ThemeMarketplace />}
                {active === "terminal" && <TerminalSection />}
                {active === "editor" && <EditorSection />}
                {active === "command-palette" && <CommandPaletteSection />}
                {active === "models" && <ModelsSection />}
                {active === "agents" && <AgentsSection />}
                {active === "security" && <SecuritySection />}
                {active === "about" && <AboutSection />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function applySettingChange(id: PrefKey, value: unknown): void {
  switch (id) {
    case "autostart": void store.setAutostart(value as boolean); break;
    case "restoreWindowState": void store.setRestoreWindowState(value as boolean); break;
    case "vimMode": void store.setVimMode(value as boolean); break;
    case "theme": void store.setTheme(value as store.ThemePref); break;
    case "terminalCursorBlink": void store.setTerminalCursorBlink(value as boolean); break;
    case "terminalCursorStyle": void store.setTerminalCursorStyle(value as "block" | "underline" | "bar"); break;
    case "terminalFontWeight": void store.setTerminalFontWeight(value as "normal" | "medium" | "bold"); break;
    case "editorAutoSave": void store.setEditorAutoSave(value as "off" | "afterDelay" | "onFocusChange"); break;
    case "editorLineNumbers": void store.setEditorLineNumbers(value as boolean); break;
    case "editorWordWrap": void store.setEditorWordWrap(value as boolean); break;
    case "editorTabSize": void store.setEditorTabSize(Number(value) as 2 | 4 | 8); break;
    case "editorBracketMatching": void store.setEditorBracketMatching(value as boolean); break;
    case "sftpShowHiddenFiles": void store.setSftpShowHiddenFiles(value as boolean); break;
    case "sftpShowUpFolder": void store.setSftpShowUpFolder(value as boolean); break;
    case "sftpColumnSize": void store.setSftpColumnSize(value as boolean); break;
    case "sftpColumnModified": void store.setSftpColumnModified(value as boolean); break;
    case "sftpColumnPermissions": void store.setSftpColumnPermissions(value as boolean); break;
    case "sftpColumnType": void store.setSftpColumnType(value as boolean); break;
    case "sftpRemoteEditShowTransfers": void store.setSftpRemoteEditShowTransfers(value as boolean); break;
  }
}

function SearchResults({
  query,
  results,
}: {
  query: string;
  results: ReturnType<typeof SETTING_DEFINITIONS.filter>;
}) {
  const prefs = usePrefs();

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 pt-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          No settings matching &ldquo;{query}&rdquo;
        </p>
      </div>
    );
  }

  const byCategory = results.reduce<
    Record<string, typeof results>
  >((acc, def) => {
    const cat = def.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(def);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(byCategory).map(([category, defs]) => (
        <div key={category} className="flex flex-col gap-2">
          <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
            {category}
          </span>
          <div className="flex flex-col gap-2">
            {defs.map((def) => {
              if (def.controlType === "Switch") {
                const val = prefs[def.id] as boolean;
                return (
                  <SettingRow
                    key={def.id}
                    title={def.label}
                    description={def.description}
                  >
                    <Switch
                      checked={val}
                      onCheckedChange={(v) => applySettingChange(def.id, v)}
                    />
                  </SettingRow>
                );
              }
              if (def.controlType === "Select" && def.options) {
                const val = String(prefs[def.id]);
                const opt = def.options.find((o) => o.value === val);
                return (
                  <SettingRow
                    key={def.id}
                    title={def.label}
                    description={def.description}
                  >
                    <Select
                      value={val}
                      onValueChange={(v) => applySettingChange(def.id, v)}
                    >
                      <SelectTrigger className="h-7 w-36 text-[11.5px]">
                        <SelectValue>{opt?.label ?? val}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {def.options.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-[11.5px]">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                );
              }
              return (
                <SettingRow
                  key={def.id}
                  title={def.label}
                  description={def.description}
                >
                  <span className="text-[11.5px] text-muted-foreground">
                    {String(prefs[def.id])}
                  </span>
                </SettingRow>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
