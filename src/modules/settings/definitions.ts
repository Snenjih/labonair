import type { PrefKey } from "./store";

export type SettingCategory =
  | "General"
  | "Appearance"
  | "Terminal"
  | "Editor"
  | "Command Palette"
  | "File Manager"
  | "AI"
  | "Directives"
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
    id: "vimMode",
    label: "Vim mode",
    description: "Enable Vim keybindings in the code editor.",
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

  // --- Appearance ---
  {
    id: "appCornerRadius",
    label: "Corner radius",
    description: "Border radius for buttons, cards, and inputs (0–20 px).",
    category: "Appearance",
    controlType: "NumberInput",
  },
  {
    id: "appDensity",
    label: "Density",
    description: "Adjust the vertical spacing of UI elements.",
    category: "Appearance",
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
    id: "sidebarPosition",
    label: "Sidebar position",
    description: "Display the file explorer sidebar on the left or right side of the workspace.",
    category: "Appearance",
    controlType: "Select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
  },
  {
    id: "appTheme",
    label: "Color theme",
    description: "Choose or import a JSON color theme for the application.",
    category: "Appearance",
    controlType: "Custom",
  },
  {
    id: "theme",
    label: "Color scheme",
    description: "Switch between light, dark, or system-default appearance.",
    category: "Appearance",
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
    category: "Appearance",
    controlType: "Input",
  },
  {
    id: "appFontSize",
    label: "UI font size",
    description: "Base font size for the application interface (in px).",
    category: "Appearance",
    controlType: "NumberInput",
  },
  {
    id: "appLineHeight",
    label: "UI line height",
    description: "Line height multiplier for the application interface.",
    category: "Appearance",
    controlType: "NumberInput",
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
    category: "Terminal",
    controlType: "Switch",
  },
  {
    id: "sshAutoReconnectDelay",
    label: "Reconnect delay (s)",
    description: "Seconds to wait before the first reconnect attempt (1–30).",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "sshAutoReconnectMaxAttempts",
    label: "Max reconnect attempts",
    description: "Give up after this many failed attempts (1–10).",
    category: "Terminal",
    controlType: "NumberInput",
  },
  {
    id: "sshConnectTimeoutSecs",
    label: "Connect timeout (s)",
    description: "How long to wait for the initial TCP connection before giving up (3–60 s).",
    category: "Terminal",
    controlType: "NumberInput",
  },

  // --- Editor ---
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
      "What to do when an individual file fails during a folder transfer. \"Always ask\" shows the failing file and lets you abort, skip it, or skip all remaining errors in that transfer.",
    category: "File Manager",
    controlType: "Select",
    options: [
      { value: "ask", label: "Always ask" },
      { value: "skip", label: "Always skip" },
      { value: "abort", label: "Always abort" },
    ],
  },
  {
    id: "gitStatusPollIntervalMs",
    label: "Source Control refresh interval",
    description:
      "How often Source Control polls for status changes (in ms). Remote repositories over SSH automatically use a longer effective interval since each check is a network round-trip.",
    category: "File Manager",
    controlType: "NumberInput",
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
    category: "File Manager",
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
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "explorerIdleSessionTimeoutMin",
    label: "Explorer: Idle session timeout (min)",
    description:
      "Disconnect a background SSH browsing session after it has had no active viewer for this many minutes (1–30).",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "explorerMaxIdleSessions",
    label: "Explorer: Max cached remote sessions",
    description:
      "How many idle SSH browsing connections the sidebar keeps warm before disconnecting the oldest (1–10).",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "explorerMaxCachedRemoteScopes",
    label: "Explorer: Max cached remote folders",
    description:
      "How many recently-viewed SSH host directory trees the sidebar keeps in memory for instant tab-switching (1–20). Higher uses more memory; lower re-fetches more often. Hosts with a currently open tab are always kept regardless of this number.",
    category: "File Manager",
    controlType: "NumberInput",
  },
  {
    id: "hostPingInterval",
    label: "Ping interval",
    description:
      "How often to check whether each host is reachable. Set to Never to disable availability checks.",
    category: "General",
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

  // --- AI ---
  {
    id: "aiEnabled",
    label: "AI features",
    description: "Enable or disable all AI features in the app.",
    category: "AI",
    controlType: "Switch",
  },
  {
    id: "showEditPrediction",
    label: "Show edit completion",
    description: "Show inline ghost-text edit predictions in the code editor.",
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
];

export const SETTING_CATEGORIES: SettingCategory[] = [
  "General",
  "Appearance",
  "Terminal",
  "Editor",
  "Command Palette",
  "File Manager",
  "AI",
  "Directives",
  "About",
];
