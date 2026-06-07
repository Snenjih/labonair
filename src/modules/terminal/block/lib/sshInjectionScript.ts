import type { BlockDecorations } from "./blockDecorations";

export type ShellHint = "bash" | "zsh" | "auto";

// Shell variable reference that TypeScript won't try to interpolate.
// We split the string so the TS template literal parser never sees "${SHELL".
const SHELL_VAR = "$" + "{SHELL:-sh}";

const GUARD_CHECK =
  '[ -n "$__NEXUM_BLK_LOADED" ] && return 0 2>/dev/null || true';
const SET_GUARD = "__NEXUM_BLK_LOADED=1";

const BASH_BODY = [
  GUARD_CHECK,
  SET_GUARD,
  '__nexum_blk_last_cmd=""',
  "__nexum_blk_debug() {",
  "  local cmd",
  "  cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')",
  '  if [ "$cmd" != "$__nexum_blk_last_cmd" ] && [ -n "$cmd" ]; then',
  '    __nexum_blk_last_cmd="$cmd"',
  "    printf '\\033]133;C;%s\\007' \"$cmd\"",
  "  fi",
  "}",
  "__nexum_blk_precmd() {",
  "  local code=$?",
  "  printf '\\033]133;D;%d\\007' \"$code\"",
  "  printf '\\033]133;A\\007'",
  "}",
  "trap '__nexum_blk_debug' DEBUG",
  'if [ -n "$PROMPT_COMMAND" ]; then',
  '  PROMPT_COMMAND="__nexum_blk_precmd;$PROMPT_COMMAND"',
  "else",
  '  PROMPT_COMMAND="__nexum_blk_precmd"',
  "fi",
  "printf '\\033]133;A\\007'",
].join("\n");

const ZSH_BODY = [
  GUARD_CHECK,
  SET_GUARD,
  "autoload -Uz add-zsh-hook",
  "__nexum_blk_precmd() {",
  "  local code=$?",
  "  printf '\\033]133;D;%d\\007' \"$code\"",
  "  printf '\\033]133;A\\007'",
  "}",
  "__nexum_blk_preexec() {",
  "  printf '\\033]133;C;%s\\007' \"$1\"",
  "}",
  "add-zsh-hook precmd __nexum_blk_precmd",
  "add-zsh-hook preexec __nexum_blk_preexec",
  "printf '\\033]133;A\\007'",
].join("\n");

const AUTO_BODY = [
  GUARD_CHECK,
  SET_GUARD,
  `__nexum_blk_shell=$(basename "${SHELL_VAR}")`,
  'case "$__nexum_blk_shell" in',
  "  zsh)",
  "    autoload -Uz add-zsh-hook",
  "    __nexum_blk_precmd() {",
  "      local code=$?",
  "      printf '\\033]133;D;%d\\007' \"$code\"",
  "      printf '\\033]133;A\\007'",
  "    }",
  "    __nexum_blk_preexec() {",
  "      printf '\\033]133;C;%s\\007' \"$1\"",
  "    }",
  "    add-zsh-hook precmd __nexum_blk_precmd",
  "    add-zsh-hook preexec __nexum_blk_preexec",
  "    printf '\\033]133;A\\007'",
  "    ;;",
  "  bash)",
  '    __nexum_blk_last_cmd=""',
  "    __nexum_blk_debug() {",
  "      local cmd",
  "      cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')",
  '      if [ "$cmd" != "$__nexum_blk_last_cmd" ] && [ -n "$cmd" ]; then',
  '        __nexum_blk_last_cmd="$cmd"',
  "        printf '\\033]133;C;%s\\007' \"$cmd\"",
  "      fi",
  "    }",
  "    __nexum_blk_precmd() {",
  "      local code=$?",
  "      printf '\\033]133;D;%d\\007' \"$code\"",
  "      printf '\\033]133;A\\007'",
  "    }",
  "    trap '__nexum_blk_debug' DEBUG",
  '    if [ -n "$PROMPT_COMMAND" ]; then',
  '      PROMPT_COMMAND="__nexum_blk_precmd;$PROMPT_COMMAND"',
  "    else",
  '      PROMPT_COMMAND="__nexum_blk_precmd"',
  "    fi",
  "    printf '\\033]133;A\\007'",
  "    ;;",
  "  fish)",
  "    printf '\\033]133;A\\007'",
  "    ;;",
  "  *)",
  "    printf '\\033]133;A\\007'",
  "    ;;",
  "esac",
].join("\n");

export function buildOsc133InjectionScript(hint: ShellHint = "auto"): string {
  let body: string;
  if (hint === "bash") {
    body = BASH_BODY;
  } else if (hint === "zsh") {
    body = ZSH_BODY;
  } else {
    body = AUTO_BODY;
  }
  return body + "\nprintf '\\r\\033[K'\n";
}

export function waitForFirstOsc133(
  decorations: BlockDecorations,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(false);
      }
    }, timeoutMs);

    const unsubscribe = decorations.subscribe(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(true);
      }
    });
  });
}
