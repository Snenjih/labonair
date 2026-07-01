export type ToolContext = {
  /** Active terminal tab cwd, used to resolve relative paths. Null = home. */
  getCwd: () => string | null;
  /** Workspace root (explorer root). Used by tools that operate over the project. */
  getWorkspaceRoot: () => string | null;
  /** Last N lines of the active terminal buffer (or null if not a terminal tab). */
  getTerminalContext: () => string | null;
  /**
   * Type a string into the active terminal at the prompt — without executing.
   * Returns false if there is no active terminal tab to inject into.
   */
  injectIntoActivePty: (text: string) => boolean;
  /** Open a new preview tab (in-app iframe) at the given URL. */
  openPreview: (url: string) => boolean;
  /**
   * Set of absolute paths the model has read this session via `read_file`.
   * `edit`/`multi_edit` enforce read-before-edit by checking membership.
   * Mutated as a side effect of successful read_file calls.
   */
  readCache: Set<string>;
  /** Active chat session id — used by tools that persist per-session state (todos). */
  getSessionId: () => string | null;
  /**
   * Kind of the currently active workspace tab. Used by tools to decide
   * whether to route commands locally or over SSH.
   */
  getActiveTabKind: () => string | null;
  /**
   * Tab ID of the active SSH terminal tab, or null if the active tab is not
   * an ssh-terminal. Passed to ssh_exec_command for remote routing.
   */
  getActiveSshTabId: () => string | null;
  /** Returns list of open terminal (workspace) tabs: [{id, label, index}] */
  getTerminalTabs: () => { id: string; label: string; index: number }[];
  /** Opens a new terminal tab and runs the given command. */
  openTerminalWithCommand: (command: string) => void;
  /** Injects a command into a specific terminal tab by its pane/session id. */
  injectIntoTerminal: (tabId: string, command: string) => void;
};

export function resolvePath(rawPath: string, cwd: string | null): string {
  if (rawPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rawPath)) return rawPath;
  if (!cwd)
    throw new Error(
      `cannot resolve relative path "${rawPath}": no active terminal cwd. Pass an absolute path.`,
    );
  const sep = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(sep) ? `${cwd}${rawPath}` : `${cwd}${sep}${rawPath}`;
}
