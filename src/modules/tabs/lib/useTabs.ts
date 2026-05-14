import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

export type TerminalTab = {
  id: number;
  kind: "terminal";
  title: string;
  cwd?: string;
};

export type EditorTab = {
  id: number;
  kind: "editor";
  title: string;
  path: string;
  dirty: boolean;
  isUntitled?: boolean;
  remoteHostTabId?: string;
  remotePath?: string;
};

export type PreviewTab = {
  id: number;
  kind: "preview";
  title: string;
  url: string;
};

export type AiDiffStatus = "pending" | "approved" | "rejected";

export type AiDiffTab = {
  id: number;
  kind: "ai-diff";
  title: string;
  path: string;
  /** "" for newly created files. */
  originalContent: string;
  proposedContent: string;
  /** Tool-call approval id used to resolve the AI SDK approval. */
  approvalId: string;
  status: AiDiffStatus;
  isNewFile: boolean;
};

export type HomeTab = {
  id: number;
  kind: "home";
  title: string;
};

export type SftpTab = {
  id: number;
  kind: "sftp";
  title: string;
  hostId: string;
};

export type QuickConnectParams = {
  username: string;
  hostAddress: string;
  port: number;
};

export type SshTerminalTab = {
  id: number;
  kind: "ssh-terminal";
  title: string;
  hostId?: string;
  quickConnect?: QuickConnectParams;
  cwd?: string;
};

export type Tab = TerminalTab | EditorTab | PreviewTab | AiDiffTab | HomeTab | SftpTab | SshTerminalTab;

export type TabPatch = Partial<{
  title: string;
  cwd: string;
  path: string;
  dirty: boolean;
  url: string;
}>;

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url || "preview";
  }
}

export function useTabs(_initial?: Partial<TerminalTab>) {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 1, kind: "home", title: "Home" },
  ]);
  const [activeId, setActiveId] = useState(1);
  const nextIdRef = useRef(2);

  const newTab = useCallback((cwd?: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [...t, { id, kind: "terminal", title: "shell", cwd }]);
    setActiveId(id);
    return id;
  }, []);

  const openHomeTab = useCallback(() => {
    let targetId: number | null = null;
    setTabs((curr) => {
      const existing = curr.find((t) => t.kind === "home");
      if (existing) {
        targetId = existing.id;
        return curr;
      }
      const id = nextIdRef.current++;
      targetId = id;
      return [...curr, { id, kind: "home", title: "Home" }];
    });
    if (targetId !== null) setActiveId(targetId);
  }, []);

  const openFileTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setTabs((curr) => {
      const existing = curr.find(
        (t) => t.kind === "editor" && t.path === path,
      );
      if (existing) {
        targetId = existing.id;
        return curr;
      }
      const id = nextIdRef.current++;
      targetId = id;
      return [
        ...curr,
        {
          id,
          kind: "editor",
          title: basename(path),
          path,
          dirty: false,
        },
      ];
    });
    if (targetId !== null) setActiveId(targetId);
    return targetId as number | null;
  }, []);

  const openAiDiffTab = useCallback(
    (input: {
      path: string;
      originalContent: string;
      proposedContent: string;
      approvalId: string;
      isNewFile: boolean;
    }) => {
      let targetId: number | null = null;
      setTabs((curr) => {
        const existing = curr.find(
          (t) => t.kind === "ai-diff" && t.approvalId === input.approvalId,
        );
        if (existing) {
          targetId = existing.id;
          return curr;
        }
        const id = nextIdRef.current++;
        targetId = id;
        const title = `${basename(input.path)} (AI diff)`;
        return [
          ...curr,
          {
            id,
            kind: "ai-diff",
            title,
            path: input.path,
            originalContent: input.originalContent,
            proposedContent: input.proposedContent,
            approvalId: input.approvalId,
            status: "pending",
            isNewFile: input.isNewFile,
          },
        ];
      });
      if (targetId !== null) setActiveId(targetId);
      return targetId as number | null;
    },
    [],
  );

  const setAiDiffStatus = useCallback(
    (approvalId: string, status: AiDiffStatus) => {
      setTabs((curr) =>
        curr.map((t) =>
          t.kind === "ai-diff" && t.approvalId === approvalId
            ? { ...t, status }
            : t,
        ),
      );
    },
    [],
  );

  const newPreviewTab = useCallback((url: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      { id, kind: "preview", title: titleFromUrl(url), url },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: number) => {
    setTabs((curr) => {
      if (curr.length <= 1) return curr;
      const idx = curr.findIndex((t) => t.id === id);
      const next = curr.filter((t) => t.id !== id);
      setActiveId((active) =>
        id === active ? next[Math.max(0, idx - 1)].id : active,
      );
      return next;
    });
  }, []);

  const updateTab = useCallback((id: number, patch: TabPatch) => {
    setTabs((t) =>
      t.map((x) => {
        if (x.id !== id) return x;
        if (x.kind === "terminal") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.cwd !== undefined && { cwd: patch.cwd }),
          };
        }
        if (x.kind === "preview") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.url !== undefined && {
              url: patch.url,
              title: patch.title ?? titleFromUrl(patch.url),
            }),
          };
        }
        return {
          ...x,
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.dirty !== undefined && { dirty: patch.dirty }),
          ...(patch.path !== undefined && { path: patch.path, isUntitled: false }),
        };
      }),
    );
  }, []);

  const selectByIndex = useCallback(
    (idx: number) => {
      const t = tabs[idx];
      if (t) setActiveId(t.id);
    },
    [tabs],
  );

  const newSshTab = useCallback((hostId: string, title: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [...t, { id, kind: "ssh-terminal", title, hostId }]);
    setActiveId(id);
    return id;
  }, []);

  const newQuickSshTab = useCallback((username: string, hostAddress: string, port: number) => {
    const id = nextIdRef.current++;
    const title = `${username}@${hostAddress}`;
    setTabs((t) => [...t, { id, kind: "ssh-terminal", title, quickConnect: { username, hostAddress, port } }]);
    setActiveId(id);
    return id;
  }, []);

  const newSftpTab = useCallback((hostId: string, title: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [...t, { id, kind: "sftp", title, hostId }]);
    setActiveId(id);
    return id;
  }, []);

  const openUntitledTab = useCallback(async () => {
    const id = nextIdRef.current++;
    const tempPath = await invoke<string>("fs_create_temp_file", { prefix: `untitled-${id}` });
    setTabs((t) => [
      ...t,
      {
        id,
        kind: "editor" as const,
        title: "Untitled",
        path: tempPath,
        dirty: false,
        isUntitled: true,
      },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const openRemoteEditorTab = useCallback(
    async (sftpTabId: string, remotePath: string) => {
      const localTempPath = await invoke<string>("prepare_remote_edit", {
        tab_id: sftpTabId,
        remote_path: remotePath,
      });
      const fileName = remotePath.split("/").pop() ?? "remote-file";
      const id = nextIdRef.current++;
      setTabs((t) => [
        ...t,
        {
          id,
          kind: "editor",
          title: `✦ ${fileName}`,
          path: localTempPath,
          dirty: false,
          remoteHostTabId: sftpTabId,
          remotePath,
        },
      ]);
      setActiveId(id);
    },
    [],
  );

  return {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openHomeTab,
    openFileTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
    newSshTab,
    newQuickSshTab,
    newSftpTab,
    openRemoteEditorTab,
    openUntitledTab,
  };
}
