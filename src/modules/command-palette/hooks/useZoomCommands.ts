import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp01Icon, ArrowDown01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setTerminalFontSize,
  setEditorFontSize,
  setSftpFontSize,
  DEFAULT_PREFERENCES,
} from "@/modules/settings/store";
import type { CommandAction, CommandPage } from "../types";

export function useZoomCommands(activeTabKind: string | undefined): {
  rootAction: CommandAction | null;
  zoomPage: CommandPage;
} {
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const editorFontSize = usePreferencesStore((s) => s.editorFontSize);
  const sftpFontSize = usePreferencesStore((s) => s.sftpFontSize);

  const isTerminal = activeTabKind === "workspace";
  const isEditor = activeTabKind === "editor";
  const isSftp = activeTabKind === "sftp";
  const hasZoom = isTerminal || isEditor || isSftp;

  const currentSize = isTerminal
    ? terminalFontSize
    : isEditor
      ? editorFontSize
      : isSftp
        ? sftpFontSize
        : null;

  const [increase, decrease, reset] = isTerminal
    ? [
        () => void setTerminalFontSize(Math.min(terminalFontSize + 1, 32)),
        () => void setTerminalFontSize(Math.max(terminalFontSize - 1, 8)),
        () => void setTerminalFontSize(DEFAULT_PREFERENCES.terminalFontSize),
      ]
    : isEditor
      ? [
          () => void setEditorFontSize(Math.min(editorFontSize + 1, 32)),
          () => void setEditorFontSize(Math.max(editorFontSize - 1, 8)),
          () => void setEditorFontSize(DEFAULT_PREFERENCES.editorFontSize),
        ]
      : [
          () => void setSftpFontSize(Math.min(sftpFontSize + 1, 20)),
          () => void setSftpFontSize(Math.max(sftpFontSize - 1, 10)),
          () => void setSftpFontSize(DEFAULT_PREFERENCES.sftpFontSize),
        ];

  const sizeLabel = currentSize !== null ? `${currentSize}px` : undefined;

  const zoomPage: CommandPage = {
    id: "zoom",
    searchPlaceholder: "Adjust font size...",
    actions: hasZoom
      ? [
          {
            id: "zoom.increase",
            title: "Increase Font Size",
            subtitle: sizeLabel,
            section: "Font Size",
            shortcut: ["⌘", "+"],
            icon: createElement(HugeiconsIcon, { icon: ArrowUp01Icon, strokeWidth: 2, className: "size-4" }),
            perform: increase,
          },
          {
            id: "zoom.decrease",
            title: "Decrease Font Size",
            subtitle: sizeLabel,
            section: "Font Size",
            shortcut: ["⌘", "−"],
            icon: createElement(HugeiconsIcon, { icon: ArrowDown01Icon, strokeWidth: 2, className: "size-4" }),
            perform: decrease,
          },
          {
            id: "zoom.reset",
            title: "Reset Font Size",
            subtitle: sizeLabel,
            section: "Font Size",
            shortcut: ["⌘", "0"],
            icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
            perform: reset,
          },
        ]
      : [],
  };

  const rootAction: CommandAction | null = hasZoom
    ? {
        id: "layout.zoom",
        title: "Adjust Font Size...",
        subtitle: sizeLabel,
        section: "Layout",
        icon: createElement(HugeiconsIcon, { icon: ArrowUp01Icon, strokeWidth: 2, className: "size-4" }),
        subPageId: "zoom",
      }
    : null;

  return { rootAction, zoomPage };
}
