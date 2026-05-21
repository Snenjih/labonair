import type { PrefKey } from "./store";

export type SettingCategory =
  | "General"
  | "Appearance"
  | "Terminal"
  | "Editor"
  | "Command Palette"
  | "File Manager"
  | "Models"
  | "Agents"
  | "About";

export type ControlType =
  | "Switch"
  | "Select"
  | "Input"
  | "NumberInput"
  | "Custom";

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
    description: "Open Nexum automatically when you sign in.",
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
    description: "Which tab opens when Nexum launches. Takes effect on next launch.",
    category: "General",
    controlType: "Select",
    options: [
      { value: "host-manager", label: "Host Manager" },
      { value: "terminal", label: "Local Terminal" },
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
    id: "terminalCursorBlink",
    label: "Cursor blink",
    description: "Animate the terminal cursor with a blinking effect.",
    category: "Terminal",
    controlType: "Switch",
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

  // --- Editor ---
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
    description: "Display temporary download and upload operations when editing remote files in the transfers panel.",
    category: "File Manager",
    controlType: "Switch",
  },
  {
    id: "hostPingInterval",
    label: "Ping interval",
    description: "How often to check whether each host is reachable. Set to Never to disable availability checks.",
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
];

export const SETTING_CATEGORIES: SettingCategory[] = [
  "General",
  "Appearance",
  "Terminal",
  "Editor",
  "Command Palette",
  "File Manager",
  "Models",
  "Agents",
  "About",
];
