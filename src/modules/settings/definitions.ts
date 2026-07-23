import type { PrefKey } from "./store";

export type SettingCategory =
  | "General"
  | "Appearance & Layout"
  | "Terminal"
  | "Editor"
  | "Command Palette"
  | "File Manager"
  | "Connections"
  | "Source Control"
  | "AI"
  | "Directives"
  | "Bookmarks"
  | "About";

export type ControlType = "Switch" | "Select" | "Input" | "NumberInput" | "Custom";

export type SelectOption = { value: string; label: string };

export type SettingDefinition = {
  id: PrefKey;
  label: string;
  description: string;
  category: SettingCategory;
  controlType: ControlType;
  options?: SelectOption[];
  /** For `controlType: "Custom"` — which settings tab the link navigates to
   *  (defaults to "themes" for backward compatibility with the original
   *  Themes-only Custom entries). */
  targetTab?: import("./openSettingsWindow").SettingsTab;
  /** For `controlType: "Custom"` — the link button's label (defaults to "Open in Themes"). */
  linkLabel?: string;
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // --- General ---
  {
    id: "autostart",
    label: "Launch at login",
    description: "Open Labonair automatically when you sign in.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "restoreWindowState",
    label: "Restore window position & size",
    description: "Reopen the main window where you left it. Applies on next launch.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "sessionRestore",
    label: "Session restore",
    description:
      "Reopen all tabs, SSH connections, SFTP paths, and editor files on the next launch. Periodically auto-saved.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "sessionScrollbackLines",
    label: "Scrollback history",
    description: "How many lines of terminal output to save and restore per session.",
    category: "General",
    controlType: "Select",
    options: [
      { value: "200", label: "200 lines" },
      { value: "500", label: "500 lines" },
      { value: "1000", label: "1 000 lines" },
      { value: "2000", label: "2 000 lines" },
      { value: "5000", label: "5 000 lines" },
      { value: "0", label: "Full scrollback" },
    ],
  },
  {
    id: "checkForUpdates",
    label: "Check for updates on launch",
    description: "Show an update button in the titlebar when a new version is available.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "defaultStartupTab",
    label: "Default opening tab",
    description: "Which tab opens when Labonair launches. Takes effect on next launch.",
    category: "General",
    controlType: "Select",
    options: [
      { value: "host-manager", label: "Host Manager" },
      { value: "terminal", label: "Local Terminal" },
    ],
  },
  {
    id: "startupTerminalCount",
    label: "Startup terminal count",
    description: "How many terminal tabs to open on launch (when default tab is terminal).",
    category: "General",
    controlType: "Select",
    options: [
      { value: "1", label: "1 tab" },
      { value: "2", label: "2 tabs" },
      { value: "3", label: "3 tabs" },
    ],
  },
  {
    id: "scrollbackMaxSizeMb",
    label: "Max scrollback size (MB)",
    description: "Largest per-session scrollback buffer saved to disk (1–50 MB).",
    category: "General",
    controlType: "NumberInput",
  },
  {
    id: "scrollbackRetentionDays",
    label: "Scrollback retention",
    description: "Automatically delete saved scrollback older than this many days.",
    category: "General",
    controlType: "Select",
    options: [
      { value: "0", label: "Never" },
      { value: "7", label: "7 days" },
      { value: "30", label: "30 days" },
      { value: "90", label: "90 days" },
      { value: "365", label: "1 year" },
    ],
  },
  {
    id: "credentialEncryption",
    label: "Encrypt stored credentials",
    description:
      "Credentials are encrypted on disk using an app-managed AES-256-GCM key. No master password required — encryption and decryption happen automatically.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "confirmQuitWithSsh",
    label: "Confirm quit with active SSH connections",
    description: "Show a confirmation dialog before closing the app when SSH sessions are open.",
    category: "Appearance & Layout",
    controlType: "Switch",
  },
  {
    id: "newTabInheritsCwd",
    label: "New tab inherits current directory",
    description:
      "Open new terminal tabs in the working directory of the active tab instead of the home directory.",
    category: "Appearance & Layout",
    controlType: "Switch",
  },
  {
    id: "confirmCloseTerminalTab",
    label: "Confirm before closing terminal tab",
    description: "Show a confirmation dialog when closing a terminal tab with a running shell.",
    category: "Appearance & Layout",
    controlType: "Switch",
  },
  {
    id: "reduceMotion",
    label: "Reduce motion",
    description: "Disable all UI animations. Useful for motion sensitivity or older hardware.",
    category: "General",
    controlType: "Switch",
  },
  {
    id: "notifyOnErrors",
    label: "Notify on errors",
    description: "Show a notification whenever an error occurs. Disabled by default.",
    category: "General",
    controlType: "Switch",
  },

  // --- Appearance ---
  {
    id: "appCornerRadius",
    label: "Corner radius",
    description: "Border radius for buttons, cards, and inputs (0–20 px).",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "appDensity",
    label: "Density",
    description: "Adjust the vertical spacing of UI elements.",
    category: "Appearance & Layout",
    controlType: "Select",
    options: [
      { value: "compact", label: "Compact" },
      { value: "default", label: "Default" },
      { value: "relaxed", label: "Relaxed" },
    ],
  },

  // --- Command Palette ---
  {
    id: "commandPaletteBlur",
    label: "Background blur",
    description: "Blur strength (px) applied to the app behind the command palette overlay (0 = off).",
    category: "Command Palette",
    controlType: "NumberInput",
  },
  {
    id: "commandPaletteOpacity",
    label: "Palette opacity",
    description: "Opacity of the command palette panel (60–100%).",
    category: "Command Palette",
    controlType: "NumberInput",
  },
  {
    id: "commandPalettePosition",
    label: "Open position",
    description: "Vertical position of the palette when it opens.",
    category: "Command Palette",
    controlType: "Select",
    options: [
      { value: "top", label: "Top (15%)" },
      { value: "high", label: "High (8%)" },
      { value: "center", label: "Center" },
    ],
  },
  {
    id: "commandPaletteAnimation",
    label: "Animation speed",
    description: "Speed of open/close and page-slide animations.",
    category: "Command Palette",
    controlType: "Select",
    options: [
      { value: "fast", label: "Fast" },
      { value: "normal", label: "Normal" },
      { value: "slow", label: "Slow" },
      { value: "none", label: "None" },
    ],
  },
  {
    id: "commandPaletteShowRecent",
    label: "Show recent commands",
    description: "Display recently used commands at the top of the palette.",
    category: "Command Palette",
    controlType: "Switch",
  },
  {
    id: "commandPaletteHistorySize",
    label: "Recent history size",
    description: "How many recently used commands to remember (3–20).",
    category: "Command Palette",
    controlType: "NumberInput",
  },
  {
    id: "commandPaletteSearchMode",
    label: "Search mode",
    description: "How search queries are matched against command names.",
    category: "Command Palette",
    controlType: "Select",
    options: [
      { value: "contains", label: "Contains" },
      { value: "startsWith", label: "Starts with" },
      { value: "fuzzy", label: "Fuzzy" },
    ],
  },
  {
    id: "commandPaletteCloseOnOverlayClick",
    label: "Close on outside click",
    description: "Close the palette when clicking outside of it.",
    category: "Command Palette",
    controlType: "Switch",
  },

  // --- Appearance ---
  {
    id: "appTheme",
    label: "Color theme",
    description:
      "Choose or import a JSON color theme for the application. Each theme bundles both a light and a dark variant.",
    category: "Appearance & Layout",
    controlType: "Custom",
  },
  {
    id: "theme",
    label: "Color scheme",
    description:
      "Switch between light, dark, or system-default appearance. This also selects which variant of the active color theme is shown.",
    category: "Appearance & Layout",
    controlType: "Select",
    options: [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    id: "appFontFamily",
    label: "UI font family",
    description: "The font used for all application UI text.",
    category: "Appearance & Layout",
    controlType: "Input",
  },
  {
    id: "appFontSize",
    label: "UI font size",
    description: "Base font size for the application interface (in px).",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "appLineHeight",
    label: "UI line height",
    description: "Line height multiplier for the application interface.",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "backgroundImage",
    label: "Background image",
    description: "The wallpaper image displayed behind the app UI.",
    category: "Appearance & Layout",
    controlType: "Input",
  },
  {
    id: "backgroundOpacity",
    label: "Wallpaper opacity",
    description: "Higher values reveal more of the background.",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "backgroundBlur",
    label: "Image blur",
    description: "Gaussian blur applied to the wallpaper.",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "backgroundTintColor",
    label: "Tint color",
    description: "Pick the overlay color.",
    category: "Appearance & Layout",
    controlType: "Input",
  },
  {
    id: "backgroundTintOpacity",
    label: "Color tint",
    description: "Overlay color blended on top of the background image.",
    category: "Appearance & Layout",
    controlType: "NumberInput",
  },
  {
    id: "zenModeShowHeader",
    label: "Show header bar",
    description: "Display the header bar with tabs and window controls. Hide it to maximise vertical space.",
    category: "Appearance & Layout",
    controlType: "Switch",
  },
  {
    id: "zenModeShowStatusbar",
    label: "Show status bar",
    description: "Display the status bar at the bottom. Hide it to maximise vertical space.",
    category: "Appearance & Layout",
    controlType: "Switch",
  },
  {
    id: "tabsLocation",
    label: "Tab bar location",
    description: "Display the tab bar in the titlebar or move it into the sidebar panel.",
    category: "Appearance & Layout",
    controlType: "Select",
    options: [
      { value: "titlebar", label: "Titlebar" },
      { value: "sidebar", label: "Sidebar" },
    ],
  },

  // --- Terminal ---
  {
    id: "terminalFontFamily",
    label: "Terminal font family",
    description: "Monospace font for the terminal emulator.",
    category: "Terminal",
    controlType: "Input",
  },
  {
    id: "terminalFontSize",
    label: "Terminal font size",
    description: "Font size used in the terminal (in px).",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "terminalCursorStyle",
    label: "Cursor style",
    description: "Shape of the cursor in the terminal.",
    category: "Terminal",
    controlType: "Select",
    options: [
      { value: "block", label: "Block" },
      { value: "underline", label: "Underline" },
      { value: "bar", label: "Bar" },
    ],
  },
  {
    id: "terminalComposerEnabled",
    label: "Command composer",
    description:
      "Show a command input for the active terminal in the bottom bar, with history-based suggestions. Works independently of AI.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalComposerHistoryPopup",
    label: "History popup",
    description:
      "Pressing ↑ in the command composer opens a scrollable history menu instead of cycling commands inline.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalComposerArgumentCompletion",
    label: "Argument completion",
    description:
      "When ghost-text is ambiguous, show a per-argument suggestion list below the cursor. Tab fills and cycles through candidates; arrow keys scroll the list.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalBlocksEnabled",
    label: "Block terminal",
    description:
      "Group each executed command and its output into a collapsible block with cwd, exit code, and duration. Requires the command composer.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalBlocksAutoCollapseOnAltScreen",
    label: "Auto-collapse blocks for full-screen apps",
    description: "Suppress block chrome while a full-screen terminal app (vim, htop, less, …) is running.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalCursorBlink",
    label: "Cursor blink",
    description: "Animate the terminal cursor with a blinking effect.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalCursorBlinkInterval",
    label: "Cursor blink interval",
    description:
      "Duration of one blink cycle in milliseconds (200–2000 ms). Only applies when cursor blink is enabled.",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "terminalBell",
    label: "Terminal bell",
    description: "Play a sound when the terminal bell character (BEL) is received.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalFontWeight",
    label: "Font weight",
    description: "Weight of the text rendered in the terminal.",
    category: "Terminal",
    controlType: "Select",
    options: [
      { value: "normal", label: "Normal" },
      { value: "medium", label: "Medium" },
      { value: "bold", label: "Bold" },
    ],
  },
  {
    id: "terminalLetterSpacing",
    label: "Letter spacing",
    description: "Horizontal spacing between characters (in px).",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "terminalLineHeight",
    label: "Line height",
    description: "Vertical spacing between lines in the terminal.",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "terminalScrollback",
    label: "Scrollback buffer",
    description: "Number of lines kept in the terminal history.",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "sshAutoReconnect",
    label: "Auto-reconnect SSH sessions",
    description: "Automatically retry when an SSH connection is lost unexpectedly.",
    category: "Connections",
    controlType: "Switch",
  },
  {
    id: "sshAutoReconnectDelay",
    label: "Reconnect delay (s)",
    description: "Seconds to wait before the first reconnect attempt (1–30).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "sshAutoReconnectMaxAttempts",
    label: "Max reconnect attempts",
    description: "Give up after this many failed attempts (1–10).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "sshConnectTimeoutSecs",
    label: "Connect timeout (s)",
    description: "How long to wait for the initial TCP connection before giving up (3–60 s).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "mcpBridgeEnabled",
    label: "Enable agent bridge",
    description:
      "Lets an external agent you run locally (e.g. the claude CLI) list and run commands in SSH tabs you explicitly grant it access to.",
    category: "Connections",
    controlType: "Switch",
  },
  {
    id: "mcpBridgePort",
    label: "Agent bridge port",
    description: "Local port the AI Agent Bridge listens on (1024–65535).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "mcpMaxCommandTimeoutSecs",
    label: "Agent bridge max command timeout (s)",
    description:
      "Upper bound on how long a single agent-run command may block before returning still_running.",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "mcpAutoRevokeMinutes",
    label: "Agent bridge auto-revoke (min)",
    description:
      "Automatically revoke a granted tab after this many minutes of no agent activity. 0 disables auto-revoke.",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "mcpNotifyOnActivity",
    label: "Notify on agent activity",
    description:
      "Show a notification every time the AI Agent Bridge runs a command, sends keys, or opens/closes a tab.",
    category: "Connections",
    controlType: "Switch",
  },
  {
    id: "terminalShowPaneHeader",
    label: "Show pane headers",
    description: "Display a header bar above each terminal pane in split-pane workspaces.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalShowPaneFooter",
    label: "Show pane footer",
    description: "Display a bottom margin below each terminal workspace.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalUseWebGL",
    label: "Use WebGL renderer",
    description:
      "Accelerates terminal rendering using your GPU. Turn off if terminal text flickers, appears blurry, or causes graphics issues. Applies to new terminal sessions.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalShell",
    label: "Shell path",
    description:
      "Full path to the shell binary. Leave empty to use the system default ($SHELL). Applies to new terminal sessions.",
    category: "Terminal",
    controlType: "Input",
  },
  {
    id: "terminalDefaultPath",
    label: "Default working directory",
    description:
      "Path opened when a new terminal tab starts. Leave empty to use $HOME. Ignored when 'Inherit cwd from current tab' is enabled.",
    category: "Terminal",
    controlType: "Input",
  },
  {
    id: "terminalCopyOnSelect",
    label: "Copy on select",
    description: "Automatically copy selected text to the clipboard.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalRightClickPastes",
    label: "Right-click pastes",
    description: "Paste clipboard content on right-click instead of showing a context menu.",
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "terminalWordSeparator",
    label: "Word separators",
    description: "Characters treated as word boundaries when double-clicking to select.",
    category: "Terminal",
    controlType: "Input",
  },
  {
    id: "terminalScrollSensitivity",
    label: "Scroll sensitivity",
    description: "Number of lines scrolled per mouse wheel tick.",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "terminalFastScrollModifier",
    label: "Fast scroll modifier",
    description: "Hold this key to scroll faster. Applies to new terminal sessions.",
    category: "Terminal",
    controlType: "Select",
    options: [
      { value: "none", label: "None" },
      { value: "alt", label: "Alt" },
      { value: "ctrl", label: "Ctrl" },
      { value: "shift", label: "Shift" },
    ],
  },

  // --- Editor ---
  {
    id: "vimMode",
    label: "Vim mode",
    description: "Enable Vim keybindings in the code editor.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorTheme",
    label: "Syntax theme",
    description: "Syntax highlighting color theme for the code editor.",
    category: "Editor",
    controlType: "Select",
    options: [
      { value: "atomone", label: "Atom One" },
      { value: "aura", label: "Aura" },
      { value: "copilot", label: "Copilot" },
      { value: "github-dark", label: "GitHub Dark" },
      { value: "github-light", label: "GitHub Light" },
      { value: "nord", label: "Nord" },
      { value: "tokyo-night", label: "Tokyo Night" },
      { value: "xcode-dark", label: "Xcode Dark" },
      { value: "xcode-light", label: "Xcode Light" },
    ],
  },
  {
    id: "editorFontFamily",
    label: "Editor font family",
    description: "Monospace font used in the code editor.",
    category: "Editor",
    controlType: "Input",
  },
  {
    id: "editorLineHeight",
    label: "Editor line height",
    description: "Vertical spacing between lines in the code editor (1.0 – 3.0).",
    category: "Editor",
    controlType: "NumberInput",
  },
  {
    id: "editorIndentWithTabs",
    label: "Indent with tabs",
    description: "Use tab characters for indentation instead of spaces.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorTrimTrailingWhitespace",
    label: "Trim trailing whitespace",
    description: "Remove trailing whitespace from each line when saving.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorInsertFinalNewline",
    label: "Insert final newline",
    description: "Ensure files end with a newline character when saving.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorAutocompleteDebounceMs",
    label: "Autocomplete debounce (ms)",
    description: "Delay in milliseconds before autocomplete suggestions are triggered (50 – 2000 ms).",
    category: "Editor",
    controlType: "NumberInput",
  },
  {
    id: "editorAutoSave",
    label: "Auto save",
    description: "Automatically save files when idle or on focus change.",
    category: "Editor",
    controlType: "Select",
    options: [
      { value: "off", label: "Off" },
      { value: "afterDelay", label: "After delay (5s)" },
      { value: "onFocusChange", label: "On focus change" },
    ],
  },
  {
    id: "editorAutoSaveDelay",
    label: "Auto save delay",
    description: "Milliseconds of inactivity before the file is auto-saved (100 – 60 000 ms).",
    category: "Editor",
    controlType: "NumberInput",
  },
  {
    id: "editorTabSize",
    label: "Tab size",
    description: "Number of spaces per indentation level.",
    category: "Editor",
    controlType: "Select",
    options: [
      { value: "2", label: "2 spaces" },
      { value: "4", label: "4 spaces" },
      { value: "8", label: "8 spaces" },
    ],
  },
  {
    id: "editorLineNumbers",
    label: "Line numbers",
    description: "Show line numbers in the gutter of the code editor.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorWordWrap",
    label: "Word wrap",
    description: "Wrap long lines to fit within the editor viewport.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorBracketMatching",
    label: "Bracket matching",
    description: "Highlight matching brackets and parentheses.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorShowCursorPosition",
    label: "Cursor position",
    description: "Display the current line and column in the status bar while editing.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorShowSelectionStats",
    label: "Selection stats",
    description: "Show selected character and line count in the editor toolbar.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorShowOutline",
    label: "Outline panel",
    description: "Show a document outline panel with headings and symbol names.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorFormatOnSave",
    label: "Format on Save",
    description:
      "Automatically format the document with Prettier when saving (Cmd+S). Also triggered by Cmd+Shift+F.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorIndentationGuides",
    label: "Indentation guides",
    description: "Show vertical guide lines at each indentation level.",
    category: "Editor",
    controlType: "Switch",
  },
  {
    id: "editorMaxFileSizeMb",
    label: "Max file size (MB)",
    description: "Largest local file the editor (and AI file-read tools) will open (1–100 MB).",
    category: "Editor",
    controlType: "NumberInput",
  },

  // --- File Manager ---
  {
    id: "sftpShowHiddenFiles",
    label: "Show hidden files",
    description: "Display files and folders starting with a dot (e.g. .bashrc, .ssh).",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpShowUpFolder",
    label: "Show '..' up-folder entry",
    description: "Show a '..' entry at the top of each directory to navigate to the parent folder.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpColumnSize",
    label: "Show Size column",
    description: "Display the file size column in the file list.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpColumnModified",
    label: "Show Modified column",
    description: "Display the last modified date column in the file list.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpColumnPermissions",
    label: "Show Permissions column",
    description: "Display the Unix permissions column in the file list.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpColumnType",
    label: "Show Type column",
    description: "Display the file type / extension column in the file list.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpRemoteEditShowTransfers",
    label: "Show remote edit transfers",
    description:
      "Display temporary download and upload operations when editing remote files in the transfers panel.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "sftpMaxRemoteFileSizeMb",
    label: "Max remote file size (MB)",
    description: "Largest remote file that can be opened for in-app editing or AI attachment (1–100 MB).",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "sftpMaxConcurrentTransfers",
    label: "Concurrent transfers",
    description: "How many uploads/downloads run at the same time (1–6).",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "sftpDefaultConflictResolution",
    label: "On name conflict",
    description: "What to do automatically when a transfer target already exists.",
    category: "File Manager",
    controlType: "Select",
    options: [
      { value: "ask", label: "Always ask" },
      { value: "overwrite", label: "Always overwrite" },
      { value: "skip", label: "Always skip" },
    ],
  },
  {
    id: "sftpChunkSizeKb",
    label: "Transfer chunk size (KB)",
    description: "Size of each read/write chunk during file transfers (16–1024 KB).",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "sftpOnFolderFileError",
    label: "On file error in folder transfers",
    description:
      'What to do when an individual file fails during a folder transfer. "Always ask" shows the failing file and lets you abort, skip it, or skip all remaining errors in that transfer.',
    category: "File Manager",
    controlType: "Select",
    options: [
      { value: "ask", label: "Always ask" },
      { value: "skip", label: "Always skip" },
      { value: "abort", label: "Always abort" },
    ],
  },
  {
    id: "explorerShowHiddenByDefault",
    label: "Explorer: Show hidden files by default",
    description: "Start the sidebar file tree with hidden files visible (applies to local and remote hosts).",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "explorerRemotePollInterval",
    label: "Explorer: Remote refresh interval",
    description:
      "How often the sidebar file tree re-polls an SSH host's expanded folders for changes (SFTP has no live watch).",
    category: "Connections",
    controlType: "Select",
    options: [
      { value: "10", label: "Every 10 seconds" },
      { value: "20", label: "Every 20 seconds" },
      { value: "30", label: "Every 30 seconds" },
      { value: "60", label: "Every minute" },
      { value: "0", label: "Never" },
    ],
  },
  {
    id: "explorerAutoReconnect",
    label: "Explorer: Auto-reconnect remote sessions",
    description:
      "Automatically retry the sidebar's SSH browsing connection when it drops unexpectedly, using the SSH reconnect delay/attempts below.",
    category: "Connections",
    controlType: "Switch",
  },
  {
    id: "explorerIdleSessionTimeoutMin",
    label: "Explorer: Idle session timeout (min)",
    description:
      "Disconnect a background SSH browsing session after it has had no active viewer for this many minutes (1–30).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "explorerMaxIdleSessions",
    label: "Explorer: Max cached remote sessions",
    description:
      "How many idle SSH browsing connections the sidebar keeps warm before disconnecting the oldest (1–10).",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "explorerMaxCachedRemoteScopes",
    label: "Explorer: Max cached remote folders",
    description:
      "How many recently-viewed SSH host directory trees the sidebar keeps in memory for instant tab-switching (1–20). Higher uses more memory; lower re-fetches more often. Hosts with a currently open tab are always kept regardless of this number.",
    category: "Connections",
    controlType: "NumberInput",
  },
  {
    id: "hostPingInterval",
    label: "Ping interval",
    description:
      "How often to check whether each host is reachable. Set to Never to disable availability checks.",
    category: "Connections",
    controlType: "Select",
    options: [
      { value: "10", label: "Every 10 seconds" },
      { value: "30", label: "Every 30 seconds" },
      { value: "60", label: "Every minute" },
      { value: "120", label: "Every 2 minutes" },
      { value: "300", label: "Every 5 minutes" },
      { value: "0", label: "Never" },
    ],
  },

  // --- Source Control ---
  {
    id: "gitStatusPollIntervalMs",
    label: "Source Control refresh interval",
    description:
      "How often Source Control polls for status changes (in ms). Remote repositories over SSH automatically use a longer effective interval since each check is a network round-trip.",
    category: "Source Control",
    controlType: "NumberInput",
  },

  // --- AI ---
  {
    id: "aiEnabled",
    label: "AI features",
    description: "Enable or disable all AI features in the app.",
    category: "AI",
    controlType: "Switch",
  },
  {
    id: "autocompleteEnabled",
    label: "Editor autocomplete",
    description: "Enable ultra-fast inline suggestions powered by Cerebras, Groq, or a local model.",
    category: "AI",
    controlType: "Switch",
  },
  {
    id: "autocompleteProvider",
    label: "Autocomplete provider",
    description: "Which provider powers inline editor autocomplete suggestions.",
    category: "AI",
    controlType: "Select",
  },
  {
    id: "autocompleteModelId",
    label: "Autocomplete model ID",
    description: "The model ID used for editor autocomplete requests to the selected provider.",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "lmstudioBaseURL",
    label: "LM Studio: Base URL",
    description: "URL of your local LM Studio HTTP server (Developer tab → Enable server).",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "lmstudioChatModelId",
    label: "LM Studio: Model ID",
    description:
      "The model ID loaded in LM Studio, used for AI chat when LM Studio is the selected provider.",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "openaiCompatibleBaseURL",
    label: "OpenAI-compatible: Base URL",
    description: "Any OpenAI-compatible HTTPS endpoint — vLLM, Z.AI, Fireworks, hosted Ollama, etc.",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "openaiCompatibleModelId",
    label: "OpenAI-compatible: Model ID",
    description: "The model ID to request from the configured OpenAI-compatible endpoint.",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "customInstructions",
    label: "Custom instructions",
    description: "Personal instructions appended to Labonair's system prompt for every AI conversation.",
    category: "AI",
    controlType: "Input",
  },
  {
    id: "aiWarnDestructiveCommands",
    label: "Warn on destructive commands",
    description:
      "Show an amber warning badge on the approval card when the AI tries to run rm -rf, DROP TABLE, git reset --hard, or similar.",
    category: "AI",
    controlType: "Switch",
  },
  {
    id: "aiMaxAgentSteps",
    label: "Max agent steps",
    description:
      "Maximum number of tool-use steps the agent may take before stopping. Lower = faster, more predictable. Higher = can handle complex multi-step tasks.",
    category: "AI",
    controlType: "NumberInput",
  },
  {
    id: "aiTemperature",
    label: "Temperature",
    description: "Controls response creativity. 0.0 = deterministic, 1.0 = more varied. Default 0.7.",
    category: "AI",
    controlType: "NumberInput",
  },
  {
    id: "aiTerminalContextLines",
    label: "Terminal context lines",
    description: "How many lines of terminal output are sent to the AI with each message.",
    category: "AI",
    controlType: "NumberInput",
  },
  {
    id: "aiShellMaxTimeoutSecs",
    label: "Max command timeout (s)",
    description: "Upper bound on how long the AI's run_command tool may wait for a command (30–1800 s).",
    category: "AI",
    controlType: "NumberInput",
  },
  {
    id: "aiShellMaxOutputKb",
    label: "Max command output (KB)",
    description: "Upper bound on captured stdout/stderr from the AI's run_command tool (64–2048 KB).",
    category: "AI",
    controlType: "NumberInput",
  },

  // --- Bookmarks ---
  {
    id: "bookmarksEnabled",
    label: "Enable path bookmarks",
    description:
      "Save frequently-used local or host folders and jump to them from the titlebar, breadcrumb, SFTP, and Explorer context menus.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "bookmarksActionNewTerminal",
    label: "Open in new terminal",
    description: "Show the action to open a bookmark in a brand-new terminal tab.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "bookmarksActionCurrentTerminal",
    label: "Open in current terminal",
    description: "Show the action to cd the currently focused terminal to a bookmark's path.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "bookmarksActionCurrentSftp",
    label: "Open in current SFTP manager",
    description: "Show the action to navigate the currently open SFTP tab to a bookmark's path.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "bookmarksActionNewSftp",
    label: "Open in new SFTP tab",
    description:
      "Show the action to open a host bookmark in a brand-new SFTP tab. Never shown for local bookmarks.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "bookmarksPrimaryClickBehavior",
    label: "Primary click opens",
    description:
      "What clicking a bookmark's path itself does — reuse the current tab/pane, or always open a new one.",
    category: "Bookmarks",
    controlType: "Select",
    options: [
      { value: "current", label: "Current tab/pane" },
      { value: "new", label: "New tab" },
    ],
  },
  {
    id: "bookmarksShowBadge",
    label: "Show bookmark count badge",
    description: "Display a small count badge on the titlebar bookmarks icon.",
    category: "Bookmarks",
    controlType: "Switch",
  },
  {
    id: "barItemPlacements",
    label: "Customize titlebar, statusbar & panel layout",
    description:
      "Reposition or hide badges, panels, and info items across the titlebar and statusbar, or reset to defaults.",
    category: "Appearance & Layout",
    controlType: "Custom",
    targetTab: "appearance",
    linkLabel: "Open Appearance",
  },
];

export const SETTING_CATEGORIES: SettingCategory[] = [
  "General",
  "Appearance & Layout",
  "Terminal",
  "Editor",
  "Command Palette",
  "File Manager",
  "Connections",
  "Source Control",
  "AI",
  "Directives",
  "Bookmarks",
  "About",
];
