import { useMemo } from "react";
import { useAiSessionCommands } from "./hooks/useAiSessionCommands";
import { useEditorCommands } from "./hooks/useEditorCommands";
import { useExplorerCommands } from "./hooks/useExplorerCommands";
import { useHostCommands } from "./hooks/useHostCommands";
import { useLayoutCommands } from "./hooks/useLayoutCommands";
import { useSettingsCommands } from "./hooks/useSettingsCommands";
import { useSftpCommands } from "./hooks/useSftpCommands";
import { useSnippetCommands } from "./hooks/useSnippetCommands";
import { useSourceControlCommands } from "./hooks/useSourceControlCommands";
import { useSystemCommands } from "./hooks/useSystemCommands";
import { useTabCommands } from "./hooks/useTabCommands";
import { useTerminalCommands } from "./hooks/useTerminalCommands";
import { useZoomCommands } from "./hooks/useZoomCommands";
import type { CommandAction, CommandContext, CommandPage, RegistryCallbacks } from "./types";

type Registry = Record<string, CommandPage>;

export function useCommandRegistry(
  cb: RegistryCallbacks,
  activeTabKind: string | undefined,
  activeContext: CommandContext | null,
  activeTabId: number,
): Registry {
  const systemPage = useSystemCommands(cb);
  const layoutPage = useLayoutCommands(cb, activeTabKind);
  const { rootActions: hostRootActions, sshPage, sftpPage } = useHostCommands(cb);
  const {
    rootActions: settingsRootActions,
    themesPage,
    appModePage,
    editorThemePage,
  } = useSettingsCommands();
  const { rootAction: zoomRootAction, zoomPage } = useZoomCommands(activeTabKind);
  const { rootAction: tabRootAction, tabsPage } = useTabCommands(cb);
  const { rootActions: snippetRootActions, snippetsPage } = useSnippetCommands(cb);
  const { rootActions: aiRootActions, aiSessionsPage } = useAiSessionCommands(cb);
  const terminalPage = useTerminalCommands(cb);
  const { rootActions: sftpActionRoots } = useSftpCommands(activeTabId);
  const { rootActions: editorRootActions, outlinePage } = useEditorCommands(cb);
  const { rootActions: scRootActions, branchPage } = useSourceControlCommands(cb);
  const { rootActions: explorerRootActions } = useExplorerCommands();

  return useMemo(() => {
    const filterByContext = (actions: CommandAction[]): CommandAction[] => {
      if (!activeContext) return actions.filter((a) => !a.contexts?.length);
      return actions.filter((a) => !a.contexts?.length || a.contexts.includes(activeContext));
    };

    const rootActions: CommandAction[] = [
      ...filterByContext(systemPage.actions),
      ...filterByContext(layoutPage.actions),
      ...(zoomRootAction ? [zoomRootAction] : []),
      tabRootAction,
      ...hostRootActions,
      ...filterByContext(terminalPage.actions),
      ...filterByContext(sftpActionRoots),
      ...filterByContext(snippetRootActions),
      ...filterByContext(aiRootActions),
      ...filterByContext(settingsRootActions),
      ...filterByContext(editorRootActions),
      ...scRootActions,
      ...explorerRootActions,
    ];

    const rootPage: CommandPage = {
      id: "root",
      searchPlaceholder: "Search commands...",
      actions: rootActions,
    };

    return {
      root: rootPage,
      "hosts-ssh": sshPage,
      "hosts-sftp": sftpPage,
      themes: themesPage,
      mode: appModePage,
      "editor-theme": editorThemePage,
      zoom: zoomPage,
      tabs: tabsPage,
      snippets: snippetsPage,
      "ai-sessions": aiSessionsPage,
      outline: outlinePage,
      "git-branches": branchPage,
    };
  }, [
    systemPage,
    layoutPage,
    hostRootActions,
    sshPage,
    sftpPage,
    settingsRootActions,
    themesPage,
    appModePage,
    editorThemePage,
    zoomRootAction,
    zoomPage,
    tabRootAction,
    tabsPage,
    snippetRootActions,
    snippetsPage,
    aiRootActions,
    aiSessionsPage,
    terminalPage,
    sftpActionRoots,
    activeContext,
    editorRootActions,
    outlinePage,
    scRootActions,
    branchPage,
    explorerRootActions,
  ]);
}
