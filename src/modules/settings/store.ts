import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { getStoragePaths } from "@/lib/paths";
import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_MODEL_ID,
  LMSTUDIO_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
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
  lmstudioChatModelId: string;
  openaiCompatibleBaseURL: string;
  openaiCompatibleModelId: string;
  vimMode: boolean;
  defaultStartupTab: "terminal" | "host-manager";
  sessionRestore: boolean;

  // --- App Appearance ---
  appTheme: string;
  appFontFamily: string;
  appFontSize: number;
  appLineHeight: number;
  backgroundImage: string;
  backgroundOpacity: number;
  backgroundBlur: number;

  // --- Terminal ---
  terminalShell: string;
  terminalDefaultPath: string;
  terminalCursorBlink: boolean;
  terminalCursorStyle: "block" | "underline" | "bar";
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalScrollback: number;
  terminalLetterSpacing: number;
  terminalLineHeight: number;
  terminalFontWeight: "normal" | "medium" | "bold";
  terminalShowPaneHeader: boolean;
  terminalShowPaneFooter: boolean;
  terminalUseWebGL: boolean;
  terminalBell: boolean;

  // --- Editor ---
  editorFontSize: number;
  editorFontFamily: string;
  editorLineHeight: number;
  editorAutoSave: "off" | "afterDelay" | "onFocusChange";
  editorAutoSaveDelay: number;
  editorLineNumbers: boolean;
  editorWordWrap: boolean;
  editorTabSize: 2 | 4 | 8;
  editorIndentWithTabs: boolean;
  editorBracketMatching: boolean;
  editorShowCursorPosition: boolean;
  editorShowSelectionStats: boolean;
  editorShowOutline: boolean;
  editorFormatOnSave: boolean;
  editorIndentationGuides: boolean;
  editorTrimTrailingWhitespace: boolean;
  editorInsertFinalNewline: boolean;
  editorAutocompleteDebounceMs: number;

  // --- File Manager ---
  sftpFontSize: number;
  sftpShowHiddenFiles: boolean;
  sftpShowUpFolder: boolean;
  sftpColumnSize: boolean;
  sftpColumnModified: boolean;
  sftpColumnPermissions: boolean;
  sftpColumnType: boolean;
  sftpRemoteEditShowTransfers: boolean;

  // --- Command Palette ---
  commandPaletteBlur: number;
  commandPaletteOpacity: number;
  commandPalettePosition: "top" | "center" | "high";
  commandPaletteAnimation: "fast" | "normal" | "slow" | "none";
  commandPaletteShowRecent: boolean;
  commandPaletteHistorySize: number;
  commandPaletteSearchMode: "contains" | "startsWith" | "fuzzy";
  commandPaletteCloseOnOverlayClick: boolean;

  // --- Sidebar ---
  sidebarPosition: "left" | "right";
  // --- Security ---
  credentialEncryption: boolean;
  // --- Updates ---
  checkForUpdates: boolean;

  // --- Host Manager ---
  hostPingInterval: number;
  hmLayout: "grid" | "list";
  hmSort: "last_connected" | "a_z" | "z_a";

  // --- AI ---
  aiEnabled: boolean;
  showEditPrediction: boolean;
  aiMaxAgentSteps: number;
  aiTerminalContextLines: number;
  aiTemperature: number;
  aiWarnDestructiveCommands: boolean;

  // --- Terminal (input / scrolling) ---
  terminalCopyOnSelect: boolean;
  terminalRightClickPastes: boolean;
  terminalWordSeparator: string;
  terminalScrollSensitivity: number;
  terminalFastScrollModifier: "none" | "alt" | "ctrl" | "shift";

  // --- Accessibility ---
  reduceMotion: boolean;

  // --- Tabs ---
  newTabInheritsCwd: boolean;
  confirmCloseTerminalTab: boolean;

  // --- Quit ---
  confirmQuitWithSsh: boolean;

  // --- Titlebar ---
  titlebarsIconsPosition: "auto" | "left" | "right";

  // --- Tabs ---
  tabsLocation: "titlebar" | "sidebar";
};

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
const KEY_LMSTUDIO_CHAT_MODEL_ID = "lmstudioChatModelId";
const KEY_OPENAI_COMPATIBLE_BASE_URL = "openaiCompatibleBaseURL";
const KEY_OPENAI_COMPATIBLE_MODEL_ID = "openaiCompatibleModelId";
const KEY_VIM_MODE = "vimMode";
const KEY_DEFAULT_STARTUP_TAB = "defaultStartupTab";
const KEY_SESSION_RESTORE = "sessionRestore";

const KEY_APP_THEME = "appTheme";
const KEY_APP_FONT_FAMILY = "appFontFamily";
const KEY_APP_FONT_SIZE = "appFontSize";
const KEY_APP_LINE_HEIGHT = "appLineHeight";
const KEY_BG_IMAGE = "backgroundImage";
const KEY_BG_OPACITY = "backgroundOpacity";
const KEY_BG_BLUR = "backgroundBlur";

const KEY_TERMINAL_SHELL = "terminalShell";
const KEY_TERMINAL_DEFAULT_PATH = "terminalDefaultPath";
const KEY_TERMINAL_CURSOR_BLINK = "terminalCursorBlink";
const KEY_TERMINAL_CURSOR_STYLE = "terminalCursorStyle";
const KEY_TERMINAL_FONT_FAMILY = "terminalFontFamily";
const KEY_TERMINAL_FONT_SIZE = "terminalFontSize";
const KEY_TERMINAL_SCROLLBACK = "terminalScrollback";
const KEY_TERMINAL_LETTER_SPACING = "terminalLetterSpacing";
const KEY_TERMINAL_LINE_HEIGHT = "terminalLineHeight";
const KEY_TERMINAL_FONT_WEIGHT = "terminalFontWeight";
const KEY_TERMINAL_SHOW_PANE_HEADER = "terminalShowPaneHeader";
const KEY_TERMINAL_SHOW_PANE_FOOTER = "terminalShowPaneFooter";
const KEY_TERMINAL_USE_WEBGL = "terminalUseWebGL";
const KEY_TERMINAL_BELL = "terminalBell";

const KEY_EDITOR_FONT_SIZE = "editorFontSize";
const KEY_EDITOR_FONT_FAMILY = "editor.fontFamily";
const KEY_EDITOR_LINE_HEIGHT = "editor.lineHeight";
const KEY_EDITOR_AUTO_SAVE = "editorAutoSave";
const KEY_EDITOR_AUTO_SAVE_DELAY = "editorAutoSaveDelay";
const KEY_EDITOR_LINE_NUMBERS = "editorLineNumbers";
const KEY_EDITOR_WORD_WRAP = "editorWordWrap";
const KEY_EDITOR_TAB_SIZE = "editorTabSize";
const KEY_EDITOR_INDENT_WITH_TABS = "editor.indentWithTabs";
const KEY_EDITOR_BRACKET_MATCHING = "editorBracketMatching";
const KEY_EDITOR_SHOW_CURSOR_POSITION = "editor.showCursorPosition";
const KEY_EDITOR_SHOW_SELECTION_STATS = "editor.showSelectionStats";
const KEY_EDITOR_SHOW_OUTLINE = "editor.showOutline";
const KEY_EDITOR_FORMAT_ON_SAVE = "editor.formatOnSave";
const KEY_EDITOR_INDENTATION_GUIDES = "editor.indentationGuides";
const KEY_EDITOR_TRIM_TRAILING_WHITESPACE = "editor.trimTrailingWhitespace";
const KEY_EDITOR_INSERT_FINAL_NEWLINE = "editor.insertFinalNewline";
const KEY_EDITOR_AUTOCOMPLETE_DEBOUNCE_MS = "editor.autocompleteDebounceMs";

const KEY_SFTP_FONT_SIZE = "sftpFontSize";
const KEY_SFTP_SHOW_HIDDEN = "sftpShowHiddenFiles";
const KEY_SFTP_SHOW_UP_FOLDER = "sftpShowUpFolder";
const KEY_SFTP_COLUMN_SIZE = "sftpColumnSize";
const KEY_SFTP_COLUMN_MODIFIED = "sftpColumnModified";
const KEY_SFTP_COLUMN_PERMISSIONS = "sftpColumnPermissions";
const KEY_SFTP_COLUMN_TYPE = "sftpColumnType";
const KEY_SFTP_REMOTE_EDIT_SHOW_TRANSFERS = "sftpRemoteEditShowTransfers";
const KEY_COMMAND_PALETTE_BLUR = "commandPaletteBlur";
const KEY_COMMAND_PALETTE_OPACITY = "commandPaletteOpacity";
const KEY_COMMAND_PALETTE_POSITION = "commandPalettePosition";
const KEY_COMMAND_PALETTE_ANIMATION = "commandPaletteAnimation";
const KEY_COMMAND_PALETTE_SHOW_RECENT = "commandPaletteShowRecent";
const KEY_COMMAND_PALETTE_HISTORY_SIZE = "commandPaletteHistorySize";
const KEY_COMMAND_PALETTE_SEARCH_MODE = "commandPaletteSearchMode";
const KEY_COMMAND_PALETTE_CLOSE_ON_OVERLAY = "commandPaletteCloseOnOverlayClick";

const KEY_SIDEBAR_POSITION = "sidebarPosition";

const KEY_CREDENTIAL_ENCRYPTION = "credentialEncryption";
const KEY_CHECK_FOR_UPDATES = "checkForUpdates";
const KEY_HOST_PING_INTERVAL = "hostPingInterval";
const KEY_HM_LAYOUT = "hmLayout";
const KEY_HM_SORT = "hmSort";
const KEY_AI_ENABLED = "aiEnabled";
const KEY_SHOW_EDIT_PREDICTION = "showEditPrediction";
const KEY_AI_MAX_AGENT_STEPS = "aiMaxAgentSteps";
const KEY_AI_TERMINAL_CONTEXT_LINES = "aiTerminalContextLines";
const KEY_AI_TEMPERATURE = "aiTemperature";
const KEY_AI_WARN_DESTRUCTIVE = "aiWarnDestructiveCommands";
const KEY_TERMINAL_COPY_ON_SELECT = "terminalCopyOnSelect";
const KEY_TERMINAL_RIGHT_CLICK_PASTES = "terminalRightClickPastes";
const KEY_TERMINAL_WORD_SEPARATOR = "terminalWordSeparator";
const KEY_TERMINAL_SCROLL_SENSITIVITY = "terminalScrollSensitivity";
const KEY_TERMINAL_FAST_SCROLL_MODIFIER = "terminalFastScrollModifier";
const KEY_REDUCE_MOTION = "reduceMotion";
const KEY_NEW_TAB_INHERITS_CWD = "newTabInheritsCwd";
const KEY_CONFIRM_CLOSE_TERMINAL_TAB = "confirmCloseTerminalTab";
const KEY_CONFIRM_QUIT_WITH_SSH = "confirmQuitWithSsh";
const KEY_TITLEBAR_ICONS_POSITION = "titlebarsIconsPosition";
const KEY_TABS_LOCATION = "tabsLocation";

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
  lmstudioChatModelId: "",
  openaiCompatibleBaseURL: OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  openaiCompatibleModelId: "",
  vimMode: false,
  defaultStartupTab: "host-manager",
  sessionRestore: false,

  appTheme: "default",
  appFontFamily: "system-ui",
  appFontSize: 13,
  appLineHeight: 1.5,
  backgroundImage: "",
  backgroundOpacity: 30,
  backgroundBlur: 0,

  terminalShell: "",
  terminalDefaultPath: "",
  terminalCursorBlink: true,
  terminalCursorStyle: "bar",
  terminalFontFamily: '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
  terminalFontSize: 14,
  terminalScrollback: 5000,
  terminalLetterSpacing: 0,
  terminalLineHeight: 1.05,
  terminalFontWeight: "normal",
  terminalShowPaneHeader: false,
  terminalShowPaneFooter: false,
  terminalUseWebGL: true,
  terminalBell: false,

  editorFontSize: 13,
  editorFontFamily: '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
  editorLineHeight: 1.55,
  editorAutoSave: "off",
  editorAutoSaveDelay: 1000,
  editorLineNumbers: true,
  editorWordWrap: false,
  editorTabSize: 2,
  editorIndentWithTabs: false,
  editorBracketMatching: true,
  editorShowCursorPosition: true,
  editorShowSelectionStats: true,
  editorShowOutline: false,
  editorFormatOnSave: false,
  editorIndentationGuides: true,
  editorTrimTrailingWhitespace: false,
  editorInsertFinalNewline: false,
  editorAutocompleteDebounceMs: 350,

  sftpFontSize: 13,
  sftpShowHiddenFiles: false,
  sftpShowUpFolder: true,
  sftpColumnSize: true,
  sftpColumnModified: true,
  sftpColumnPermissions: true,
  sftpColumnType: false,
  sftpRemoteEditShowTransfers: true,

  commandPaletteBlur: 4,
  commandPaletteOpacity: 95,
  commandPalettePosition: "top",
  commandPaletteAnimation: "normal",
  commandPaletteShowRecent: true,
  commandPaletteHistorySize: 5,
  commandPaletteSearchMode: "contains",
  commandPaletteCloseOnOverlayClick: true,

  sidebarPosition: "left",
  credentialEncryption: false,
  checkForUpdates: true,

  hostPingInterval: 60,
  hmLayout: "grid",
  hmSort: "last_connected",

  aiEnabled: true,
  showEditPrediction: true,
  aiMaxAgentSteps: 24,
  aiTerminalContextLines: 300,
  aiTemperature: 0.7,
  aiWarnDestructiveCommands: true,

  terminalCopyOnSelect: false,
  terminalRightClickPastes: false,
  terminalWordSeparator: " ()[]{}',\"`",
  terminalScrollSensitivity: 1,
  terminalFastScrollModifier: "alt",

  reduceMotion: false,
  newTabInheritsCwd: true,
  confirmCloseTerminalTab: false,
  confirmQuitWithSsh: true,

  titlebarsIconsPosition: "auto",

  tabsLocation: "titlebar",
};

let _storePromise: Promise<LazyStore> | null = null;
async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/nexum-settings.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

export async function loadPreferences(): Promise<Preferences> {
  const entries = await (await getStore()).entries();
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
    lmstudioChatModelId:
      get<string>(KEY_LMSTUDIO_CHAT_MODEL_ID) ??
      DEFAULT_PREFERENCES.lmstudioChatModelId,
    openaiCompatibleBaseURL:
      get<string>(KEY_OPENAI_COMPATIBLE_BASE_URL) ??
      DEFAULT_PREFERENCES.openaiCompatibleBaseURL,
    openaiCompatibleModelId:
      get<string>(KEY_OPENAI_COMPATIBLE_MODEL_ID) ??
      DEFAULT_PREFERENCES.openaiCompatibleModelId,
    vimMode: get<boolean>(KEY_VIM_MODE) ?? DEFAULT_PREFERENCES.vimMode,
    defaultStartupTab:
      get<"terminal" | "host-manager">(KEY_DEFAULT_STARTUP_TAB) ??
      DEFAULT_PREFERENCES.defaultStartupTab,
    sessionRestore:
      get<boolean>(KEY_SESSION_RESTORE) ?? DEFAULT_PREFERENCES.sessionRestore,

    appTheme: get<string>(KEY_APP_THEME) ?? DEFAULT_PREFERENCES.appTheme,
    appFontFamily:
      get<string>(KEY_APP_FONT_FAMILY) ?? DEFAULT_PREFERENCES.appFontFamily,
    appFontSize:
      get<number>(KEY_APP_FONT_SIZE) ?? DEFAULT_PREFERENCES.appFontSize,
    appLineHeight:
      get<number>(KEY_APP_LINE_HEIGHT) ?? DEFAULT_PREFERENCES.appLineHeight,
    backgroundImage:
      get<string>(KEY_BG_IMAGE) ?? DEFAULT_PREFERENCES.backgroundImage,
    backgroundOpacity:
      get<number>(KEY_BG_OPACITY) ?? DEFAULT_PREFERENCES.backgroundOpacity,
    backgroundBlur:
      get<number>(KEY_BG_BLUR) ?? DEFAULT_PREFERENCES.backgroundBlur,

    terminalShell:
      get<string>(KEY_TERMINAL_SHELL) ?? DEFAULT_PREFERENCES.terminalShell,
    terminalDefaultPath:
      get<string>(KEY_TERMINAL_DEFAULT_PATH) ?? DEFAULT_PREFERENCES.terminalDefaultPath,
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
    terminalShowPaneHeader:
      get<boolean>(KEY_TERMINAL_SHOW_PANE_HEADER) ??
      DEFAULT_PREFERENCES.terminalShowPaneHeader,
    terminalShowPaneFooter:
      get<boolean>(KEY_TERMINAL_SHOW_PANE_FOOTER) ??
      DEFAULT_PREFERENCES.terminalShowPaneFooter,
    terminalUseWebGL:
      get<boolean>(KEY_TERMINAL_USE_WEBGL) ??
      DEFAULT_PREFERENCES.terminalUseWebGL,
    terminalBell:
      get<boolean>(KEY_TERMINAL_BELL) ?? DEFAULT_PREFERENCES.terminalBell,

    editorFontSize:
      get<number>(KEY_EDITOR_FONT_SIZE) ?? DEFAULT_PREFERENCES.editorFontSize,
    editorFontFamily:
      get<string>(KEY_EDITOR_FONT_FAMILY) ?? DEFAULT_PREFERENCES.editorFontFamily,
    editorLineHeight: Math.min(
      3.0,
      Math.max(
        1.0,
        get<number>(KEY_EDITOR_LINE_HEIGHT) ?? DEFAULT_PREFERENCES.editorLineHeight,
      ),
    ),
    editorAutoSave:
      get<"off" | "afterDelay" | "onFocusChange">(KEY_EDITOR_AUTO_SAVE) ??
      DEFAULT_PREFERENCES.editorAutoSave,
    editorAutoSaveDelay: Math.min(
      60000,
      Math.max(
        100,
        get<number>(KEY_EDITOR_AUTO_SAVE_DELAY) ??
          DEFAULT_PREFERENCES.editorAutoSaveDelay,
      ),
    ),
    editorLineNumbers:
      get<boolean>(KEY_EDITOR_LINE_NUMBERS) ??
      DEFAULT_PREFERENCES.editorLineNumbers,
    editorWordWrap:
      get<boolean>(KEY_EDITOR_WORD_WRAP) ?? DEFAULT_PREFERENCES.editorWordWrap,
    editorTabSize:
      get<2 | 4 | 8>(KEY_EDITOR_TAB_SIZE) ?? DEFAULT_PREFERENCES.editorTabSize,
    editorIndentWithTabs:
      get<boolean>(KEY_EDITOR_INDENT_WITH_TABS) ?? DEFAULT_PREFERENCES.editorIndentWithTabs,
    editorBracketMatching:
      get<boolean>(KEY_EDITOR_BRACKET_MATCHING) ??
      DEFAULT_PREFERENCES.editorBracketMatching,
    editorShowCursorPosition:
      get<boolean>(KEY_EDITOR_SHOW_CURSOR_POSITION) ??
      DEFAULT_PREFERENCES.editorShowCursorPosition,
    editorShowSelectionStats:
      get<boolean>(KEY_EDITOR_SHOW_SELECTION_STATS) ??
      DEFAULT_PREFERENCES.editorShowSelectionStats,
    editorShowOutline:
      get<boolean>(KEY_EDITOR_SHOW_OUTLINE) ??
      DEFAULT_PREFERENCES.editorShowOutline,
    editorFormatOnSave:
      get<boolean>(KEY_EDITOR_FORMAT_ON_SAVE) ??
      DEFAULT_PREFERENCES.editorFormatOnSave,
    editorIndentationGuides:
      get<boolean>(KEY_EDITOR_INDENTATION_GUIDES) ??
      DEFAULT_PREFERENCES.editorIndentationGuides,
    editorTrimTrailingWhitespace:
      get<boolean>(KEY_EDITOR_TRIM_TRAILING_WHITESPACE) ??
      DEFAULT_PREFERENCES.editorTrimTrailingWhitespace,
    editorInsertFinalNewline:
      get<boolean>(KEY_EDITOR_INSERT_FINAL_NEWLINE) ??
      DEFAULT_PREFERENCES.editorInsertFinalNewline,
    editorAutocompleteDebounceMs: Math.min(
      2000,
      Math.max(
        50,
        get<number>(KEY_EDITOR_AUTOCOMPLETE_DEBOUNCE_MS) ??
          DEFAULT_PREFERENCES.editorAutocompleteDebounceMs,
      ),
    ),

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
    sftpRemoteEditShowTransfers:
      get<boolean>(KEY_SFTP_REMOTE_EDIT_SHOW_TRANSFERS) ?? DEFAULT_PREFERENCES.sftpRemoteEditShowTransfers,

    commandPaletteBlur:
      get<number>(KEY_COMMAND_PALETTE_BLUR) ??
      DEFAULT_PREFERENCES.commandPaletteBlur,
    commandPaletteOpacity:
      get<number>(KEY_COMMAND_PALETTE_OPACITY) ??
      DEFAULT_PREFERENCES.commandPaletteOpacity,
    commandPalettePosition:
      get<"top" | "center" | "high">(KEY_COMMAND_PALETTE_POSITION) ??
      DEFAULT_PREFERENCES.commandPalettePosition,
    commandPaletteAnimation:
      get<"fast" | "normal" | "slow" | "none">(KEY_COMMAND_PALETTE_ANIMATION) ??
      DEFAULT_PREFERENCES.commandPaletteAnimation,
    commandPaletteShowRecent:
      get<boolean>(KEY_COMMAND_PALETTE_SHOW_RECENT) ??
      DEFAULT_PREFERENCES.commandPaletteShowRecent,
    commandPaletteHistorySize:
      get<number>(KEY_COMMAND_PALETTE_HISTORY_SIZE) ??
      DEFAULT_PREFERENCES.commandPaletteHistorySize,
    commandPaletteSearchMode:
      get<"contains" | "startsWith" | "fuzzy">(KEY_COMMAND_PALETTE_SEARCH_MODE) ??
      DEFAULT_PREFERENCES.commandPaletteSearchMode,
    commandPaletteCloseOnOverlayClick:
      get<boolean>(KEY_COMMAND_PALETTE_CLOSE_ON_OVERLAY) ??
      DEFAULT_PREFERENCES.commandPaletteCloseOnOverlayClick,

    sidebarPosition:
      get<"left" | "right">(KEY_SIDEBAR_POSITION) ??
      DEFAULT_PREFERENCES.sidebarPosition,
    credentialEncryption:
      get<boolean>(KEY_CREDENTIAL_ENCRYPTION) ?? DEFAULT_PREFERENCES.credentialEncryption,
    checkForUpdates:
      get<boolean>(KEY_CHECK_FOR_UPDATES) ?? DEFAULT_PREFERENCES.checkForUpdates,

    hostPingInterval:
      get<number>(KEY_HOST_PING_INTERVAL) ?? DEFAULT_PREFERENCES.hostPingInterval,
    hmLayout:
      get<"grid" | "list">(KEY_HM_LAYOUT) ?? DEFAULT_PREFERENCES.hmLayout,
    hmSort:
      get<"last_connected" | "a_z" | "z_a">(KEY_HM_SORT) ?? DEFAULT_PREFERENCES.hmSort,

    aiEnabled:
      get<boolean>(KEY_AI_ENABLED) ?? DEFAULT_PREFERENCES.aiEnabled,
    showEditPrediction:
      get<boolean>(KEY_SHOW_EDIT_PREDICTION) ?? DEFAULT_PREFERENCES.showEditPrediction,
    aiMaxAgentSteps:
      get<number>(KEY_AI_MAX_AGENT_STEPS) ?? DEFAULT_PREFERENCES.aiMaxAgentSteps,
    aiTerminalContextLines:
      get<number>(KEY_AI_TERMINAL_CONTEXT_LINES) ?? DEFAULT_PREFERENCES.aiTerminalContextLines,
    aiTemperature:
      get<number>(KEY_AI_TEMPERATURE) ?? DEFAULT_PREFERENCES.aiTemperature,
    aiWarnDestructiveCommands:
      get<boolean>(KEY_AI_WARN_DESTRUCTIVE) ?? DEFAULT_PREFERENCES.aiWarnDestructiveCommands,
    terminalCopyOnSelect:
      get<boolean>(KEY_TERMINAL_COPY_ON_SELECT) ?? DEFAULT_PREFERENCES.terminalCopyOnSelect,
    terminalRightClickPastes:
      get<boolean>(KEY_TERMINAL_RIGHT_CLICK_PASTES) ?? DEFAULT_PREFERENCES.terminalRightClickPastes,
    terminalWordSeparator:
      get<string>(KEY_TERMINAL_WORD_SEPARATOR) ?? DEFAULT_PREFERENCES.terminalWordSeparator,
    terminalScrollSensitivity:
      get<number>(KEY_TERMINAL_SCROLL_SENSITIVITY) ?? DEFAULT_PREFERENCES.terminalScrollSensitivity,
    terminalFastScrollModifier:
      get<"none" | "alt" | "ctrl" | "shift">(KEY_TERMINAL_FAST_SCROLL_MODIFIER) ?? DEFAULT_PREFERENCES.terminalFastScrollModifier,
    reduceMotion:
      get<boolean>(KEY_REDUCE_MOTION) ?? DEFAULT_PREFERENCES.reduceMotion,
    newTabInheritsCwd:
      get<boolean>(KEY_NEW_TAB_INHERITS_CWD) ?? DEFAULT_PREFERENCES.newTabInheritsCwd,
    confirmCloseTerminalTab:
      get<boolean>(KEY_CONFIRM_CLOSE_TERMINAL_TAB) ?? DEFAULT_PREFERENCES.confirmCloseTerminalTab,
    confirmQuitWithSsh:
      get<boolean>(KEY_CONFIRM_QUIT_WITH_SSH) ?? DEFAULT_PREFERENCES.confirmQuitWithSsh,

    titlebarsIconsPosition:
      get<"auto" | "left" | "right">(KEY_TITLEBAR_ICONS_POSITION) ?? DEFAULT_PREFERENCES.titlebarsIconsPosition,

    tabsLocation:
      get<"titlebar" | "sidebar">(KEY_TABS_LOCATION) ?? DEFAULT_PREFERENCES.tabsLocation,
  };
}

export async function setTheme(value: ThemePref): Promise<void> {
  await (await getStore()).set(KEY_THEME, value);
  await (await getStore()).save();
}

export async function setDefaultModel(value: ModelId): Promise<void> {
  await (await getStore()).set(KEY_DEFAULT_MODEL, value);
  await (await getStore()).save();
}

export async function setEditorTheme(value: EditorThemeId): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_THEME, value);
  await (await getStore()).save();
}

export async function setCustomInstructions(value: string): Promise<void> {
  await (await getStore()).set(KEY_CUSTOM_INSTRUCTIONS, value);
  await (await getStore()).save();
}

export async function setAutostart(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_AUTOSTART, value);
  await (await getStore()).save();
}

export async function setRestoreWindowState(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_RESTORE_WINDOW, value);
  await (await getStore()).save();
}

export async function setAutocompleteEnabled(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_AUTOCOMPLETE_ENABLED, value);
  await (await getStore()).save();
}

export async function setAutocompleteProvider(
  value: AutocompleteProviderId,
): Promise<void> {
  await (await getStore()).set(KEY_AUTOCOMPLETE_PROVIDER, value);
  await (await getStore()).save();
}

export async function setAutocompleteModelId(value: string): Promise<void> {
  await (await getStore()).set(KEY_AUTOCOMPLETE_MODEL, value);
  await (await getStore()).save();
}

export async function setLmstudioBaseURL(value: string): Promise<void> {
  await (await getStore()).set(KEY_LMSTUDIO_BASE_URL, value);
  await (await getStore()).save();
}

export async function setLmstudioChatModelId(value: string): Promise<void> {
  await (await getStore()).set(KEY_LMSTUDIO_CHAT_MODEL_ID, value);
  await (await getStore()).save();
}

export async function setOpenaiCompatibleBaseURL(value: string): Promise<void> {
  await (await getStore()).set(KEY_OPENAI_COMPATIBLE_BASE_URL, value);
  await (await getStore()).save();
}

export async function setOpenaiCompatibleModelId(value: string): Promise<void> {
  await (await getStore()).set(KEY_OPENAI_COMPATIBLE_MODEL_ID, value);
  await (await getStore()).save();
}

export async function setVimMode(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_VIM_MODE, value);
  await (await getStore()).save();
}

export async function setDefaultStartupTab(
  value: "terminal" | "host-manager",
): Promise<void> {
  await (await getStore()).set(KEY_DEFAULT_STARTUP_TAB, value);
  await (await getStore()).save();
}

export async function setSessionRestore(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SESSION_RESTORE, value);
  await (await getStore()).save();
}

export async function setAppTheme(value: string): Promise<void> {
  await (await getStore()).set(KEY_APP_THEME, value);
  await (await getStore()).save();
}

export async function setAppFontFamily(value: string): Promise<void> {
  await (await getStore()).set(KEY_APP_FONT_FAMILY, value);
  await (await getStore()).save();
}

export async function setAppFontSize(value: number): Promise<void> {
  await (await getStore()).set(KEY_APP_FONT_SIZE, value);
  await (await getStore()).save();
}

export async function setAppLineHeight(value: number): Promise<void> {
  await (await getStore()).set(KEY_APP_LINE_HEIGHT, value);
  await (await getStore()).save();
}

export async function setBackgroundImage(value: string): Promise<void> {
  await (await getStore()).set(KEY_BG_IMAGE, value);
  await (await getStore()).save();
}

export async function setBackgroundOpacity(value: number): Promise<void> {
  await (await getStore()).set(KEY_BG_OPACITY, value);
  await (await getStore()).save();
}

export async function setBackgroundBlur(value: number): Promise<void> {
  await (await getStore()).set(KEY_BG_BLUR, value);
  await (await getStore()).save();
}

export async function setTerminalCursorBlink(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_CURSOR_BLINK, value);
  await (await getStore()).save();
}

export async function setTerminalCursorStyle(
  value: "block" | "underline" | "bar",
): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_CURSOR_STYLE, value);
  await (await getStore()).save();
}

export async function setTerminalFontFamily(value: string): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_FONT_FAMILY, value);
  await (await getStore()).save();
}

export async function setTerminalFontSize(value: number): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_FONT_SIZE, value);
  await (await getStore()).save();
}

export async function setTerminalScrollback(value: number): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_SCROLLBACK, value);
  await (await getStore()).save();
}

export async function setTerminalLetterSpacing(value: number): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_LETTER_SPACING, value);
  await (await getStore()).save();
}

export async function setTerminalLineHeight(value: number): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_LINE_HEIGHT, value);
  await (await getStore()).save();
}

export async function setTerminalFontWeight(
  value: "normal" | "medium" | "bold",
): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_FONT_WEIGHT, value);
  await (await getStore()).save();
}

export async function setTerminalShowPaneHeader(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_SHOW_PANE_HEADER, value);
  await (await getStore()).save();
}

export async function setTerminalShowPaneFooter(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_SHOW_PANE_FOOTER, value);
  await (await getStore()).save();
}

export async function setTerminalUseWebGL(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_USE_WEBGL, value);
  await (await getStore()).save();
}

export async function setTerminalBell(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_BELL, value);
  await (await getStore()).save();
}

export async function setTerminalShell(value: string): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_SHELL, value);
  await (await getStore()).save();
}

export async function setTerminalDefaultPath(value: string): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_DEFAULT_PATH, value);
  await (await getStore()).save();
}

export async function setEditorFontSize(value: number): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_FONT_SIZE, value);
  await (await getStore()).save();
}

export async function setEditorAutoSave(
  value: "off" | "afterDelay" | "onFocusChange",
): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_AUTO_SAVE, value);
  await (await getStore()).save();
}

export async function setEditorAutoSaveDelay(value: number): Promise<void> {
  const clamped = Math.min(60000, Math.max(100, value));
  await (await getStore()).set(KEY_EDITOR_AUTO_SAVE_DELAY, clamped);
  await (await getStore()).save();
}

export async function setEditorLineNumbers(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_LINE_NUMBERS, value);
  await (await getStore()).save();
}

export async function setEditorWordWrap(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_WORD_WRAP, value);
  await (await getStore()).save();
}

export async function setEditorTabSize(value: 2 | 4 | 8): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_TAB_SIZE, value);
  await (await getStore()).save();
}

export async function setEditorBracketMatching(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_BRACKET_MATCHING, value);
  await (await getStore()).save();
}

export async function setSftpFontSize(value: number): Promise<void> {
  await (await getStore()).set(KEY_SFTP_FONT_SIZE, value);
  await (await getStore()).save();
}

export async function setSftpShowHiddenFiles(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_SHOW_HIDDEN, value);
  await (await getStore()).save();
}

export async function setSftpShowUpFolder(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_SHOW_UP_FOLDER, value);
  await (await getStore()).save();
}

export async function setSftpColumnSize(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_COLUMN_SIZE, value);
  await (await getStore()).save();
}

export async function setSftpColumnModified(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_COLUMN_MODIFIED, value);
  await (await getStore()).save();
}

export async function setSftpColumnPermissions(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_COLUMN_PERMISSIONS, value);
  await (await getStore()).save();
}

export async function setSftpColumnType(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_COLUMN_TYPE, value);
  await (await getStore()).save();
}

export async function setSftpRemoteEditShowTransfers(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SFTP_REMOTE_EDIT_SHOW_TRANSFERS, value);
  await (await getStore()).save();
}

export async function setCommandPaletteBlur(value: number): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_BLUR, value);
  await (await getStore()).save();
}

export async function setCommandPaletteOpacity(value: number): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_OPACITY, value);
  await (await getStore()).save();
}

export async function setCommandPalettePosition(
  value: "top" | "center" | "high",
): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_POSITION, value);
  await (await getStore()).save();
}

export async function setCommandPaletteAnimation(
  value: "fast" | "normal" | "slow" | "none",
): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_ANIMATION, value);
  await (await getStore()).save();
}

export async function setCommandPaletteShowRecent(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_SHOW_RECENT, value);
  await (await getStore()).save();
}

export async function setCommandPaletteHistorySize(value: number): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_HISTORY_SIZE, value);
  await (await getStore()).save();
}

export async function setCommandPaletteSearchMode(
  value: "contains" | "startsWith" | "fuzzy",
): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_SEARCH_MODE, value);
  await (await getStore()).save();
}

export async function setCommandPaletteCloseOnOverlayClick(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_COMMAND_PALETTE_CLOSE_ON_OVERLAY, value);
  await (await getStore()).save();
}

export async function setSidebarPosition(
  value: "left" | "right",
): Promise<void> {
  await (await getStore()).set(KEY_SIDEBAR_POSITION, value);
  await (await getStore()).save();
}

export async function setCredentialEncryption(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_CREDENTIAL_ENCRYPTION, value);
  await (await getStore()).save();
}

export async function setCheckForUpdates(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_CHECK_FOR_UPDATES, value);
  await (await getStore()).save();
}

export async function setHostPingInterval(value: number): Promise<void> {
  await (await getStore()).set(KEY_HOST_PING_INTERVAL, value);
  await (await getStore()).save();
}

export async function setHmLayout(value: "grid" | "list"): Promise<void> {
  await (await getStore()).set(KEY_HM_LAYOUT, value);
  await (await getStore()).save();
}

export async function setHmSort(value: "last_connected" | "a_z" | "z_a"): Promise<void> {
  await (await getStore()).set(KEY_HM_SORT, value);
  await (await getStore()).save();
}

export async function setAiEnabled(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_AI_ENABLED, value);
  await (await getStore()).save();
}

export async function setShowEditPrediction(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_SHOW_EDIT_PREDICTION, value);
  await (await getStore()).save();
}

export async function setAiMaxAgentSteps(value: number): Promise<void> {
  await (await getStore()).set(KEY_AI_MAX_AGENT_STEPS, value);
  await (await getStore()).save();
}

export async function setAiTerminalContextLines(value: number): Promise<void> {
  await (await getStore()).set(KEY_AI_TERMINAL_CONTEXT_LINES, value);
  await (await getStore()).save();
}

export async function setAiTemperature(value: number): Promise<void> {
  await (await getStore()).set(KEY_AI_TEMPERATURE, value);
  await (await getStore()).save();
}

export async function setAiWarnDestructiveCommands(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_AI_WARN_DESTRUCTIVE, value);
  await (await getStore()).save();
}

export async function setTerminalCopyOnSelect(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_COPY_ON_SELECT, value);
  await (await getStore()).save();
}

export async function setTerminalRightClickPastes(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_RIGHT_CLICK_PASTES, value);
  await (await getStore()).save();
}

export async function setTerminalWordSeparator(value: string): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_WORD_SEPARATOR, value);
  await (await getStore()).save();
}

export async function setTerminalScrollSensitivity(value: number): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_SCROLL_SENSITIVITY, value);
  await (await getStore()).save();
}

export async function setTerminalFastScrollModifier(
  value: "none" | "alt" | "ctrl" | "shift",
): Promise<void> {
  await (await getStore()).set(KEY_TERMINAL_FAST_SCROLL_MODIFIER, value);
  await (await getStore()).save();
}

export async function setReduceMotion(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_REDUCE_MOTION, value);
  await (await getStore()).save();
}

export async function setNewTabInheritsCwd(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_NEW_TAB_INHERITS_CWD, value);
  await (await getStore()).save();
}

export async function setConfirmCloseTerminalTab(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_CONFIRM_CLOSE_TERMINAL_TAB, value);
  await (await getStore()).save();
}

export async function setConfirmQuitWithSsh(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_CONFIRM_QUIT_WITH_SSH, value);
  await (await getStore()).save();
}

export async function setTitlebarsIconsPosition(
  value: "auto" | "left" | "right",
): Promise<void> {
  await (await getStore()).set(KEY_TITLEBAR_ICONS_POSITION, value);
  await (await getStore()).save();
}

export async function setEditorShowCursorPosition(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_SHOW_CURSOR_POSITION, value);
  await (await getStore()).save();
}

export async function setEditorShowSelectionStats(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_SHOW_SELECTION_STATS, value);
  await (await getStore()).save();
}

export async function setEditorShowOutline(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_SHOW_OUTLINE, value);
  await (await getStore()).save();
}

export async function setEditorFormatOnSave(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_FORMAT_ON_SAVE, value);
  await (await getStore()).save();
}

export async function setEditorIndentationGuides(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_INDENTATION_GUIDES, value);
  await (await getStore()).save();
}

export async function setEditorFontFamily(value: string): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_FONT_FAMILY, value);
  await (await getStore()).save();
}

export async function setEditorLineHeight(value: number): Promise<void> {
  const clamped = Math.min(3.0, Math.max(1.0, value));
  await (await getStore()).set(KEY_EDITOR_LINE_HEIGHT, clamped);
  await (await getStore()).save();
}

export async function setEditorIndentWithTabs(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_INDENT_WITH_TABS, value);
  await (await getStore()).save();
}

export async function setEditorTrimTrailingWhitespace(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_TRIM_TRAILING_WHITESPACE, value);
  await (await getStore()).save();
}

export async function setEditorInsertFinalNewline(value: boolean): Promise<void> {
  await (await getStore()).set(KEY_EDITOR_INSERT_FINAL_NEWLINE, value);
  await (await getStore()).save();
}

export async function setEditorAutocompleteDebounceMs(value: number): Promise<void> {
  const clamped = Math.min(2000, Math.max(50, value));
  await (await getStore()).set(KEY_EDITOR_AUTOCOMPLETE_DEBOUNCE_MS, clamped);
  await (await getStore()).save();
}

export async function setTabsLocation(value: "titlebar" | "sidebar"): Promise<void> {
  await (await getStore()).set(KEY_TABS_LOCATION, value);
  await (await getStore()).save();
}

export type PrefKey = keyof Preferences;

/** Subscribe to changes from any window (settings → main). */
export async function onPreferencesChange(
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
    [KEY_LMSTUDIO_CHAT_MODEL_ID]: "lmstudioChatModelId",
    [KEY_OPENAI_COMPATIBLE_BASE_URL]: "openaiCompatibleBaseURL",
    [KEY_OPENAI_COMPATIBLE_MODEL_ID]: "openaiCompatibleModelId",
    [KEY_VIM_MODE]: "vimMode",
    [KEY_DEFAULT_STARTUP_TAB]: "defaultStartupTab",
    [KEY_SESSION_RESTORE]: "sessionRestore",

    [KEY_APP_THEME]: "appTheme",
    [KEY_APP_FONT_FAMILY]: "appFontFamily",
    [KEY_APP_FONT_SIZE]: "appFontSize",
    [KEY_APP_LINE_HEIGHT]: "appLineHeight",
    [KEY_BG_IMAGE]: "backgroundImage",
    [KEY_BG_OPACITY]: "backgroundOpacity",
    [KEY_BG_BLUR]: "backgroundBlur",

    [KEY_TERMINAL_SHELL]: "terminalShell",
    [KEY_TERMINAL_CURSOR_BLINK]: "terminalCursorBlink",
    [KEY_TERMINAL_CURSOR_STYLE]: "terminalCursorStyle",
    [KEY_TERMINAL_FONT_FAMILY]: "terminalFontFamily",
    [KEY_TERMINAL_FONT_SIZE]: "terminalFontSize",
    [KEY_TERMINAL_SCROLLBACK]: "terminalScrollback",
    [KEY_TERMINAL_LETTER_SPACING]: "terminalLetterSpacing",
    [KEY_TERMINAL_LINE_HEIGHT]: "terminalLineHeight",
    [KEY_TERMINAL_FONT_WEIGHT]: "terminalFontWeight",
    [KEY_TERMINAL_SHOW_PANE_HEADER]: "terminalShowPaneHeader",
    [KEY_TERMINAL_SHOW_PANE_FOOTER]: "terminalShowPaneFooter",
    [KEY_TERMINAL_USE_WEBGL]: "terminalUseWebGL",
    [KEY_TERMINAL_BELL]: "terminalBell",

    [KEY_EDITOR_FONT_SIZE]: "editorFontSize",
    [KEY_EDITOR_FONT_FAMILY]: "editorFontFamily",
    [KEY_EDITOR_LINE_HEIGHT]: "editorLineHeight",
    [KEY_EDITOR_AUTO_SAVE]: "editorAutoSave",
    [KEY_EDITOR_AUTO_SAVE_DELAY]: "editorAutoSaveDelay",
    [KEY_EDITOR_LINE_NUMBERS]: "editorLineNumbers",
    [KEY_EDITOR_WORD_WRAP]: "editorWordWrap",
    [KEY_EDITOR_TAB_SIZE]: "editorTabSize",
    [KEY_EDITOR_INDENT_WITH_TABS]: "editorIndentWithTabs",
    [KEY_EDITOR_BRACKET_MATCHING]: "editorBracketMatching",
    [KEY_EDITOR_SHOW_CURSOR_POSITION]: "editorShowCursorPosition",
    [KEY_EDITOR_SHOW_SELECTION_STATS]: "editorShowSelectionStats",
    [KEY_EDITOR_SHOW_OUTLINE]: "editorShowOutline",
    [KEY_EDITOR_FORMAT_ON_SAVE]: "editorFormatOnSave",
    [KEY_EDITOR_INDENTATION_GUIDES]: "editorIndentationGuides",
    [KEY_EDITOR_TRIM_TRAILING_WHITESPACE]: "editorTrimTrailingWhitespace",
    [KEY_EDITOR_INSERT_FINAL_NEWLINE]: "editorInsertFinalNewline",
    [KEY_EDITOR_AUTOCOMPLETE_DEBOUNCE_MS]: "editorAutocompleteDebounceMs",

    [KEY_SFTP_FONT_SIZE]: "sftpFontSize",
    [KEY_SFTP_SHOW_HIDDEN]: "sftpShowHiddenFiles",
    [KEY_SFTP_SHOW_UP_FOLDER]: "sftpShowUpFolder",
    [KEY_SFTP_COLUMN_SIZE]: "sftpColumnSize",
    [KEY_SFTP_COLUMN_MODIFIED]: "sftpColumnModified",
    [KEY_SFTP_COLUMN_PERMISSIONS]: "sftpColumnPermissions",
    [KEY_SFTP_COLUMN_TYPE]: "sftpColumnType",
    [KEY_SFTP_REMOTE_EDIT_SHOW_TRANSFERS]: "sftpRemoteEditShowTransfers",
    [KEY_COMMAND_PALETTE_BLUR]: "commandPaletteBlur",
    [KEY_COMMAND_PALETTE_OPACITY]: "commandPaletteOpacity",
    [KEY_COMMAND_PALETTE_POSITION]: "commandPalettePosition",
    [KEY_COMMAND_PALETTE_ANIMATION]: "commandPaletteAnimation",
    [KEY_COMMAND_PALETTE_SHOW_RECENT]: "commandPaletteShowRecent",
    [KEY_COMMAND_PALETTE_HISTORY_SIZE]: "commandPaletteHistorySize",
    [KEY_COMMAND_PALETTE_SEARCH_MODE]: "commandPaletteSearchMode",
    [KEY_COMMAND_PALETTE_CLOSE_ON_OVERLAY]: "commandPaletteCloseOnOverlayClick",
    [KEY_SIDEBAR_POSITION]: "sidebarPosition",
    [KEY_CREDENTIAL_ENCRYPTION]: "credentialEncryption",
    [KEY_CHECK_FOR_UPDATES]: "checkForUpdates",
    [KEY_HOST_PING_INTERVAL]: "hostPingInterval",
    [KEY_HM_LAYOUT]: "hmLayout",
    [KEY_HM_SORT]: "hmSort",
    [KEY_AI_ENABLED]: "aiEnabled",
    [KEY_SHOW_EDIT_PREDICTION]: "showEditPrediction",
    [KEY_AI_MAX_AGENT_STEPS]: "aiMaxAgentSteps",
    [KEY_AI_TERMINAL_CONTEXT_LINES]: "aiTerminalContextLines",
    [KEY_AI_TEMPERATURE]: "aiTemperature",
    [KEY_AI_WARN_DESTRUCTIVE]: "aiWarnDestructiveCommands",
    [KEY_TERMINAL_COPY_ON_SELECT]: "terminalCopyOnSelect",
    [KEY_TERMINAL_RIGHT_CLICK_PASTES]: "terminalRightClickPastes",
    [KEY_TERMINAL_WORD_SEPARATOR]: "terminalWordSeparator",
    [KEY_TERMINAL_SCROLL_SENSITIVITY]: "terminalScrollSensitivity",
    [KEY_TERMINAL_FAST_SCROLL_MODIFIER]: "terminalFastScrollModifier",
    [KEY_REDUCE_MOTION]: "reduceMotion",
    [KEY_NEW_TAB_INHERITS_CWD]: "newTabInheritsCwd",
    [KEY_CONFIRM_CLOSE_TERMINAL_TAB]: "confirmCloseTerminalTab",
    [KEY_CONFIRM_QUIT_WITH_SSH]: "confirmQuitWithSsh",
    [KEY_TITLEBAR_ICONS_POSITION]: "titlebarsIconsPosition",
    [KEY_TABS_LOCATION]: "tabsLocation",
  };
  return (await getStore()).onChange<unknown>((key, value) => {
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
