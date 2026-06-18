# nexum-shell-integration (bashrc)
#
# Differences vs zsh integration:
# - We emulate login-shell init manually (/etc/profile, profile files) because
#   bash ignores --rcfile when started with -l.
# - Pre-exec marker uses PS0 (bash 4.4+). On older bash (macOS default 3.2) we
#   skip it — a fragile DEBUG-trap alternative would clobber the user's own
#   traps and interact badly with debuggers.

if [ -z "$__NEXUM_HOOKS_LOADED" ]; then
  __NEXUM_HOOKS_LOADED=1

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

  _nexum_urlencode() {
    local LC_ALL=C s="$1" i c
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) printf '%s' "$c" ;;
        *) printf '%%%02X' "'$c" ;;
      esac
    done
  }

  _nexum_precmd() {
    local _nexum_ret=$?
    printf '\e]133;D;%s\e\\' "$_nexum_ret"
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-$(uname -n 2>/dev/null)}" "$(_nexum_urlencode "$PWD")"
    if [ -n "$NEXUM_BLOCKS" ]; then
      # Block mode: suppress the visual prompt entirely.
      # Only the OSC 133 B marker remains — the host-drawn input bar replaces the prompt.
      if [ -n "$__NEXUM_BLOCK_SEEN" ]; then
        PS1='\[\e]133;B\e\\\]'$'\n\n'
      else
        PS1='\[\e]133;B\e\\\]'$'\n'
      fi
      __NEXUM_PS1_INJECTED=1
    elif [ -z "$__NEXUM_PS1_INJECTED" ]; then
      PS1='\[\e]133;B\e\\\]'"$PS1"
      __NEXUM_PS1_INJECTED=1
    fi
    printf '\e]133;A\e\\'
  }

  case ":${PROMPT_COMMAND:-}:" in
    *":_nexum_precmd:"*) ;;
    *) PROMPT_COMMAND="_nexum_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac

  # Pre-exec marker via PS0 (bash 4.4+). PS0 is expanded just before a command
  # runs — cleaner than a DEBUG trap, which would clobber user traps and fire
  # on every command including inside PROMPT_COMMAND.
  # In block mode we also set __NEXUM_BLOCK_SEEN so the next prompt adds the
  # extra blank line for the block divider gap.
  if [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
    PS0='$([ -n "$NEXUM_BLOCKS" ] && __NEXUM_BLOCK_SEEN=1; printf "\e]133;C;%s\e\\" "$(history 1 | sed "s/^ *[0-9]* *//" | tr -d "[:cntrl:]" | cut -c1-256)")'"${PS0:-}"
  fi

  _nexum_precmd
fi
:
