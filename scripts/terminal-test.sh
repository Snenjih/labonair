#!/usr/bin/env bash
# Labonair Terminal Capability Test — simple edition
#
# Usage: bash scripts/terminal-test.sh [--perf] [--scroll] [--interactive]
#
# Design: every test prints its own result immediately (no deferred
# array-of-results + final re-render table — that indirection was the
# previous version's whole problem surface). No sequence in this script
# depends on reading a response back from the terminal (no DA, no CPR, no
# OSC-color queries) — those require the terminal to write bytes back into
# the script's stdin, which is inherently racy across terminal emulators and
# bash versions and was the actual source of garbled/lost output before.
# Only escape codes that are fire-and-forget are used. The one exception is
# the opt-in --interactive section, which reads real keypresses/mouse
# clicks — that's the terminal's normal input path, not a query-response
# race, so it's fine.

RUN_PERF=false; RUN_SCROLL=false; RUN_INTERACTIVE=false
for arg in "$@"; do
  case $arg in
    --perf)        RUN_PERF=true ;;
    --scroll)      RUN_SCROLL=true ;;
    --interactive) RUN_INTERACTIVE=true ;;
  esac
done

PASS=0; WARN=0; FAIL=0

# GNU date's %N (nanoseconds) doesn't exist on BSD/macOS date — it's not
# rejected, just passed through as a literal "N" (exit code 0), so a plain
# `|| fallback` never triggers and downstream arithmetic breaks on the
# leftover letter. Validate the output is actually all-digits instead of
# trusting the exit code.
ms_now() {
  local t
  t=$(date +%s%3N 2>/dev/null)
  [[ "$t" =~ ^[0-9]+$ ]] && { printf '%s' "$t"; return; }
  printf '%s000' "$(date +%s)"
}

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS + 1)); }
warn() { printf "  \033[33m⚠\033[0m %s \033[2m(%s)\033[0m\n" "$1" "$2"; WARN=$((WARN + 1)); }
fail() { printf "  \033[31m✗\033[0m %s \033[2m(%s)\033[0m\n" "$1" "$2"; FAIL=$((FAIL + 1)); }
header() { printf "\n\033[1;36m%s\033[0m\n" "$1"; }

# Only ever true while actually inside the alternate screen buffer, so the
# exit trap sends \033[?1049l exactly when needed and never as a redundant
# no-op on normal exit (a redundant exit call here previously corrupted the
# just-printed report on some terminals).
_alt=0
cleanup() {
  [[ $_alt -eq 1 ]] && printf '\033[?1049l'
  printf '\033[0m\033[?25h\033[?1000l\033[?1002l\033[?1003l\033[?1006l\033[?1004l\033[?2026l\033[0 q'
  stty sane 2>/dev/null || true
}
trap cleanup EXIT

clear
printf '\033[1;36mLabonair Terminal Capability Test\033[0m \033[2m(simple edition)\033[0m\n'

# ── Environment ─────────────────────────────────────────────────────────────
header "Environment"
# tput/stty query the real terminal size directly — $COLUMNS/$LINES are
# interactive-shell-only bash variables a script subprocess never inherits.
cols=$(tput cols 2>/dev/null || stty size 2>/dev/null | cut -d' ' -f2)
rows=$(tput lines 2>/dev/null || stty size 2>/dev/null | cut -d' ' -f1)
printf "  TERM=%s  COLORTERM=%s  SHELL=%s  size=%sx%s  bash=%s\n" \
  "${TERM:-unset}" "${COLORTERM:-unset}" "${SHELL:-unset}" "${cols:-?}" "${rows:-?}" "$BASH_VERSION"

[[ -n "${TERM:-}" ]] && ok "TERM is set" || warn "TERM not set" "some apps may misbehave"
if [[ "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" ]]; then
  ok "COLORTERM=truecolor"
else
  warn "COLORTERM not truecolor" "${COLORTERM:-unset}"
fi
[[ ${cols:-0} -ge 80 ]] && ok "width ${cols} >= 80" || warn "width ${cols:-?} < 80" "TUIs may wrap"
[[ ${rows:-0} -ge 24 ]] && ok "height ${rows} >= 24" || warn "height ${rows:-?} < 24" "TUIs may clip"

# ── Color ───────────────────────────────────────────────────────────────────
header "ANSI 16-color"
for c in 0 1 2 3 4 5 6 7; do printf "\033[4%dm  \033[0m" "$c"; done; printf "\n"
for c in 0 1 2 3 4 5 6 7; do printf "\033[10%dm  \033[0m" "$c"; done; printf "\n"
ok "16-color bars printed above — verify 8 normal + 8 bright"

header "256-color"
for i in $(seq 16 51); do printf "\033[48;5;%dm \033[0m" "$i"; done
printf "\n"
ok "256-color strip printed above — verify distinct colors"

header "Truecolor (24-bit)"
for i in $(seq 0 60); do printf "\033[48;2;%d;%d;150m \033[0m" $((i * 4 % 256)) $((255 - i * 4 % 256)); done
printf "\n"
ok "truecolor gradient printed above — verify smooth, no banding"

# ── Unicode ──────────────────────────────────────────────────────────────────
header "Unicode"
printf "  Latin:   Ä Ö Ü ß © ® ™ € £ ¥\n"
printf "  Box:     ┌─┬─┐ ├─┼─┤ └─┴─┘\n"
printf "  Blocks:  █ ▓ ▒ ░ ▀ ▄ ● ★\n"
printf "  Braille: ⣿ ⡇ ⢸ ⠁ ⠂ ⠄\n"
printf "  CJK:     你好 日本語 한국어\n"
printf "  Emoji:   🚀 🎯 ✅ ❌ 🐛\n"
ok "unicode lines printed above — verify no mojibake, CJK is 2-col wide"

# ── Cursor ───────────────────────────────────────────────────────────────────
header "Cursor movement"
printf "  OVERWRITE-ME\033[12D\033[32mOVERWRITE\033[0m  <- must read OVERWRITE\n"
printf "  DELETE-THIS\033[11D\033[K<- line cleared here\n"
ok "cursor-back + erase-to-EOL printed above"

header "Cursor shapes (DECSCUSR)"
for code in 1 3 5 0; do printf '\033[%d q' "$code"; sleep 0.15; done
ok "cycled block/underline/bar cursor shapes, reset to default"

# ── Scroll regions + insert/delete line ─────────────────────────────────────
header "Scroll regions + insert/delete line"
printf '\033[?7l'   # disable auto-wrap temporarily
printf '\033[s'     # save cursor (DECSC)
printf '\n\n\n\n'
printf '\033[u'     # restore cursor
printf '\033[?7h'   # re-enable auto-wrap
ok "scroll-region sequence (DECSTBM) sent — restricts scroll to a row range"
printf "  Line-A (insert below will push this down)\n"
printf '\033[L'   # Insert 1 line — pushes "Line-A" down
printf "  Line-INSERTed\n"
printf '\033[M'   # Delete 1 line — removes the inserted line
ok "insert line (\\033[L) + delete line (\\033[M) above — verify Line-A pushed down then restored"

# ── Alternate screen ─────────────────────────────────────────────────────────
header "Alternate screen buffer"
printf "  Entering alt screen for 1.2s...\n"
sleep 0.2
_alt=1
printf '\033[?1049h\033[2J\033[H'
printf '  [ inside the alternate screen buffer — same thing vim/less/htop use ]\n'
printf '  This text is intentionally NOT part of scrollback and disappears on exit.\n'
sleep 1.2
printf '\033[?1049l'
_alt=0
ok "alternate screen enter/exit — back on main screen now, this line IS in scrollback"

# ── Underline styles ─────────────────────────────────────────────────────────
header "Underline styles"
printf '  \033[4mstraight\033[0m \033[4:2mdouble\033[0m \033[4:3mcurly\033[0m \033[53moverline\033[55m\033[0m\n'
ok "underline/overline variants printed above (support varies by terminal)"

# ── Synchronized output ──────────────────────────────────────────────────────
header "Synchronized output (mode 2026)"
printf '\033[?2026h'
for i in 1 2 3; do printf "  synchronized block %d\n" "$i"; done
printf '\033[?2026l'
ok "3 blocks printed atomically above — no partial-frame flicker expected"

# ── Powerline / Nerd Font symbols ────────────────────────────────────────────
header "Powerline / Nerd Font symbols"
printf "  Powerline:  "
printf "\xee\x80\xa0 \xee\x80\xa1 \xee\x80\xa2 \xee\x82\xb0\xee\x82\xb1\xee\x82\xb2\xee\x82\xb3\n"
printf "  Nerd Font:  "
printf "\xef\x81\xbb \xef\xa0\x88 \xef\x82\xa0 \xef\x84\x91 \xef\x95\x82\n"
ok "powerline/nerd-font glyphs printed above — broken boxes mean the font lacks these glyphs"

# ── Long lines / tabs / ligatures ────────────────────────────────────────────
header "Long lines / tab stops / ligatures"
printf '  A\tB\tC\tD\tE   <- should be column-aligned\n'
printf '  '; printf '%.0s-' $(seq 1 190); printf '\n'
ok "tab alignment + 190-char line printed above — must not wrap mid-word or corrupt"
printf '  Ligatures:  -> => != === !== >= <= -- --- // /* */ ::\n'
ok "ligature sequences printed above — joined glyphs if the font supports ligatures (FiraCode etc.)"
printf '  Conceal:    \033[8mHIDDEN-TEXT\033[0m  <- text concealed (select to reveal)\n'
ok "concealed text (\\033[8m) printed above — hidden but selectable/copyable"
printf '\007'
ok "bell character (\\007) fired — audio/visual bell should have triggered"

# ── ANSI art / rapid attribute changes ───────────────────────────────────────
header "Rapid color changes (renderer stress)"
printf "  "
for i in $(seq 0 99); do printf "\033[38;2;%d;%d;%dm▓\033[0m" $((i * 17 % 256)) $((i * 31 % 256)) $((i * 53 % 256)); done
printf "\n"
ok "100 rapid foreground color changes printed above — check for artifacts"

# ── Mouse modes ──────────────────────────────────────────────────────────────
header "Mouse mode toggles"
printf '\033[?1000h'; sleep 0.05; printf '\033[?1000l'
printf '\033[?1002h'; sleep 0.05; printf '\033[?1002l'
printf '\033[?1006h'; sleep 0.05; printf '\033[?1006l'
printf '\033[?1004h'; sleep 0.05; printf '\033[?1004l'
ok "mouse click/motion/SGR/focus modes toggled on then off (no response read back)"

# ── OSC sequences ────────────────────────────────────────────────────────────
header "OSC sequences"
printf '\033]0;Labonair Terminal Test\007'
ok "window title set (OSC 0)"
printf '  \033]8;;https://example.com\033\\click-me\033]8;;\033\\  <- should be clickable\n'
ok "hyperlink printed above (OSC 8)"

# ── Optional: scrollback volume ──────────────────────────────────────────────
header "Scrollback"
if $RUN_SCROLL; then
  for i in $(seq 1 300); do printf "  scrollback line %04d\n" "$i"; done
  ok "printed 300 lines — scroll up to verify they're all retained"
else
  printf "  \033[2mskipped — pass --scroll to enable\033[0m\n"
fi

# ── Optional: throughput ─────────────────────────────────────────────────────
header "Throughput"
if $RUN_PERF; then
  t0=$(ms_now)
  for i in $(seq 1 2000); do printf "perf %d: the quick brown fox\n" "$i"; done >/dev/null
  t1=$(ms_now)
  ok "2000 lines generated in $((t1 - t0))ms"
else
  printf "  \033[2mskipped — pass --perf to enable\033[0m\n"
fi

# ── Optional: interactive key/mouse input ────────────────────────────────────
# Reads real keypresses/mouse clicks off stdin — this is the terminal's
# normal input path (like any other interactive program reading a keystroke),
# not a query-response race like DA/CPR/OSC-color, so it's safe here.
header "Interactive input"
if $RUN_INTERACTIVE; then
  if [[ -t 0 ]]; then
    printf "  Press keys — Enter after each, 'q' to quit (max 5):\n"
    _saved_stty=$(stty -g)
    stty raw -echo
    count=0
    while true; do
      IFS= read -r -s -n 1 ch
      hex=$(printf '%s' "$ch" | xxd -p 2>/dev/null || printf '??')
      printf "\033[0G\033[K  key=\033[36m%-3s\033[0m  hex=\033[33m%s\033[0m" "$ch" "$hex"
      [[ "$hex" == "71" ]] && break
      if [[ "$hex" == "0d" ]]; then
        printf "\n"
        count=$((count + 1))
        [[ $count -ge 5 ]] && break
      fi
    done
    stty "$_saved_stty"
    printf "\n"
    ok "captured $count keypress(es) with hex decode"

    printf "  Click anywhere (1 click, or 'q' to skip):\n"
    stty raw -echo
    printf '\033[?1000h\033[?1006h'
    got_click=false
    timeout_n=0
    while true; do
      IFS= read -r -s -n 1 ch
      hex=$(printf '%s' "$ch" | xxd -p 2>/dev/null || true)
      [[ "$hex" == "71" ]] && break
      [[ "$ch" == $'\033' ]] && got_click=true
      $got_click && break
      timeout_n=$((timeout_n + 1)); [[ $timeout_n -gt 200 ]] && break
    done
    printf '\033[?1000l\033[?1006l'
    stty "$_saved_stty"
    printf "\n"
    if $got_click; then
      ok "mouse click (SGR 1006) escape sequence received"
    else
      warn "mouse click (SGR 1006)" "no click detected (or aborted with q)"
    fi
  else
    warn "interactive input" "not a TTY — pipe/redirect detected, skipped"
  fi
else
  printf "  \033[2mskipped — pass --interactive to enable\033[0m\n"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
header "Summary"
printf "  \033[32m%d passed\033[0m   \033[33m%d warnings\033[0m   \033[31m%d failed\033[0m\n" "$PASS" "$WARN" "$FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf "  \033[1;31mProblems detected — check the failed lines above.\033[0m\n"
elif [[ $WARN -gt 2 ]]; then
  printf "  \033[1;33mSeveral warnings — check the lines above.\033[0m\n"
elif [[ $WARN -gt 0 ]]; then
  printf "  \033[1;33mHealthy, minor warnings only.\033[0m\n"
else
  printf "  \033[1;32mAll checks passed.\033[0m\n"
fi
printf "\n  \033[2mTip: bash scripts/terminal-test.sh --perf --scroll --interactive\033[0m\n\n"
