import type { ReactNode } from "react";

export type CommandContext = "terminal" | "editor" | "sftp" | "home";

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
};

export type CommandPage = {
  id: string;
  searchPlaceholder: string;
  actions: CommandAction[];
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
  toggleAi: () => void;
  askSelection: () => void;
};
