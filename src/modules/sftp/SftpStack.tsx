import { cn } from "@/lib/utils";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { SftpTab } from "@/modules/tabs/types";
import { useShallow } from "zustand/react/shallow";
import { SftpPane } from "./SftpPane";

type Props = {
  onOpenSshTerminal?: (hostId: string, title: string, cwd: string) => void;
  onOpenRemoteEditor: (sftpTabId: string, remotePath: string) => Promise<void>;
  onPathsChange?: (tabId: number, remotePath: string, localPath: string) => void;
};

export function SftpStack({ onOpenSshTerminal, onOpenRemoteEditor, onPathsChange }: Props) {
  const sftpTabs = useTabsStore(useShallow((s) => s.tabs.filter((t): t is SftpTab => t.kind === "sftp")));
  const activeId = useTabsStore((s) => s.activeId);

  if (sftpTabs.length === 0) return null;

  return (
    <>
      {sftpTabs.map((t) => (
        <div
          key={t.id}
          className={cn("absolute inset-0", activeId === t.id ? "z-10" : "z-0 opacity-0 pointer-events-none")}
          aria-hidden={activeId !== t.id}
        >
          <SftpPane
            tab={t}
            onOpenSshTerminal={onOpenSshTerminal}
            onOpenRemoteEditor={onOpenRemoteEditor}
            onPathsChange={onPathsChange}
          />
        </div>
      ))}
    </>
  );
}
