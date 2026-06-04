export { TabBar } from "./TabBar";
export { SidebarTabList } from "./SidebarTabList";
export { TabIconFor, labelFor, useRecentHosts, NewTabDropdownItems } from "./lib/tabUtils";
export {
  type Tab,
  type WorkspaceTab,
  type PaneNode,
  type PaneSplit,
  type PaneLeaf,
  type PaneDirection,
  type TerminalSessionData,
  type EditorTab,
  type PreviewTab,
  type AiDiffTab,
  type AiDiffStatus,
  type QuickConnectParams,
  type SftpTab,
  type HomeTab,
} from "./types";
export { useWorkspaceCwd } from "./lib/useWorkspaceCwd";
export { useTabManagement } from "./lib/useTabManagement";
export type { TabManagementReturn, UseTabManagementOptions } from "./lib/useTabManagement";
export {
  useTabsStore,
  selectActiveTab,
  selectActiveTabKind,
  selectActivePaneId,
} from "./store/tabsStore";
