import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_MODEL_ID,
  LMSTUDIO_DEFAULT_BASE_URL,
  type AutocompleteProviderId,
  type ModelId,
} from "@/modules/ai/config";

export type ThemePref = "system" | "light" | "dark";

export const EDITOR_THEMES = [
  "atomone",
  "aura",
  "copilot",
  "github-dark",
  "github-light",
  "nord",
  "tokyo-night",
  "xcode-dark",
  "xcode-light",
] as const;

export type EditorThemeId = (typeof EDITOR_THEMES)[number];

export const EDITOR_THEME_LABELS: Record<EditorThemeId, string> = {
  atomone: "Atom One",
  aura: "Aura",
  copilot: "Copilot",
  "github-dark": "GitHub Dark",
  "github-light": "GitHub Light",
  nord: "Nord",
  "tokyo-night": "Tokyo Night",
  "xcode-dark": "Xcode Dark",
  "xcode-light": "Xcode Light",
};

export type Preferences = {
  // --- General ---
  theme: ThemePref;
  defaultModelId: ModelId;
  editorTheme: EditorThemeId;
  customInstructions: string;
  autostart: boolean;
  restoreWindowState: boolean;
  autocompleteEnabled: boolean;
  autocompleteProvider: AutocompleteProviderId;
  autocompleteModelId: string;
  lmstudioBaseURL: string;
  vimMode: boolean;

  // --- App Appearance ---
  appTheme: string;
  appFontFamily: string;
  appFontSize: number;
  appLineHeight: number;

  // --- Terminal ---
  terminalCursorBlink: boolean;
  terminalCursorStyle: "block" | "underline" | "bar";
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalScrollback: number;
  terminalLetterSpacing: number;
  terminalLineHeight: number;
  terminalFontWeight: "normal" | "medium" | "bold";

  // --- Editor ---
  editorFontSize: number;
  editorAutoSave: "off" | "afterDelay" | "onFocusChange";
  editorLineNumbers: boolean;
  editorWordWrap: boolean;
  editorTabSize: 2 | 4 | 8;
  editorBracketMatching: boolean;

  // --- File Manager ---
  sftpFontSize: number;
  sftpShowHiddenFiles: boolean;
  sftpShowUpFolder: boolean;
  sftpColumnSize: boolean;
  sftpColumnModified: boolean;
  sftpColumnPermissions: boolean;
  sftpColumnType: boolean;

  // --- Sidebar ---
  sidebarPosition: "left" | "right";
};

const STORE_PATH = "nexum-settings.json";
const KEY_THEME = "theme";
const KEY_DEFAULT_MODEL = "defaultModelId";
const KEY_EDITOR_THEME = "editorTheme";
const KEY_CUSTOM_INSTRUCTIONS = "customInstructions";
const KEY_AUTOSTART = "autostart";
const KEY_RESTORE_WINDOW = "restoreWindowState";
const KEY_AUTOCOMPLETE_ENABLED = "autocompleteEnabled";
const KEY_AUTOCOMPLETE_PROVIDER = "autocompleteProvider";
const KEY_AUTOCOMPLETE_MODEL = "autocompleteModelId";
const KEY_LMSTUDIO_BASE_URL = "lmstudioBaseURL";
const KEY_VIM_MODE = "vimMode";

const KEY_APP_THEME = "appTheme";
const KEY_APP_FONT_FAMILY = "appFontFamily";
const KEY_APP_FONT_SIZE = "appFontSize";
const KEY_APP_LINE_HEIGHT = "appLineHeight";

const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_TERMINAL_CURSOR_STYLE = "terminalCursorStyle";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_SCROLLBACK = "terminalScrollback";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_LINE_HEIGHT = "terminalLineHeight";
const KEY_TERMINAL_FONT_WEIGHT = "terminalFontWeight";

const KEY_EDITOR_FONT_SIZE = "editorFontSize";
const KEY_EDITOR_AUTO_SAVE = "editorAutoSave";
const KEY_EDITOR_LINE_NUMBERS = "editorLineNumbers";
const KEY_EDITOR_WORD_WRAP = "editorWordWrap";
const KEY_EDITOR_TAB_SIZE = "editorTabSize";
const KEY_EDITOR_BRACKET_MATCHING = "editorBracketMatching";

const KEY_SFTP_FONT_SIZE = "sftpFontSize";
const KEY_SFTP_SHOW_HIDDEN = "sftpShowHiddenFiles";
const KEY_SFTP_SHOW_UP_FOLDER = "sftpShowUpFolder";
const KEY_SFTP_COLUMN_SIZE = "sftpColumnSize";
const KEY_SFTP_COLUMN_MODIFIED = "sftpColumnModified";
const KEY_SFTP_COLUMN_PERMISSIONS = "sftpColumnPermissions";
const KEY_SFTP_COLUMN_TYPE = "sftpColumnType";
const KEY_SIDEBAR_POSITION = "sidebarPosition";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  defaultModelId: DEFAULT_MODEL_ID,
  editorTheme: "atomone",
  customInstructions: "",
  autostart: false,
  restoreWindowState: true,
  autocompleteEnabled: false,
  autocompleteProvider: "cerebras",
  autocompleteModelId: DEFAULT_AUTOCOMPLETE_MODEL.cerebras,
  lmstudioBaseURL: LMSTUDIO_DEFAULT_BASE_URL,
  vimMode: false,

  appTheme: "default",
  appFontFamily: "system-ui",
  appFontSize: 13,
  appLineHeight: 1.5,

  terminalCursorBlink: true,
  terminalCursorStyle: "bar",
  terminalFontFamily: '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
  terminalFontSize: 14,
  terminalScrollback: 5000,
  terminalLetterSpacing: 0,
  terminalLineHeight: 1.05,
  terminalFontWeight: "normal",

  editorFontSize: 13,
  editorAutoSave: "off",
  editorLineNumbers: true,
  editorWordWrap: false,
  editorTabSize: 2,
  editorBracketMatching: true,

  sftpFontSize: 13,
  sftpShowHiddenFiles: false,
  sftpShowUpFolder: true,
  sftpColumnSize: true,
  sftpColumnModified: true,
  sftpColumnPermissions: true,
  sftpColumnType: false,

  sidebarPosition: "left",
};

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function loadPreferences(): Promise<Preferences> {
  const entries = await store.entries();
  const map = new Map<string, unknown>(entries);
  const get = <T>(k: string): T | undefined => map.get(k) as T | undefined;
  return {
    theme: get<ThemePref>(KEY_THEME) ?? DEFAULT_PREFERENCES.theme,
    defaultModelId:
      get<ModelId>(KEY_DEFAULT_MODEL) ?? DEFAULT_PREFERENCES.defaultModelId,
    editorTheme:
      get<EditorThemeId>(KEY_EDITOR_THEME) ?? DEFAULT_PREFERENCES.editorTheme,
    customInstructions:
      get<string>(KEY_CUSTOM_INSTRUCTIONS) ??
      DEFAULT_PREFERENCES.customInstructions,
    autostart: get<boolean>(KEY_AUTOSTART) ?? DEFAULT_PREFERENCES.autostart,
    restoreWindowState:
      get<boolean>(KEY_RESTORE_WINDOW) ??
      DEFAULT_PREFERENCES.restoreWindowState,
    autocompleteEnabled:
      get<boolean>(KEY_AUTOCOMPLETE_ENABLED) ??
      DEFAULT_PREFERENCES.autocompleteEnabled,
    autocompleteProvider:
      get<AutocompleteProviderId>(KEY_AUTOCOMPLETE_PROVIDER) ??
      DEFAULT_PREFERENCES.autocompleteProvider,
    autocompleteModelId:
      get<string>(KEY_AUTOCOMPLETE_MODEL) ??
      DEFAULT_PREFERENCES.autocompleteModelId,
    lmstudioBaseURL:
      get<string>(KEY_LMSTUDIO_BASE_URL) ??
      DEFAULT_PREFERENCES.lmstudioBaseURL,
    vimMode: get<boolean>(KEY_VIM_MODE) ?? DEFAULT_PREFERENCES.vimMode,

    appTheme: get<string>(KEY_APP_THEME) ?? DEFAULT_PREFERENCES.appTheme,
    appFontFamily:
      get<string>(KEY_APP_FONT_FAMILY) ?? DEFAULT_PREFERENCES.appFontFamily,
    appFontSize:
      get<number>(KEY_APP_FONT_SIZE) ?? DEFAULT_PREFERENCES.appFontSize,
    appLineHeight:
      get<number>(KEY_APP_LINE_HEIGHT) ?? DEFAULT_PREFERENCES.appLineHeight,

    terminalCursorBlink:
      get<boolean>(KEY_TERMINAL_CURSOR_BLINK) ??
      DEFAULT_PREFERENCES.terminalCursorBlink,
    terminalCursorStyle:
      get<"block" | "underline" | "bar">(KEY_TERMINAL_CURSOR_STYLE) ??
      DEFAULT_PREFERENCES.terminalCursorStyle,
    terminalFontFamily:
      get<string>(KEY_TERMINAL_FONT_FAMILY) ??
      DEFAULT_PREFERENCES.terminalFontFamily,
    terminalFontSize:
      get<number>(KEY_TERMINAL_FONT_SIZE) ?? DEFAULT_PREFERENCES.terminalFontSize,
    terminalScrollback:
      get<number>(KEY_TERMINAL_SCROLLBACK) ??
      DEFAULT_PREFERENCES.terminalScrollback,
    terminalLetterSpacing:
      get<number>(KEY_TERMINAL_LETTER_SPACING) ??
      DEFAULT_PREFERENCES.terminalLetterSpacing,
    terminalLineHeight:
      get<number>(KEY_TERMINAL_LINE_HEIGHT) ??
      DEFAULT_PREFERENCES.terminalLineHeight,
    terminalFontWeight:
      get<"normal" | "medium" | "bold">(KEY_TERMINAL_FONT_WEIGHT) ??
      DEFAULT_PREFERENCES.terminalFontWeight,

    editorFontSize:
      get<number>(KEY_EDITOR_FONT_SIZE) ?? DEFAULT_PREFERENCES.editorFontSize,
    editorAutoSave:
      get<"off" | "afterDelay" | "onFocusChange">(KEY_EDITOR_AUTO_SAVE) ??
      DEFAULT_PREFERENCES.editorAutoSave,
    editorLineNumbers:
      get<boolean>(KEY_EDITOR_LINE_NUMBERS) ??
      DEFAULT_PREFERENCES.editorLineNumbers,
    editorWordWrap:
      get<boolean>(KEY_EDITOR_WORD_WRAP) ?? DEFAULT_PREFERENCES.editorWordWrap,
    editorTabSize:
      get<2 | 4 | 8>(KEY_EDITOR_TAB_SIZE) ?? DEFAULT_PREFERENCES.editorTabSize,
    editorBracketMatching:
      get<boolean>(KEY_EDITOR_BRACKET_MATCHING) ??
      DEFAULT_PREFERENCES.editorBracketMatching,

    sftpFontSize:
      get<number>(KEY_SFTP_FONT_SIZE) ?? DEFAULT_PREFERENCES.sftpFontSize,
    sftpShowHiddenFiles:
      get<boolean>(KEY_SFTP_SHOW_HIDDEN) ?? DEFAULT_PREFERENCES.sftpShowHiddenFiles,
    sftpShowUpFolder:
      get<boolean>(KEY_SFTP_SHOW_UP_FOLDER) ?? DEFAULT_PREFERENCES.sftpShowUpFolder,
    sftpColumnSize:
      get<boolean>(KEY_SFTP_COLUMN_SIZE) ?? DEFAULT_PREFERENCES.sftpColumnSize,
    sftpColumnModified:
      get<boolean>(KEY_SFTP_COLUMN_MODIFIED) ?? DEFAULT_PREFERENCES.sftpColumnModified,
    sftpColumnPermissions:
      get<boolean>(KEY_SFTP_COLUMN_PERMISSIONS) ?? DEFAULT_PREFERENCES.sftpColumnPermissions,
    sftpColumnType:
      get<boolean>(KEY_SFTP_COLUMN_TYPE) ?? DEFAULT_PREFERENCES.sftpColumnType,

    sidebarPosition:
      get<"left" | "right">(KEY_SIDEBAR_POSITION) ??
      DEFAULT_PREFERENCES.sidebarPosition,
  };
}

export async function setTheme(value: ThemePref): Promise<void> {
  await store.set(KEY_THEME, value);
  await store.save();
}

export async function setDefaultModel(value: ModelId): Promise<void> {
  await store.set(KEY_DEFAULT_MODEL, value);
  await store.save();
}

export async function setEditorTheme(value: EditorThemeId): Promise<void> {
  await store.set(KEY_EDITOR_THEME, value);
  await store.save();
}

export async function setCustomInstructions(value: string): Promise<void> {
  await store.set(KEY_CUSTOM_INSTRUCTIONS, value);
  await store.save();
}

export async function setAutostart(value: boolean): Promise<void> {
  await store.set(KEY_AUTOSTART, value);
  await store.save();
}

export async function setRestoreWindowState(value: boolean): Promise<void> {
  await store.set(KEY_RESTORE_WINDOW, value);
  await store.save();
}

export async function setAutocompleteEnabled(value: boolean): Promise<void> {
  await store.set(KEY_AUTOCOMPLETE_ENABLED, value);
  await store.save();
}

export async function setAutocompleteProvider(
  value: AutocompleteProviderId,
): Promise<void> {
  await store.set(KEY_AUTOCOMPLETE_PROVIDER, value);
  await store.save();
}

export async function setAutocompleteModelId(value: string): Promise<void> {
  await store.set(KEY_AUTOCOMPLETE_MODEL, value);
  await store.save();
}

export async function setLmstudioBaseURL(value: string): Promise<void> {
  await store.set(KEY_LMSTUDIO_BASE_URL, value);
  await store.save();
}

export async function setVimMode(value: boolean): Promise<void> {
  await store.set(KEY_VIM_MODE, value);
  await store.save();
}

export async function setAppTheme(value: string): Promise<void> {
  await store.set(KEY_APP_THEME, value);
  await store.save();
}

export async function setAppFontFamily(value: string): Promise<void> {
  await store.set(KEY_APP_FONT_FAMILY, value);
  await store.save();
}

export async function setAppFontSize(value: number): Promise<void> {
  await store.set(KEY_APP_FONT_SIZE, value);
  await store.save();
}

export async function setAppLineHeight(value: number): Promise<void> {
  await store.set(KEY_APP_LINE_HEIGHT, value);
  await store.save();
}

export async function setTerminalCursorBlink(value: boolean): Promise<void> {
  await store.set(KEY_TERMINAL_CURSOR_BLINK, value);
  await store.save();
}

export async function setTerminalCursorStyle(
  value: "block" | "underline" | "bar",
): Promise<void> {
  await store.set(KEY_TERMINAL_CURSOR_STYLE, value);
  await store.save();
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await store.set(KEY_TERMINAL_FONT_FAMILY, value);
  await store.save();
}

export async function setTerminalFontSize(value: number): Promise<void> {
  await store.set(KEY_TERMINAL_FONT_SIZE, value);
  await store.save();
}

export async function setTerminalScrollback(value: number): Promise<void> {
  await store.set(KEY_TERMINAL_SCROLLBACK, value);
  await store.save();
}

export async function setTerminalLetterSpacing(value: number): Promise<void> {
  await store.set(KEY_TERMINAL_LETTER_SPACING, value);
  await store.save();
}

export async function setTerminalLineHeight(value: number): Promise<void> {
  await store.set(KEY_TERMINAL_LINE_HEIGHT, value);
  await store.save();
}

export async function setTerminalFontWeight(
  value: "normal" | "medium" | "bold",
): Promise<void> {
  await store.set(KEY_TERMINAL_FONT_WEIGHT, value);
  await store.save();
}

export async function setEditorFontSize(value: number): Promise<void> {
  await store.set(KEY_EDITOR_FONT_SIZE, value);
  await store.save();
}

export async function setEditorAutoSave(
  value: "off" | "afterDelay" | "onFocusChange",
): Promise<void> {
  await store.set(KEY_EDITOR_AUTO_SAVE, value);
  await store.save();
}

export async function setEditorLineNumbers(value: boolean): Promise<void> {
  await store.set(KEY_EDITOR_LINE_NUMBERS, value);
  await store.save();
}

export async function setEditorWordWrap(value: boolean): Promise<void> {
  await store.set(KEY_EDITOR_WORD_WRAP, value);
  await store.save();
}

export async function setEditorTabSize(value: 2 | 4 | 8): Promise<void> {
  await store.set(KEY_EDITOR_TAB_SIZE, value);
  await store.save();
}

export async function setEditorBracketMatching(value: boolean): Promise<void> {
  await store.set(KEY_EDITOR_BRACKET_MATCHING, value);
  await store.save();
}

export async function setSftpFontSize(value: number): Promise<void> {
  await store.set(KEY_SFTP_FONT_SIZE, value);
  await store.save();
}

export async function setSftpShowHiddenFiles(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_SHOW_HIDDEN, value);
  await store.save();
}

export async function setSftpShowUpFolder(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_SHOW_UP_FOLDER, value);
  await store.save();
}

export async function setSftpColumnSize(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_COLUMN_SIZE, value);
  await store.save();
}

export async function setSftpColumnModified(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_COLUMN_MODIFIED, value);
  await store.save();
}

export async function setSftpColumnPermissions(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_COLUMN_PERMISSIONS, value);
  await store.save();
}

export async function setSftpColumnType(value: boolean): Promise<void> {
  await store.set(KEY_SFTP_COLUMN_TYPE, value);
  await store.save();
}

export async function setSidebarPosition(
  value: "left" | "right",
): Promise<void> {
  await store.set(KEY_SIDEBAR_POSITION, value);
  await store.save();
}

export type PrefKey = keyof Preferences;

/** Subscribe to changes from any window (settings → main). */
export function onPreferencesChange(
  cb: (key: PrefKey, value: unknown) => void,
): Promise<UnlistenFn> {
  const map: Record<string, PrefKey> = {
    [KEY_THEME]: "theme",
    [KEY_DEFAULT_MODEL]: "defaultModelId",
    [KEY_EDITOR_THEME]: "editorTheme",
    [KEY_CUSTOM_INSTRUCTIONS]: "customInstructions",
    [KEY_AUTOSTART]: "autostart",
    [KEY_RESTORE_WINDOW]: "restoreWindowState",
    [KEY_AUTOCOMPLETE_ENABLED]: "autocompleteEnabled",
    [KEY_AUTOCOMPLETE_PROVIDER]: "autocompleteProvider",
    [KEY_AUTOCOMPLETE_MODEL]: "autocompleteModelId",
    [KEY_LMSTUDIO_BASE_URL]: "lmstudioBaseURL",
    [KEY_VIM_MODE]: "vimMode",

    [KEY_APP_THEME]: "appTheme",
    [KEY_APP_FONT_FAMILY]: "appFontFamily",
    [KEY_APP_FONT_SIZE]: "appFontSize",
    [KEY_APP_LINE_HEIGHT]: "appLineHeight",

    [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
    [KEY_TERMINAL_CURSOR_STYLE]: "terminalCursorStyle",
    [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
    [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
    [KEY_TERMINAL_SCROLLBACK]: "terminalScrollback",
    [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
    [KEY_TERMINAL_LINE_HEIGHT]: "terminalLineHeight",
    [KEY_TERMINAL_FONT_WEIGHT]: "terminalFontWeight",

    [KEY_EDITOR_FONT_SIZE]: "editorFontSize",
    [KEY_EDITOR_AUTO_SAVE]: "editorAutoSave",
    [KEY_EDITOR_LINE_NUMBERS]: "editorLineNumbers",
    [KEY_EDITOR_WORD_WRAP]: "editorWordWrap",
    [KEY_EDITOR_TAB_SIZE]: "editorTabSize",
    [KEY_EDITOR_BRACKET_MATCHING]: "editorBracketMatching",

    [KEY_SFTP_FONT_SIZE]: "sftpFontSize",
    [KEY_SFTP_SHOW_HIDDEN]: "sftpShowHiddenFiles",
    [KEY_SFTP_SHOW_UP_FOLDER]: "sftpShowUpFolder",
    [KEY_SFTP_COLUMN_SIZE]: "sftpColumnSize",
    [KEY_SFTP_COLUMN_MODIFIED]: "sftpColumnModified",
    [KEY_SFTP_COLUMN_PERMISSIONS]: "sftpColumnPermissions",
    [KEY_SFTP_COLUMN_TYPE]: "sftpColumnType",
    [KEY_SIDEBAR_POSITION]: "sidebarPosition",
  };
  return store.onChange<unknown>((key, value) => {
    const mapped = map[key];
    if (mapped) cb(mapped, value);
  });
}

// API key changes are stored in OS keychain (not the prefs store),
// so we broadcast via a Tauri event for cross-window listeners.
const KEYS_CHANGED_EVENT = "nexum://ai-keys-changed";

export async function emitKeysChanged(): Promise<void> {
  await emit(KEYS_CHANGED_EVENT);
}

export function onKeysChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(KEYS_CHANGED_EVENT, () => cb());
}
