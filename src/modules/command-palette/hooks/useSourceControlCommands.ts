import { createElement, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GitBranchIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Refresh01Icon,
  Tick02Icon,
  Cancel01Icon,
  File02Icon,
} from "@hugeicons/core-free-icons";
import type { CommandAction, CommandPage, RegistryCallbacks } from "../types";
import { useSourceControlStore } from "@/modules/source-control/store/sourceControlStore";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";

function notify(type: "success" | "error" | "info", title: string, message: string) {
  useNotificationStore.getState().addNotification({ type, title, message });
}

export function useSourceControlCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  branchPage: CommandPage;
} {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const branchList = useSourceControlStore((s) => s.branchList);
  const stashEntries = useSourceControlStore((s) => s.stashEntries);

  const rootActions = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = [
      {
        id: "git.open-graph",
        title: "Open Git Graph",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: GitBranchIcon, strokeWidth: 2, className: "size-4" }),
        perform: () => cb.openGitGraph(),
      },
      {
        id: "git.focus-source-control",
        title: "Focus Source Control",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: GitBranchIcon, strokeWidth: 2, className: "size-4" }),
        perform: () => cb.focusSourceControl(),
      },
    ];

    if (!repoRoot) return actions;

    actions.push(
      {
        id: "git.switch-branch",
        title: "Git: Switch Branch...",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: GitBranchIcon, strokeWidth: 2, className: "size-4" }),
        subPageId: "git-branches",
      },
      {
        id: "git.push",
        title: "Git: Push",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: ArrowUp01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .push(root)
            .then(() => notify("success", "Pushed", "Branch pushed to remote"))
            .catch((e: unknown) => notify("error", "Push Failed", String(e)));
        },
      },
      {
        id: "git.pull",
        title: "Git: Pull",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: ArrowDown01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .pull(root)
            .then(() => notify("success", "Pulled", "Branch updated from remote"))
            .catch((e: unknown) => notify("error", "Pull Failed", String(e)));
        },
      },
      {
        id: "git.fetch",
        title: "Git: Fetch",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .fetch(root)
            .then(() => notify("info", "Fetched", "Fetched all remotes"))
            .catch((e: unknown) => notify("error", "Fetch Failed", String(e)));
        },
      },
      {
        id: "git.force-push",
        title: "Git: Force Push (with-lease)",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: ArrowUp01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .pushForceWithLease(root)
            .then(() => notify("success", "Force Pushed", "Force-pushed to remote (with-lease)"))
            .catch((e: unknown) => notify("error", "Force Push Failed", String(e)));
        },
      },
      {
        id: "git.stage-all",
        title: "Git: Stage All Changes",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: Tick02Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .stageAll(root)
            .then(() => notify("success", "Staged", "All changes staged"))
            .catch((e: unknown) => notify("error", "Stage Failed", String(e)));
        },
      },
      {
        id: "git.unstage-all",
        title: "Git: Unstage All Changes",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: Cancel01Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .unstageAll(root)
            .then(() => notify("success", "Unstaged", "All changes unstaged"))
            .catch((e: unknown) => notify("error", "Unstage Failed", String(e)));
        },
      },
      {
        id: "git.stash-push",
        title: "Git: Stash Changes",
        section: "Source Control",
        icon: createElement(HugeiconsIcon, { icon: File02Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          if (!root) return;
          void git
            .stashPush(root)
            .then(() => notify("success", "Stashed", "Changes stashed"))
            .catch((e: unknown) => notify("error", "Stash Failed", String(e)));
        },
      },
    );

    if (stashEntries.length > 0) {
      const latest = stashEntries[0];
      actions.push({
        id: "git.stash-pop",
        title: "Git: Pop Latest Stash",
        section: "Source Control",
        subtitle: latest.message || undefined,
        icon: createElement(HugeiconsIcon, { icon: File02Icon, strokeWidth: 2, className: "size-4" }),
        perform: () => {
          const root = useSourceControlStore.getState().repoRoot;
          const entries = useSourceControlStore.getState().stashEntries;
          if (!root || entries.length === 0) return;
          void git
            .stashPop(root, entries[0].hash)
            .then(() => notify("success", "Stash Popped", "Latest stash applied and removed"))
            .catch((e: unknown) => notify("error", "Stash Pop Failed", String(e)));
        },
      });
    }

    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRoot, stashEntries, cb.openGitGraph, cb.focusSourceControl]);

  const branchPage = useMemo<CommandPage>(() => {
    const branchActions: CommandAction[] =
      branchList.length > 0
        ? branchList.map((b) => ({
            id: `git.checkout.${b.name}`,
            title: b.name,
            section: b.isRemote ? "Remote" : "Local",
            rightLabel: b.isCurrent ? "current" : undefined,
            icon: createElement(HugeiconsIcon, { icon: GitBranchIcon, strokeWidth: 2, className: "size-4" }),
            perform: b.isCurrent
              ? undefined
              : () => {
                  const root = useSourceControlStore.getState().repoRoot;
                  if (!root) return;
                  void git
                    .checkoutBranch(root, b.name)
                    .then(() => notify("success", "Switched Branch", `Checked out ${b.name}`))
                    .catch((e: unknown) => notify("error", "Checkout Failed", String(e)));
                },
          }))
        : [
            {
              id: "git.branches.empty",
              title: repoRoot ? "No branches loaded yet" : "No repository detected",
              section: "Info",
              perform: undefined,
            },
          ];

    return {
      id: "git-branches",
      searchPlaceholder: "Search branches...",
      actions: branchActions,
    };
  }, [branchList, repoRoot]);

  return { rootActions, branchPage };
}
