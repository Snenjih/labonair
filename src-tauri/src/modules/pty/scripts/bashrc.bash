# labonair-shell-integration (bashrc)
#
# Differences vs zsh integration:
# - We emulate login-shell init manually (/etc/profile, profile files) because
#   bash ignores --rcfile when started with -l.
# - Outside block mode, pre-exec timing uses PS0 (bash 4.4+) — a DEBUG trap is
#   deliberately avoided there, since a timing-only signal doesn't need it and
#   DEBUG traps carry real interaction risk with a user's own debugging setup.
# - In block mode ($LABONAIR_BLOCKS), we DO need the literal command text
#   (bash has no equivalent of zsh's preexec($1), and PS0 can't see it), so a
#   DEBUG trap is used there — but only there, and as safely as we can manage:
#   if bash-preexec (https://github.com/rcaloras/bash-preexec, commonly pulled
#   in by nvm/direnv) is already loaded, we hook its precmd_functions/
#   preexec_functions arrays instead of touching DEBUG ourselves, since it
#   explicitly documents itself as the sole DEBUG-trap owner. Otherwise we
#   install our own trap, chained after any trap the user's own .bashrc set.

if [ -z "$__LABONAIR_HOOKS_LOADED" ]; then
  __LABONAIR_HOOKS_LOADED=1

  [ -f /etc/profile ] && source /etc/profile
  [ -f /etc/bashrc ] && source /etc/bashrc
  if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    source "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
  fi
  # .bashrc may have been sourced already by .bash_profile; sourcing again is
  # safe for idempotent rc files (the common case). If yours has side effects
  # on reload, guard with a flag.
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

  _labonair_urlencode() {
    local LC_ALL=C s="$1" i c
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) printf '%s' "$c" ;;
        *) printf '%%%02X' "'$c" ;;
      esac
    done
  }

  _labonair_precmd() {
    local _labonair_ret=$?
    printf '\e]133;D;%s\e\\' "$_labonair_ret"
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-$(uname -n 2>/dev/null)}" "$(_labonair_urlencode "$PWD")"
    if [ -n "$LABONAIR_BLOCKS" ]; then
      # Block mode: rebuilt every precmd (not one-shot like the plain-mode
      # branch below) — see zshrc.zsh's matching comment for why the shell
      # itself has to reserve this space, and what the blank-row counts mean.
      # Plain single-quoted (NOT $'...' ANSI-C quoting, unlike zshrc.zsh's
      # equivalent) — deliberately left for bash's OWN prompt-escape decoder
      # to process `\n`/`\e`/`\[`/`\]` in one pass when the prompt is
      # displayed. Pre-converting `\e`/`\\` via $'...' at assignment time (the
      # bug this replaces) leaves two literal backslash BYTES sitting next to
      # each other after the ST terminator — bash's decoder then greedily
      # reads them as one `\\` (literal-backslash) escape, stealing the
      # backslash the following `\]` needed, so a bare, visible `]` leaks
      # into the terminal right before the next command's echo. The sibling
      # plain-mode branch below already used single-quotes correctly; this
      # just matches it.
      if [ -n "$_labonair_block_seen" ]; then
        PS1='\n\n\[\e]133;B\e\\\]'
      else
        PS1='\n\[\e]133;B\e\\\]'
      fi
    elif [ -z "$__LABONAIR_PS1_INJECTED" ]; then
      PS1='\[\e]133;B\e\\\]'"$PS1"
      __LABONAIR_PS1_INJECTED=1
    fi
    printf '\e]133;A\e\\'
  }

  # Shared by both the bash-preexec and manual-DEBUG-trap paths below.
  # `$1` is the literal command text (only meaningful in block mode — plain
  # sessions get their timing signal from PS0 instead and never call this).
  _labonair_preexec() {
    local cmd="${1//[[:cntrl:]]/ }"
    _labonair_block_seen=1
    printf '\e]133;C;%s\e\\' "${cmd:0:256}"
  }

  if [ "${__bp_imported:-}" = "defined" ]; then
    precmd_functions+=(_labonair_precmd)
    [ -n "$LABONAIR_BLOCKS" ] && preexec_functions+=(_labonair_preexec)
  else
    case ":${PROMPT_COMMAND:-}:" in
      *":_labonair_precmd:"*) ;;
      *) PROMPT_COMMAND="_labonair_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
    esac

    if [ -z "$LABONAIR_BLOCKS" ]; then
      # Pre-exec marker via PS0 (bash 4.4+) — expanded just before a command
      # runs, cleaner than a DEBUG trap for a timing-only signal.
      if [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
         || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
        PS0='\[\e]133;C\e\\\]'"${PS0:-}"
      fi
    elif [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
       || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
      # A DEBUG trap fires before every *simple* command, including each one
      # inside a compound/multi-command line — so a flag armed once per
      # prompt and consumed by the first real firing is what limits this to
      # one `C` per top-level command, matching bash-preexec's own technique
      # (which this mirrors, for sessions where bash-preexec itself isn't
      # present). `history 1` is used instead of $BASH_COMMAND for the text
      # itself, since $BASH_COMMAND reflects bash's re-parsed view of a
      # compound statement rather than the literal line the user typed.
      #
      # The arm function MUST be appended at the END of PROMPT_COMMAND, not
      # the front: PROMPT_COMMAND itself runs as a semicolon-chain of simple
      # commands, and DEBUG fires for each of them too. Arming at the front
      # means the flag is already set by the time DEBUG fires for whatever
      # runs *after* it in that same chain (e.g. `_labonair_precmd`), which
      # would misfire on that as if it were a real user command — confirmed
      # by testing. Arming last means every DEBUG firing for PROMPT_COMMAND's
      # own internals sees the flag still unset, and only the *next* firing
      # (the user's actual next typed command) sees it armed.
      _labonair_prev_debug_trap="$(trap -p DEBUG | sed -E "s/^trap -- '(.*)' DEBUG\$/\1/")"
      _labonair_arm_preexec() { _labonair_preexec_armed=1; }
      PROMPT_COMMAND="${PROMPT_COMMAND}${PROMPT_COMMAND:+;}_labonair_arm_preexec"
      _labonair_preexec_trap() {
        [ -n "${_labonair_prev_debug_trap:-}" ] && eval "$_labonair_prev_debug_trap"
        [ -z "${_labonair_preexec_armed:-}" ] && return
        [ -n "${COMP_LINE:-}" ] && return
        [ "$BASH_COMMAND" = "$PROMPT_COMMAND" ] && return
        _labonair_preexec_armed=
        local cmd
        cmd="$(HISTTIMEFORMAT= builtin history 1 2>/dev/null | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]*//')"
        [ -z "$cmd" ] && cmd="$BASH_COMMAND"
        _labonair_preexec "$cmd"
      }
      trap '_labonair_preexec_trap' DEBUG
    fi
  fi

  _labonair_precmd
fi
:
