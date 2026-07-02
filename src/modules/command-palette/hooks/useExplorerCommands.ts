import {
  Copy01Icon,
  FileAddIcon,
  FolderAddIcon,
  Refresh01Icon,
  ViewIcon,
  ViewOffSlashIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createElement } from "react";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { reconnectErroredExplorerSessions } from "@/modules/explorer/lib/useLazyExplorerSession";
import { useLocalExplorerStore } from "@/modules/explorer/lib/useLocalExplorerStore";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import type { CommandAction } from "../types";

function dispatchExplorer(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

/**
 * Sidebar file tree commands. The tree's own state (nodes/toggles) lives
 * inside `useFileTree`, a hook local to whichever `FileExplorer` instance is
 * currently mounted — these actions reach it via the same window-event
 * pattern `ssh.reconnect` already uses for `SshTerminalPane`, since there's
 * no other cross-component channel into that hook's closures. They're
 * harmless no-ops if the sidebar is currently showing a different panel
 * (tabs/snippets/source control) instead of the explorer.
 */
export function useExplorerCommands(): { rootActions: CommandAction[] } {
  const showHidden = useLocalExplorerStore((s) => s.showHidden);

  return {
    rootActions: [
      {
        id: "explorer.refresh",
        title: "Refresh File Tree",
        section: "Explorer",
        icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => dispatchExplorer("labonair:explorer-refresh"),
      },
      {
        id: "explorer.toggle-hidden",
        title: "Toggle: Show Hidden Files (Explorer)",
        section: "Explorer",
        rightLabel: showHidden ? "ON" : "OFF",
        icon: createElement(HugeiconsIcon, {
          icon: showHidden ? ViewIcon : ViewOffSlashIcon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => dispatchExplorer("labonair:explorer-toggle-hidden"),
      },
      {
        id: "explorer.new-file",
        title: "New File in Explorer",
        section: "Explorer",
        icon: createElement(HugeiconsIcon, { icon: FileAddIcon, strokeWidth: 2, className: "size-4" }),
        perform: () => dispatchExplorer("labonair:explorer-new-file"),
      },
      {
        id: "explorer.new-folder",
        title: "New Folder in Explorer",
        section: "Explorer",
        icon: createElement(HugeiconsIcon, { icon: FolderAddIcon, strokeWidth: 2, className: "size-4" }),
        perform: () => dispatchExplorer("labonair:explorer-new-folder"),
      },
      {
        id: "explorer.reconnect",
        title: "Reconnect Explorer Sessions",
        subtitle: "Retries any sidebar SSH browsing session currently disconnected or awaiting auth",
        section: "Explorer",
        icon: createElement(HugeiconsIcon, { icon: Wifi01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const count = reconnectErroredExplorerSessions();
          if (count === 0) {
            useNotificationStore.getState().addNotification({
              type: "info",
              title: "Nothing to reconnect",
              message: "No sidebar SSH sessions are currently disconnected.",
              source: "Explorer",
            });
          }
        },
      },
      {
        id: "explorer.copy-root-path",
        title: "Copy Explorer Root Path",
        section: "Explorer",
        icon: createElement(HugeiconsIcon, { icon: Copy01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const rootPath = useLocalExplorerStore.getState().rootPath;
          if (rootPath) void copyToClipboard(rootPath);
        },
      },
    ],
  };
}
