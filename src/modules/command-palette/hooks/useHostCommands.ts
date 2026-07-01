import { HugeiconsIcon } from "@hugeicons/react";
import {
  TerminalIcon,
  Folder01Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import { createElement, useMemo } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

const QUICK_CONNECT_LIMIT = 3;

export function useHostCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  sshPage: CommandPage;
  sftpPage: CommandPage;
} {
  const hosts = useHostsStore((s) => s.hosts);
  const fetchData = useHostsStore((s) => s.fetchData);
  const hasFetched = useHostsStore((s) => s.hasFetched);

  if (!hasFetched) {
    void fetchData();
  }

  // Most recently connected hosts, shown directly at root level so
  // "ssh <name>" / "sftp <name>" surfaces them without opening the submenu.
  const quickConnectHosts = useMemo(
    () =>
      [...hosts]
        .filter((h) => h.last_connected_at)
        .sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0))
        .slice(0, QUICK_CONNECT_LIMIT),
    [hosts],
  );

  const quickConnectActions: CommandAction[] = quickConnectHosts.flatMap((h) => [
    {
      id: `host.quick.ssh.${h.id}`,
      title: `Connect SSH: ${h.name}`,
      subtitle: `${h.username}@${h.host_address}:${h.port}`,
      section: "Quick Connect",
      icon: createElement(HugeiconsIcon, {
        icon: TerminalIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.newSshTab(h.id, h.name),
    },
    {
      id: `host.quick.sftp.${h.id}`,
      title: `Open SFTP: ${h.name}`,
      subtitle: `${h.username}@${h.host_address}:${h.port}`,
      section: "Quick Connect",
      icon: createElement(HugeiconsIcon, {
        icon: Folder01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.newSftpTab(h.id, h.name),
    },
  ]);

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

  const rootActions: CommandAction[] = [
    ...quickConnectActions,
    {
      id: "hosts.connect-ssh",
      title: "Connect SSH...",
      subtitle: hosts.length > 0 ? `${hosts.length} hosts` : undefined,
      section: "Hosts",
      icon: createElement(HugeiconsIcon, {
        icon: TerminalIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      subPageId: "hosts-ssh",
    },
    {
      id: "hosts.open-sftp",
      title: "Open SFTP...",
      subtitle: hosts.length > 0 ? `${hosts.length} hosts` : undefined,
      section: "Hosts",
      icon: createElement(HugeiconsIcon, {
        icon: Folder01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      subPageId: "hosts-sftp",
    },
    {
      id: "hosts.add-new",
      title: "Add New Host...",
      section: "Hosts",
      icon: createElement(HugeiconsIcon, {
        icon: Add01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.openNewHostForm(),
    },
  ];

  return {
    rootActions,
    sshPage: {
      id: "hosts-ssh",
      searchPlaceholder: "Search SSH hosts...",
      actions: sshActions,
    },
    sftpPage: {
      id: "hosts-sftp",
      searchPlaceholder: "Search SFTP hosts...",
      actions: sftpActions,
    },
  };
}
