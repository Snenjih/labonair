import type { ReactNode } from "react";
import type { CommandSnippet, SnippetExecMode } from "@/modules/snippets/types";

export type CommandContext = "terminal" | "editor" | "sftp" | "home" | "ssh-terminal";

export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  shortcut?: string[];
  section: string;
  contexts?: CommandContext[];
  perform?: () => void;
  subPageId?: string;
  rightLabel?: string;
  onPreview?: () => void;
};

export type CommandPage = {
  id: string;
  searchPlaceholder: string;
  actions: CommandAction[];
  onLeave?: () => void;
};

export type TabEntry = {
  id: number;
  kind: string;
  title: string;
};

export type RegistryCallbacks = {
  openSettings: (section?: string) => void;
  openShortcuts: () => void;
  newSshTab: (hostId: string, title: string) => void;
  newSftpTab: (hostId: string, title: string) => void;
  newTab: () => void;
  openUntitledTab: () => void;
  openHomeTab: () => void;
  splitRight: () => void;
  splitDown: () => void;
  closePane: () => void;
  closeCurrentTab: () => void;
  toggleAi: () => void;
  askSelection: () => void;
  // Tab switcher
  switchTab: (id: number) => void;
  // Snippets
  injectIntoTerminal: (text: string) => void;
  runSnippet: (snippet: CommandSnippet, modeOverride?: SnippetExecMode) => void;
  openSnippetsPanel: () => void;
  // AI sessions
  newAiSession: () => void;
  clearAiChat: () => void;
  switchAiSession: (id: string) => void;
  // Tab management
  duplicateCurrentTab: () => void;
  closeOtherTabs: () => void;
  // SSH
  disconnectCurrentSsh: () => void;
  reconnectCurrentSsh: () => void;
  // Hosts
  openNewHostForm: () => void;
  // Editor
  jumpToEditorPosition: (pos: number) => void;
  formatEditorDocument: () => void;
  // Source Control
  openGitGraph: () => void;
  focusSourceControl: () => void;
};
