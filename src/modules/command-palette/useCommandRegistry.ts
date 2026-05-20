import { useMemo } from "react";
import type { CommandAction, CommandPage, RegistryCallbacks } from "./types";
import type { CommandContext } from "./types";
import { useSystemCommands } from "./hooks/useSystemCommands";
import { useLayoutCommands } from "./hooks/useLayoutCommands";
import { useHostCommands } from "./hooks/useHostCommands";
import { useSettingsCommands } from "./hooks/useSettingsCommands";

type Registry = Record<string, CommandPage>;

export function useCommandRegistry(
  cb: RegistryCallbacks,
  activeTabKind: string | undefined,
  activeContext: CommandContext | null,
): Registry {
  const systemPage = useSystemCommands(cb);
  const layoutPage = useLayoutCommands(cb, activeTabKind);
  const { rootAction: hostRootAction, hostsPage } = useHostCommands(cb);
  const { rootActions: settingsRootActions, themesPage, appModePage } =
    useSettingsCommands();

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
      hostRootAction,
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
    };
  }, [
    systemPage,
    layoutPage,
    hostRootAction,
    settingsRootActions,
    hostsPage,
    themesPage,
    appModePage,
    activeContext,
  ]);
}
