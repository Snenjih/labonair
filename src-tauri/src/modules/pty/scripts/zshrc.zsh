# nexum-shell-integration (zshrc)
#
# Emits OSC 7 (cwd) + OSC 133 A/B/C/D (prompt-start / prompt-end / pre-exec /
# command-done-with-exit-code) so the host can detect command boundaries and
# track cwd without re-parsing the prompt. `status` is a read-only special in
# zsh, so we shadow $? into `_nexum_ret`.

{
  _nexum_user_zdotdir="${NEXUM_USER_ZDOTDIR:-$HOME}"
  [ -f "$_nexum_user_zdotdir/.zshrc" ] && source "$_nexum_user_zdotdir/.zshrc"
  unset _nexum_user_zdotdir
}

# Re-source guard within a single shell (e.g. user runs `source ~/.zshrc`).
# This is NOT exported, so each nested zsh installs its own hooks — desired,
# since every interactive shell needs its own prompt integration.
if [[ -z "$__NEXUM_HOOKS_LOADED" ]]; then
  __NEXUM_HOOKS_LOADED=1
  autoload -Uz add-zsh-hook 2>/dev/null

  # URL-encode $PWD byte-wise so multi-byte paths stay valid in the `file://`
  # URI emitted via OSC 7. `no_multibyte` forces ${s[i]} to index bytes (not
  # code points), and LC_ALL=C keeps the [a-zA-Z0-9...] class single-byte.
  _nexum_urlencode() {
    emulate -L zsh
    setopt localoptions no_multibyte
    local LC_ALL=C s="$1" i byte
    for (( i=1; i<=${#s}; i++ )); do
      byte="${s[i]}"
      case "$byte" in
        [a-zA-Z0-9/._~-]) printf '%s' "$byte" ;;
        *) printf '%%%02X' "'$byte" ;;
      esac
    done
  }

  _nexum_precmd() {
    local _nexum_ret=$?
    printf '\e]133;D;%s\e\\' "$_nexum_ret"
    printf '\e]7;file://%s%s\e\\' "${HOST}" "$(_nexum_urlencode "$PWD")"
    if [[ -n "$NEXUM_BLOCKS" ]]; then
      # Block mode: suppress the visual prompt entirely.
      # Only the OSC 133 B marker remains — the host-drawn input bar replaces the prompt.
      # Two blank lines after the first command: upper = end gap (above block divider),
      # lower = header row. First prompt gets only one blank line (no block above yet).
      if [[ -n "$_nexum_block_seen" ]]; then
        PS1=$'\n\n%{\e]133;B\e\\%}'
      else
        PS1=$'\n%{\e]133;B\e\\%}'
      fi
      RPROMPT=''
    elif [[ "$PS1" != *$'\e]133;B\e\\'* ]]; then
      # Re-inject prompt-end marker in case a framework rebuilt PS1 (p10k, starship).
      PS1=$'%{\e]133;B\e\\%}'"$PS1"
    fi
    printf '\e]133;A\e\\'
  }

  _nexum_preexec() {
    [[ -n "$NEXUM_BLOCKS" ]] && _nexum_block_seen=1
    local cmd="${1//[[:cntrl:]]/ }"
    printf '\e]133;C;%s\e\\' "${cmd[1,256]}"
  }

  if (( $+functions[add-zsh-hook] )); then
    add-zsh-hook precmd _nexum_precmd
    add-zsh-hook preexec _nexum_preexec
  fi

  _nexum_precmd
fi
:
