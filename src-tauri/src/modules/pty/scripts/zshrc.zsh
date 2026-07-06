# labonair-shell-integration (zshrc)
#
# Emits OSC 7 (cwd) + OSC 133 A/B/C/D (prompt-start / prompt-end / pre-exec /
# command-done-with-exit-code) so the host can detect command boundaries and
# track cwd without re-parsing the prompt. `status` is a read-only special in
# zsh, so we shadow $? into `_labonair_ret`.
#
# $LABONAIR_BLOCKS (exported by the host at shell-spawn time, see
# shell_init.rs's build_command) switches the prompt into block mode: the
# visible prompt is replaced with blank reserved rows for the host's own
# floating block header, and the pre-exec marker carries the literal command
# text. Fixed for the shell's lifetime — there's no way to flip it once the
# process has started.

{
  _labonair_user_zdotdir="${LABONAIR_USER_ZDOTDIR:-$HOME}"
  [ -f "$_labonair_user_zdotdir/.zshrc" ] && source "$_labonair_user_zdotdir/.zshrc"
  unset _labonair_user_zdotdir
}

# Re-source guard within a single shell (e.g. user runs `source ~/.zshrc`).
# This is NOT exported, so each nested zsh installs its own hooks — desired,
# since every interactive shell needs its own prompt integration.
if [[ -z "$__LABONAIR_HOOKS_LOADED" ]]; then
  __LABONAIR_HOOKS_LOADED=1
  autoload -Uz add-zsh-hook 2>/dev/null

  # URL-encode $PWD byte-wise so multi-byte paths stay valid in the `file://`
  # URI emitted via OSC 7. `no_multibyte` forces ${s[i]} to index bytes (not
  # code points), and LC_ALL=C keeps the [a-zA-Z0-9...] class single-byte.
  _labonair_urlencode() {
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

  _labonair_precmd() {
    local _labonair_ret=$?
    printf '\e]133;D;%s\e\\' "$_labonair_ret"
    printf '\e]7;file://%s%s\e\\' "${HOST}" "$(_labonair_urlencode "$PWD")"
    if [[ -n "$LABONAIR_BLOCKS" ]]; then
      # Block mode: the host renders its own floating header, so suppress the
      # visible prompt entirely (keep only the invisible OSC 133 B marker) and
      # reserve blank rows for it — xterm's grid has no CSS layer to inset a
      # header into real content, so the space has to come from the shell's
      # own prompt. Later prompts get two blank rows: the upper one is the
      # previous block's end-gap (above its divider), the lower one is this
      # command's header row. The very first prompt has no block above it, so
      # it gets a single row (header only) to avoid a tall top gap.
      if [[ -n "$_labonair_block_seen" ]]; then
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

  _labonair_preexec() {
    if [[ -n "$LABONAIR_BLOCKS" ]]; then
      # Mark that a real command ran, so the next prompt switches from one
      # blank row (first prompt, no block above) to two (end gap + header
      # row). Command text travels in the OSC payload itself (capped at 256
      # bytes, control chars flattened to spaces) — this is what lets a block
      # be created whether the command was typed directly or via the
      # composer, without a plain (non-block) session paying for the extra
      # payload on every command.
      _labonair_block_seen=1
      printf '\e]133;C;%s\e\\' "${${1//[[:cntrl:]]/ }[1,256]}"
    else
      printf '\e]133;C\e\\'
    fi
  }

  if (( $+functions[add-zsh-hook] )); then
    add-zsh-hook precmd _labonair_precmd
    add-zsh-hook preexec _labonair_preexec
  fi

  _labonair_precmd
fi
:
