import type { PrefKey } from "./store";

export type SettingCategory =
  | "General"
  | "Appearance"
  | "Terminal"
  | "Editor"
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

  // --- Appearance ---
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
    id: "editorTheme",
    label: "Editor color theme",
    description: "Syntax highlighting theme for the code editor.",
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
];

export const SETTING_CATEGORIES: SettingCategory[] = [
  "General",
  "Appearance",
  "Terminal",
  "Editor",
  "Models",
  "Agents",
  "About",
];
