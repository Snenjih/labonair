import type { Preferences } from "@/modules/settings/store";
import {
  setEditorShowCursorPosition,
  setStatusBarShowAiControls,
  setStatusBarShowCwdBreadcrumb,
  setStatusBarShowPanelButtons,
  setStatusBarShowPreviewUrl,
} from "@/modules/settings/store";

export type StatusBarItemId =
  | "panelButtons"
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
    id: "panelButtons",
    label: "Panel Buttons",
    description: "Explorer, Snippets, and Source Control panel toggles",
    prefKey: "statusBarShowPanelButtons",
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
  panelButtons:   setStatusBarShowPanelButtons,
  cwdBreadcrumb:  setStatusBarShowCwdBreadcrumb,
  cursorPosition: setEditorShowCursorPosition,
  previewUrl:     setStatusBarShowPreviewUrl,
  aiControls:     setStatusBarShowAiControls,
};
