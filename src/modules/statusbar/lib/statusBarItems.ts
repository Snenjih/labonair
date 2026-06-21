import type { Preferences } from "@/modules/settings/store";
import {
  setEditorShowCursorPosition,
  setStatusBarShowAiControls,
  setStatusBarShowCwdBreadcrumb,
  setStatusBarShowExplorerButton,
  setStatusBarShowSnippetsButton,
  setStatusBarShowSourceControlButton,
  setStatusBarShowTabsButton,
  setStatusBarShowPreviewUrl,
} from "@/modules/settings/store";

export type StatusBarItemId =
  | "explorerButton"
  | "snippetsButton"
  | "sourceControlButton"
  | "tabsButton"
  | "cwdBreadcrumb"
  | "cursorPosition"
  | "previewUrl"
  | "aiControls";

export type StatusBarItemDescriptor = {
  id: StatusBarItemId;
  label: string;
  description: string;
  prefKey: keyof Preferences;
};

export const STATUSBAR_ITEM_REGISTRY: StatusBarItemDescriptor[] = [
  {
    id: "explorerButton",
    label: "Explorer",
    description: "Explorer panel toggle button",
    prefKey: "statusBarShowExplorerButton",
  },
  {
    id: "snippetsButton",
    label: "Snippets",
    description: "Snippets panel toggle button",
    prefKey: "statusBarShowSnippetsButton",
  },
  {
    id: "sourceControlButton",
    label: "Source Control",
    description: "Source Control panel toggle button",
    prefKey: "statusBarShowSourceControlButton",
  },
  {
    id: "tabsButton",
    label: "Tabs Panel",
    description: "Tabs panel toggle button (sidebar mode only)",
    prefKey: "statusBarShowTabsButton",
  },
  {
    id: "cwdBreadcrumb",
    label: "Working Directory",
    description: "Current working directory breadcrumb path",
    prefKey: "statusBarShowCwdBreadcrumb",
  },
  {
    id: "cursorPosition",
    label: "Cursor Position",
    description: "Line and column number (editor tabs only)",
    prefKey: "editorShowCursorPosition",
  },
  {
    id: "previewUrl",
    label: "Dev Server Preview",
    description: "Quick-open chip for detected dev server URLs",
    prefKey: "statusBarShowPreviewUrl",
  },
  {
    id: "aiControls",
    label: "AI Controls",
    description: "AI agent status pill and conversation controls",
    prefKey: "statusBarShowAiControls",
  },
];

export const STATUSBAR_ITEM_SETTERS: Record<StatusBarItemId, (v: boolean) => Promise<void>> = {
  explorerButton:      setStatusBarShowExplorerButton,
  snippetsButton:      setStatusBarShowSnippetsButton,
  sourceControlButton: setStatusBarShowSourceControlButton,
  tabsButton:          setStatusBarShowTabsButton,
  cwdBreadcrumb:       setStatusBarShowCwdBreadcrumb,
  cursorPosition:      setEditorShowCursorPosition,
  previewUrl:          setStatusBarShowPreviewUrl,
  aiControls:          setStatusBarShowAiControls,
};
