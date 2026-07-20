import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setTerminalBell,
  setTerminalBlocksAutoCollapseOnAltScreen,
  setTerminalBlocksEnabled,
  setTerminalComposerArgumentCompletion,
  setTerminalComposerEnabled,
  setTerminalComposerHistoryPopup,
  setTerminalCopyOnSelect,
  setTerminalCursorBlink,
  setTerminalCursorBlinkInterval,
  setTerminalCursorStyle,
  setTerminalDefaultPath,
  setTerminalFastScrollModifier,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalLineHeight,
  setTerminalRightClickPastes,
  setTerminalScrollback,
  setTerminalScrollSensitivity,
  setTerminalShell,
  setTerminalShowPaneFooter,
  setTerminalShowPaneHeader,
  setTerminalUseWebGL,
  setTerminalWordSeparator,
} from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function TerminalSection() {
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalCursorBlinkInterval = usePreferencesStore((s) => s.terminalCursorBlinkInterval);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalComposerEnabled = usePreferencesStore((s) => s.terminalComposerEnabled);
  const terminalComposerHistoryPopup = usePreferencesStore((s) => s.terminalComposerHistoryPopup);
  const terminalComposerArgumentCompletion = usePreferencesStore((s) => s.terminalComposerArgumentCompletion);
  const terminalBlocksEnabled = usePreferencesStore((s) => s.terminalBlocksEnabled);
  const terminalBlocksAutoCollapseOnAltScreen = usePreferencesStore(
    (s) => s.terminalBlocksAutoCollapseOnAltScreen,
  );
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const terminalLetterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);
  const terminalLineHeight = usePreferencesStore((s) => s.terminalLineHeight);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const terminalShowPaneHeader = usePreferencesStore((s) => s.terminalShowPaneHeader);
  const terminalShowPaneFooter = usePreferencesStore((s) => s.terminalShowPaneFooter);
  const terminalUseWebGL = usePreferencesStore((s) => s.terminalUseWebGL);
  const terminalBell = usePreferencesStore((s) => s.terminalBell);
  const terminalCopyOnSelect = usePreferencesStore((s) => s.terminalCopyOnSelect);
  const terminalRightClickPastes = usePreferencesStore((s) => s.terminalRightClickPastes);
  const terminalWordSeparator = usePreferencesStore((s) => s.terminalWordSeparator);
  const terminalScrollSensitivity = usePreferencesStore((s) => s.terminalScrollSensitivity);
  const terminalFastScrollModifier = usePreferencesStore((s) => s.terminalFastScrollModifier);
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const terminalDefaultPath = usePreferencesStore((s) => s.terminalDefaultPath);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Terminal"
        description="Font, cursor, and display settings for the terminal emulator."
      />

      <div className="flex flex-col gap-2">
        <Label>Shell</Label>
        <SettingRow
          title="Shell path"
          description="Full path to the shell binary. Leave empty to use the system default ($SHELL). Applies to new terminal sessions."
          hint={{
            text: "Local terminal only — SSH connections launch the shell configured on the remote server. This path has no effect there.",
            variant: "local",
          }}
        >
          <Input
            value={terminalShell}
            onChange={(e) => void setTerminalShell(e.target.value)}
            placeholder="Auto-detect (e.g. /bin/zsh)"
            className="h-7 w-52 font-mono text-[11.5px]"
          />
        </SettingRow>
        <SettingRow
          title="Default working directory"
          description="Path opened when a new terminal tab starts. Leave empty to use $HOME. Ignored when 'Inherit cwd from current tab' is enabled."
          hint={{
            text: "Local terminal only — SSH sessions always open in the remote user's home directory, regardless of this setting.",
            variant: "local",
          }}
        >
          <Input
            value={terminalDefaultPath}
            onChange={(e) => void setTerminalDefaultPath(e.target.value)}
            placeholder="/Users/me/Projects"
            className="h-7 w-52 font-mono text-[11.5px]"
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Font</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Font family" description="Monospace font for the terminal emulator.">
            <Input
              value={terminalFontFamily}
              onChange={(e) => void setTerminalFontFamily(e.target.value)}
              className="h-7 w-52 text-[11.5px]"
            />
          </SettingRow>
          <SettingRow title="Font size" description="Font size used in the terminal (in px).">
            <NumInput
              value={terminalFontSize}
              min={8}
              max={32}
              step={1}
              onChange={(v) => void setTerminalFontSize(v)}
            />
          </SettingRow>
          <SettingRow title="Font weight" description="Weight of the text rendered in the terminal.">
            <Select
              value={terminalFontWeight}
              onValueChange={(v) => void setTerminalFontWeight(v as "normal" | "medium" | "bold")}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-[11.5px]">
                  Normal
                </SelectItem>
                <SelectItem value="medium" className="text-[11.5px]">
                  Medium
                </SelectItem>
                <SelectItem value="bold" className="text-[11.5px]">
                  Bold
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="Letter spacing" description="Horizontal spacing between characters (in px).">
            <NumInput
              value={terminalLetterSpacing}
              min={-2}
              max={10}
              step={0.5}
              onChange={(v) => void setTerminalLetterSpacing(v)}
            />
          </SettingRow>
          <SettingRow title="Line height" description="Vertical spacing between lines in the terminal.">
            <NumInput
              value={terminalLineHeight}
              min={0.8}
              max={2}
              step={0.05}
              onChange={(v) => void setTerminalLineHeight(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Cursor</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Cursor style" description="Shape of the cursor in the terminal.">
            <Select
              value={terminalCursorStyle}
              onValueChange={(v) => void setTerminalCursorStyle(v as "block" | "underline" | "bar")}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block" className="text-[11.5px]">
                  Block
                </SelectItem>
                <SelectItem value="underline" className="text-[11.5px]">
                  Underline
                </SelectItem>
                <SelectItem value="bar" className="text-[11.5px]">
                  Bar
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="Cursor blink" description="Animate the terminal cursor with a blinking effect.">
            <Switch checked={terminalCursorBlink} onCheckedChange={(v) => void setTerminalCursorBlink(v)} />
          </SettingRow>
          {terminalCursorBlink && (
            <SettingRow
              title="Blink interval"
              description="Duration of one blink cycle in milliseconds (200–2000 ms)."
            >
              <NumInput
                value={terminalCursorBlinkInterval}
                min={200}
                max={2000}
                step={50}
                onChange={(v) => void setTerminalCursorBlinkInterval(v)}
              />
            </SettingRow>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Layout</Label>
        <SettingRow
          title="Show pane headers"
          description="Display a header bar above each terminal pane in split-pane workspaces."
        >
          <Switch
            checked={terminalShowPaneHeader}
            onCheckedChange={(v) => void setTerminalShowPaneHeader(v)}
          />
        </SettingRow>
        <SettingRow
          title="Show pane footer"
          description="Display a bottom margin below each terminal workspace."
        >
          <Switch
            checked={terminalShowPaneFooter}
            onCheckedChange={(v) => void setTerminalShowPaneFooter(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Composer &amp; Blocks</Label>
        <SettingRow
          title="Command composer"
          description="Show a command input for the active terminal in the bottom bar, with history-based ghost-text suggestions. Works for both local and SSH terminals, independently of AI."
        >
          <Switch
            checked={terminalComposerEnabled}
            onCheckedChange={(v) => void setTerminalComposerEnabled(v)}
          />
        </SettingRow>
        {terminalComposerEnabled && (
          <>
            <SettingRow
              title="History popup"
              description="Pressing ↑ opens a scrollable history menu instead of cycling commands inline in the composer itself."
            >
              <Switch
                checked={terminalComposerHistoryPopup}
                onCheckedChange={(v) => void setTerminalComposerHistoryPopup(v)}
              />
            </SettingRow>
            <SettingRow
              title="Argument completion"
              description="When ghost-text is ambiguous, show a per-argument suggestion list below the cursor. Tab fills and cycles through candidates; arrow keys scroll the list."
            >
              <Switch
                checked={terminalComposerArgumentCompletion}
                onCheckedChange={(v) => void setTerminalComposerArgumentCompletion(v)}
              />
            </SettingRow>
            <SettingRow
              title="Block terminal"
              description="Group each executed command and its output into a block with cwd, exit code, and duration. Only available while the command composer is on."
            >
              <Switch
                checked={terminalBlocksEnabled}
                onCheckedChange={(v) => {
                  void setTerminalBlocksEnabled(v);
                  // The shell script that reserves header rows is baked in
                  // once at spawn time (env var, no live side-channel into an
                  // already-running shell) — this can't retroactively change
                  // already-open tabs.
                  useNotificationStore.getState().addNotification({
                    type: "info",
                    title: "Block terminal",
                    message: v
                      ? "Applies to newly opened terminals — reopen existing tabs to enable blocks there."
                      : "Applies to newly opened terminals — existing tabs keep showing blocks until reopened.",
                  });
                }}
              />
            </SettingRow>
            {terminalBlocksEnabled && (
              <SettingRow
                title="Auto-collapse for full-screen apps"
                description="Suppress block chrome while a full-screen terminal app (vim, htop, less, …) is running."
                hint={{
                  text: "Recommended to keep this on. Turning it off is for advanced use only — block chrome stays positioned for the normal buffer and will overlay on top of full-screen apps like vim or htop.",
                  variant: "warning",
                }}
              >
                <Switch
                  checked={terminalBlocksAutoCollapseOnAltScreen}
                  onCheckedChange={(v) => void setTerminalBlocksAutoCollapseOnAltScreen(v)}
                />
              </SettingRow>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Rendering</Label>
        <SettingRow
          title="Use WebGL renderer"
          description="Accelerates terminal rendering using your GPU. Turn off if terminal text flickers, appears blurry, or causes graphics issues. Applies to new terminal sessions."
        >
          <Switch checked={terminalUseWebGL} onCheckedChange={(v) => void setTerminalUseWebGL(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Bell</Label>
        <SettingRow
          title="Terminal bell"
          description="Play a sound when the terminal bell character (BEL) is received."
        >
          <Switch checked={terminalBell} onCheckedChange={(v) => void setTerminalBell(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Buffer</Label>
        <SettingRow title="Scrollback buffer" description="Number of lines kept in the terminal history.">
          <NumInput
            value={terminalScrollback}
            min={500}
            max={50000}
            step={500}
            onChange={(v) => void setTerminalScrollback(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Input</Label>
        <SettingRow title="Copy on select" description="Automatically copy selected text to the clipboard.">
          <Switch checked={terminalCopyOnSelect} onCheckedChange={(v) => void setTerminalCopyOnSelect(v)} />
        </SettingRow>
        <SettingRow
          title="Right-click pastes"
          description="Paste clipboard content on right-click instead of showing a context menu."
        >
          <Switch
            checked={terminalRightClickPastes}
            onCheckedChange={(v) => void setTerminalRightClickPastes(v)}
          />
        </SettingRow>
        <SettingRow
          title="Word separators"
          description="Characters treated as word boundaries when double-clicking to select."
        >
          <Input
            value={terminalWordSeparator}
            onChange={(e) => void setTerminalWordSeparator(e.target.value)}
            className="h-7 w-52 font-mono text-[11.5px]"
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Scrolling</Label>
        <SettingRow title="Scroll sensitivity" description="Number of lines scrolled per mouse wheel tick.">
          <NumInput
            value={terminalScrollSensitivity}
            min={1}
            max={10}
            step={1}
            onChange={(v) => void setTerminalScrollSensitivity(v)}
          />
        </SettingRow>
        <SettingRow
          title="Fast scroll modifier"
          description="Hold this key to scroll faster. Applies to new terminal sessions."
        >
          <Select
            value={terminalFastScrollModifier}
            onValueChange={(v) => void setTerminalFastScrollModifier(v as "none" | "alt" | "ctrl" | "shift")}
          >
            <SelectTrigger className="h-7 w-28 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-[11.5px]">
                None
              </SelectItem>
              <SelectItem value="alt" className="text-[11.5px]">
                Alt
              </SelectItem>
              <SelectItem value="ctrl" className="text-[11.5px]">
                Ctrl
              </SelectItem>
              <SelectItem value="shift" className="text-[11.5px]">
                Shift
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
