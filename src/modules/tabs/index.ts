export { TabBar } from "./TabBar";
export { SidebarTabList } from "./SidebarTabList";
export { TabIconFor, labelFor, useRecentHosts, NewTabDropdownItems } from "./lib/tabUtils";
export type {
  Tab,
  WorkspaceTab,
  PaneNode,
  PaneSplit,
  PaneLeaf,
  PaneDirection,
  TerminalSessionData,
  EditorTab,
  PreviewTab,
  AiDiffTab,
  AiDiffStatus,
  QuickConnectParams,
  SftpTab,
  HomeTab,
} from "./types";
export { useWorkspaceCwd } from "./lib/useWorkspaceCwd";
export { useTabManagement } from "./lib/useTabManagement";
export type { TabManagementReturn, UseTabManagementOptions } from "./lib/useTabManagement";
export {
  useTabsStore,
  selectActiveTab,
  selectActiveTabKind,
  selectActivePaneId,
  selectIsActiveBlockTerminal,
  registerBlockDecorations,
  getActiveBlockDecorations,
  registerBlockSession,
  getActiveBlockSession,
} from "./store/tabsStore";
export type { BlockSessionAPI } from "./store/tabsStore";
