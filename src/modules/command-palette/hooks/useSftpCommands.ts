import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useSftpStore } from "@/modules/sftp/store/sftpStore";
import type { CommandAction } from "../types";

export function useSftpCommands(activeTabId: number): {
  rootActions: CommandAction[];
} {
  const remotePath = useSftpStore((s) => s.tabs[activeTabId]?.remotePath ?? "/");
  const localPath = useSftpStore((s) => s.tabs[activeTabId]?.localPath ?? "~");

  return {
    rootActions: [
      {
        id: "sftp.copy-remote-path",
        title: "Copy Remote Path",
        subtitle: remotePath,
        section: "SFTP",
        contexts: ["sftp"],
        icon: createElement(HugeiconsIcon, {
          icon: Copy01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => void navigator.clipboard.writeText(remotePath),
      },
      {
        id: "sftp.copy-local-path",
        title: "Copy Local Path",
        subtitle: localPath,
        section: "SFTP",
        contexts: ["sftp"],
        icon: createElement(HugeiconsIcon, {
          icon: Copy01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => void navigator.clipboard.writeText(localPath),
      },
    ],
  };
}
