import { useMemo } from "react";
import type { CommandAction, CommandPage, RegistryCallbacks } from "./types";
import type { CommandContext } from "./types";
import { useSystemCommands } from "./hooks/useSystemCommands";
import { useLayoutCommands } from "./hooks/useLayoutCommands";
import { useHostCommands } from "./hooks/useHostCommands";
import { useSettingsCommands } from "./hooks/useSettingsCommands";
import { useZoomCommands } from "./hooks/useZoomCommands";
import { useTabCommands } from "./hooks/useTabCommands";
import { useSnippetCommands } from "./hooks/useSnippetCommands";
import { useAiSessionCommands } from "./hooks/useAiSessionCommands";

type Registry = Record<string, CommandPage>;

export function useCommandRegistry(
  cb: RegistryCallbacks,
  activeTabKind: string | undefined,
  activeContext: CommandContext | null,
): Registry {
  const systemPage = useSystemCommands(cb);
  const layoutPage = useLayoutCommands(cb, activeTabKind);
  const { rootAction: hostRootAction, hostsPage } = useHostCommands(cb);
  const { rootActions: settingsRootActions, themesPage, appModePage, editorThemePage } =
    useSettingsCommands();
  const { rootAction: zoomRootAction, zoomPage } = useZoomCommands(activeTabKind);
  const { rootAction: tabRootAction, tabsPage } = useTabCommands(cb);
  const { rootActions: snippetRootActions, snippetsPage } = useSnippetCommands(cb);
  const { rootActions: aiRootActions, aiSessionsPage } = useAiSessionCommands(cb);

  return useMemo(() => {
    const filterByContext = (actions: CommandAction[]): CommandAction[] => {
      if (!activeContext) return actions.filter((a) => !a.contexts?.length);
      return actions.filter(
        (a) => !a.contexts?.length || a.contexts.includes(activeContext),
      );
    };

    const rootActions: CommandAction[] = [
      ...filterByContext(systemPage.actions),
      ...filterByContext(layoutPage.actions),
      ...(zoomRootAction ? [zoomRootAction] : []),
      tabRootAction,
      hostRootAction,
      ...filterByContext(snippetRootActions),
      ...filterByContext(aiRootActions),
      ...filterByContext(settingsRootActions),
    ];

    const rootPage: CommandPage = {
      id: "root",
      searchPlaceholder: "Search commands...",
      actions: rootActions,
    };

    return {
      root: rootPage,
      hosts: hostsPage,
      themes: themesPage,
      mode: appModePage,
      "editor-theme": editorThemePage,
      zoom: zoomPage,
      tabs: tabsPage,
      snippets: snippetsPage,
      "ai-sessions": aiSessionsPage,
    };
  }, [
    systemPage,
    layoutPage,
    hostRootAction,
    settingsRootActions,
    hostsPage,
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
    activeContext,
  ]);
}
