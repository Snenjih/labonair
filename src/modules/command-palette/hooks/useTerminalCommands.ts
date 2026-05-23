import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiEraserIcon,
  WifiDisconnected01Icon,
  WifiConnected01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";
import type { CommandPage, RegistryCallbacks } from "../types";

export function useTerminalCommands(cb: RegistryCallbacks): CommandPage {
  return {
    id: "terminal",
    searchPlaceholder: "Search terminal commands...",
    actions: [
      {
        id: "terminal.clear",
        title: "Clear Terminal",
        section: "Terminal",
        contexts: ["terminal", "ssh-terminal"],
        icon: createElement(HugeiconsIcon, {
          icon: AiEraserIcon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.injectIntoTerminal("\x1b[2J\x1b[H"),
      },
      {
        id: "ssh.disconnect",
        title: "Disconnect SSH",
        section: "SSH",
        contexts: ["ssh-terminal"],
        icon: createElement(HugeiconsIcon, {
          icon: WifiDisconnected01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.disconnectCurrentSsh(),
      },
      {
        id: "ssh.reconnect",
        title: "Reconnect SSH",
        section: "SSH",
        contexts: ["ssh-terminal"],
        icon: createElement(HugeiconsIcon, {
          icon: WifiConnected01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.reconnectCurrentSsh(),
      },
    ],
  };
}
