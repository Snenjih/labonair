import type { SnippetVariable } from "../types";

/**
 * Shell/POSIX environment variable names excluded from placeholder
 * extraction even though they match the `${UPPER_SNAKE_CASE}` pattern.
 *
 * A user writing `${PATH}`, `${HOME}`, `${SSH_TTY}`, etc. in a snippet
 * almost always means "let the underlying shell resolve its own
 * environment variable", not "prompt me for a value called PATH". Treating
 * these as Labonair placeholders would silently break any snippet that
 * relies on the real value (e.g. `echo $PATH` would start prompting on
 * every run instead of printing the actual PATH). This list is a pragmatic
 * heuristic, not exhaustive — application-level names like `${ENVIRONMENT}`
 * or `${DEPLOY_TARGET}` are intentionally NOT on it, since those have no
 * meaning to the shell itself and a user typing them is very likely using
 * Labonair's placeholder feature on purpose.
 */
const SHELL_RESERVED_VAR_NAMES = new Set([
  // POSIX / login environment
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PWD",
  "OLDPWD",
  "TERM",
  "TMPDIR",
  "TZ",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "DISPLAY",
  "MAIL",
  "EDITOR",
  "VISUAL",
  "CDPATH",
  // bash/zsh special & builtin variables
  "PS1",
  "PS2",
  "PS3",
  "PS4",
  "IFS",
  "RANDOM",
  "SECONDS",
  "LINENO",
  "PPID",
  "UID",
  "EUID",
  "SHLVL",
  "HISTFILE",
  "HISTSIZE",
  "HISTCONTROL",
  "BASH",
  "BASH_VERSION",
  "ZSH_VERSION",
  "FUNCNAME",
  "OSTYPE",
  "HOSTTYPE",
  "MACHTYPE",
  // SSH session context (set by sshd on the remote side)
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "SSH_CONNECTION",
  "SSH_CLIENT",
  "SSH_TTY",
]);

/**
 * Matches `${VAR_NAME}` or `${VAR_NAME:-default}`. The name must be
 * ALL_CAPS_WITH_UNDERSCORES (starting with a letter or underscore), which
 * keeps this from matching common shell positional/special params like
 * `${1}` or `${@}`.
 */
function variablePattern(): RegExp {
  // A fresh RegExp per call avoids any shared `lastIndex` state between
  // extraction and substitution call sites.
  return /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g;
}

/**
 * Extracts the unique set of `${VAR_NAME}` / `${VAR_NAME:-default}`
 * placeholders from a snippet command, in first-occurrence order.
 *
 * - Duplicate names (e.g. `echo ${NAME} > ${NAME}.txt`) are only returned
 *   once — the first occurrence's default (or lack of one) wins.
 * - Names that collide with common shell/environment variables (see
 *   `SHELL_RESERVED_VAR_NAMES`) are skipped entirely so they pass through to
 *   the real shell untouched instead of being prompted for.
 */
export function extractSnippetVariables(command: string): SnippetVariable[] {
  const variables = new Map<string, string | null>();
  for (const match of command.matchAll(variablePattern())) {
    const name = match[1];
    if (SHELL_RESERVED_VAR_NAMES.has(name)) continue;
    if (!variables.has(name)) {
      variables.set(name, match[2] ?? null);
    }
  }
  return Array.from(variables, ([name, defaultValue]) => ({ name, defaultValue }));
}

/**
 * Substitutes resolved values back into a snippet command. Placeholders for
 * reserved shell variable names (never extracted, so never present in
 * `values`) are left untouched, as is any other name not present in
 * `values`.
 */
export function substituteSnippetVariables(command: string, values: Record<string, string>): string {
  return command.replace(variablePattern(), (fullMatch, name: string) => {
    if (!(name in values)) return fullMatch;
    return values[name];
  });
}
