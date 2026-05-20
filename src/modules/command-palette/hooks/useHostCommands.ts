import { HugeiconsIcon } from "@hugeicons/react";
import { TerminalIcon, Globe02Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useHostCommands(cb: RegistryCallbacks): {
  rootAction: CommandAction;
  hostsPage: CommandPage;
  sftpPage: CommandPage;
} {
  const hosts = useHostsStore((s) => s.hosts);
  const fetchData = useHostsStore((s) => s.fetchData);
  const hasFetched = useHostsStore((s) => s.hasFetched);

  if (!hasFetched) {
    void fetchData();
  }

  const sshActions: CommandAction[] = hosts.map((h) => ({
    id: `host.ssh.${h.id}`,
    title: `Connect SSH: ${h.name}`,
    subtitle: `${h.username}@${h.host_address}:${h.port}`,
    section: "SSH Hosts",
    icon: createElement(HugeiconsIcon, {
      icon: TerminalIcon,
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => cb.newSshTab(h.id, h.name),
  }));

  const sftpActions: CommandAction[] = hosts.map((h) => ({
    id: `host.sftp.${h.id}`,
    title: `Open SFTP: ${h.name}`,
    subtitle: `${h.username}@${h.host_address}:${h.port}`,
    section: "SFTP Hosts",
    icon: createElement(HugeiconsIcon, {
      icon: Folder01Icon,
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => cb.newSftpTab(h.id, h.name),
  }));

  const rootAction: CommandAction = {
    id: "hosts.connect",
    title: "Connect to Host...",
    section: "Hosts",
    icon: createElement(HugeiconsIcon, {
      icon: Globe02Icon,
      strokeWidth: 2,
      className: "size-4",
    }),
    subPageId: "hosts",
  };

  return {
    rootAction,
    hostsPage: {
      id: "hosts",
      searchPlaceholder: "Search hosts...",
      actions: [...sshActions, ...sftpActions],
    },
    sftpPage: {
      id: "sftp",
      searchPlaceholder: "Search SFTP hosts...",
      actions: sftpActions,
    },
  };
}
