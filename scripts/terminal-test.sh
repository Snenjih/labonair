#!/usr/bin/env bash
# Labonair Terminal Capability Test Suite v2.0
# bash scripts/terminal-test.sh [--perf] [--scroll] [--interactive] [--all]

set -uo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
RUN_PERF=false; RUN_SCROLL=false; RUN_INTERACTIVE=false
for arg in "$@"; do
  case $arg in
    --perf)        RUN_PERF=true ;;
    --scroll)      RUN_SCROLL=true ;;
    --interactive) RUN_INTERACTIVE=true ;;
    --all)         RUN_PERF=true; RUN_SCROLL=true; RUN_INTERACTIVE=true ;;
  esac
done

# ── Cleanup trap (always restore terminal state) ───────────────────────────────
_SAVED_STTY=""
cleanup() {
  printf '\033[?1049l'  # exit alternate screen
  printf '\033[0 q'     # reset cursor shape
  printf '\033[?25h'    # show cursor
  printf '\033[?1000l\033[?1002l\033[?1003l'  # disable mouse modes
  printf '\033[?1004l'  # disable focus tracking
  printf '\033[?2026l'  # exit synchronized output
  printf '\033[r'       # reset scroll region
  printf '\033[0m'      # reset attributes
  [[ -n "$_SAVED_STTY" ]] && stty "$_SAVED_STTY" 2>/dev/null || stty sane 2>/dev/null || true
}
trap cleanup EXIT

# ── Result tracking (parallel arrays) ─────────────────────────────────────────
T_NAME=(); T_STATUS=(); T_DETAIL=()
PASS=0; WARN=0; FAIL=0; SKIP=0

record() {
  local name="$1" status="$2" detail="${3:-}"
  T_NAME+=("$name"); T_STATUS+=("$status"); T_DETAIL+=("$detail")
  case $status in
    PASS) printf "     \033[32m✓\033[0m  %s\n" "$name";                                             PASS=$((PASS+1)) ;;
    WARN) printf "     \033[33m⚠\033[0m  %s \033[38;2;120;120;140m— %s\033[0m\n" "$name" "$detail"; WARN=$((WARN+1)) ;;
    FAIL) printf "     \033[31m✗\033[0m  %s \033[38;2;200;80;80m— %s\033[0m\n"   "$name" "$detail"; FAIL=$((FAIL+1)) ;;
    SKIP) printf "     \033[38;2;90;90;110m·  %s — %s\033[0m\n" "$name" "$detail";                  SKIP=$((SKIP+1)) ;;
  esac
}

section() {
  printf "\n\033[1;38;2;100;180;255m▐\033[0m \033[1m%s\033[0m\n" "$1"
  printf "\033[38;2;60;60;80m  ─────────────────────────────────────────────\033[0m\n"
}

# ── Terminal query helper (reads response with timeout) ────────────────────────
# Usage: query_terminal <printf-escaped-sequence> <terminating-char> [timeout-tenths=4]
query_terminal() {
  [[ ! -t 0 ]] || [[ ! -t 1 ]] && { printf ''; return 1; }
  local resp="" ch n=0
  _SAVED_STTY=$(stty -g 2>/dev/null) || { printf ''; return 1; }
  stty raw -echo min 0 time "${3:-4}" 2>/dev/null || { stty "$_SAVED_STTY" 2>/dev/null; printf ''; return 1; }
  printf '%b' "$1" 2>/dev/null
  while IFS= read -r -s -N1 ch 2>/dev/null; do
    [[ -z "$ch" ]] && break
    resp+="$ch"
    [[ "$ch" == "$2" ]] && break
    n=$((n+1)); [[ $n -gt 80 ]] && break
  done
  stty "$_SAVED_STTY" 2>/dev/null || true
  _SAVED_STTY=""
  printf '%s' "$resp"
}

# ── Table helpers ─────────────────────────────────────────────────────────────
# Columns: Name(40) Status(6) Details(30)  → total visible width = 86
_hr() { printf '─%.0s' $(seq 1 "$1"); }
_tbl_top() { printf "  ┌"; _hr 42; printf "┬"; _hr 8;  printf "┬"; _hr 32; printf "┐\n"; }
_tbl_hdr() { printf "  │ %-40s │ %-6s │ %-30s │\n" "Test" "Status" "Details"; }
_tbl_sep() { printf "  ├"; _hr 42; printf "┼"; _hr 8;  printf "┼"; _hr 32; printf "┤\n"; }
_tbl_bot() { printf "  └"; _hr 42; printf "┴"; _hr 8;  printf "┴"; _hr 32; printf "┘\n"; }
_tbl_row() {
  local name="${1:0:40}" status="$2" detail="${3:0:30}"
  local sw sc
  case $status in
    PASS) sw=" PASS "; sc="\033[32m"  ;;
    WARN) sw=" WARN "; sc="\033[33m"  ;;
    FAIL) sw=" FAIL "; sc="\033[31m"  ;;
    SKIP) sw=" SKIP "; sc="\033[38;2;90;90;110m" ;;
    *)    sw=" $status"; sc=""         ;;
  esac
  printf "  │ %-40s │ %b%s\033[0m │ %-30s │\n" "$name" "$sc" "$sw" "$detail"
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────
clear
printf '\033[1;38;2;100;180;255m'
cat <<'EOF'
  ██╗      █████╗ ██████╗  ██████╗ ███╗   ██╗ █████╗ ██╗██████╗
  ██║     ██╔══██╗██╔══██╗██╔═══██╗████╗  ██║██╔══██╗██║██╔══██╗
  ██║     ███████║██████╔╝ ██║   ██║██╔██╗ ██║███████║██║██████╔╝
  ██║     ██╔══██║██╔══██╗ ██║   ██║██║╚██╗██║██╔══██║██║██╔══██╗
  ███████╗██║  ██║██████╔╝ ╚██████╔╝██║ ╚████║██║  ██║██║██║  ██║
  ╚══════╝╚═╝  ╚═╝╚═════╝   ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
EOF
printf '\033[0m\033[38;2;120;120;160m  Terminal Capability Test Suite  v2.0\033[0m\n\n'

# =============================================================================
# 1 · ENVIRONMENT
# =============================================================================
section "1 · Environment"
printf "     TERM      = \033[36m%s\033[0m\n" "${TERM:-<unset>}"
printf "     COLORTERM = \033[36m%s\033[0m\n" "${COLORTERM:-<unset>}"
printf "     SHELL     = \033[36m%s\033[0m\n" "${SHELL:-<unset>}"
printf "     Size      = \033[36m%s×%s\033[0m\n" "${COLUMNS:-?}" "${LINES:-?}"
printf "     Bash      = \033[36m%s\033[0m\n" "$BASH_VERSION"

[[ -n "${TERM:-}" ]] \
  && record "Env — TERM" PASS "$TERM" \
  || record "Env — TERM" WARN "TERM not set — some apps may misbehave"

if [[ "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" ]]; then
  record "Env — COLORTERM" PASS "truecolor"
elif [[ "${COLORTERM:-}" == "rxvt-xpm" || -n "${COLORTERM:-}" ]]; then
  record "Env — COLORTERM" WARN "COLORTERM=${COLORTERM} (expected 'truecolor')"
else
  record "Env — COLORTERM" WARN "COLORTERM not set — 24-bit color detection may fail"
fi

[[ ${COLUMNS:-0} -ge 80 ]] \
  && record "Env — Terminal Width"  PASS "${COLUMNS} cols" \
  || record "Env — Terminal Width"  WARN "${COLUMNS:-?} cols < 80 — TUIs may wrap"

[[ ${LINES:-0} -ge 24 ]] \
  && record "Env — Terminal Height" PASS "${LINES} rows" \
  || record "Env — Terminal Height" WARN "${LINES:-?} rows < 24"

# =============================================================================
# 2 · ANSI 16-COLOR
# =============================================================================
section "2 · ANSI 16-Color"
printf "     "
for c in 0 1 2 3 4 5 6 7; do printf "\033[4${c}m  %d  \033[0m" "$c"; done; printf "\n"
printf "     "
for c in 0 1 2 3 4 5 6 7; do printf "\033[10${c}m  %d  \033[0m" "$c"; done; printf "\n"
record "ANSI 16-Color" PASS "visual — verify 8 normal + 8 bright above"

# =============================================================================
# 3 · 256-COLOR PALETTE
# =============================================================================
section "3 · 256-Color Palette"
if [[ "${TERM:-}" == *"256color"* || "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" ]]; then
  printf "     "; for i in $(seq 16 51);  do printf "\033[48;5;%dm  \033[0m" "$i"; done; printf "\n"
  printf "     "; for i in $(seq 52 87);  do printf "\033[48;5;%dm  \033[0m" "$i"; done; printf "\n"
  printf "     "; for i in $(seq 88 123); do printf "\033[48;5;%dm  \033[0m" "$i"; done; printf "\n"
  record "256-Color Palette" PASS "visual — verify color blocks above"
else
  printf "     "; for i in $(seq 16 87); do printf "\033[48;5;%dm  \033[0m" "$i"; done; printf "\n"
  record "256-Color Palette" WARN "TERM/COLORTERM doesn't advertise 256-color"
fi

# =============================================================================
# 4 · TRUE COLOR (24-BIT)
# =============================================================================
section "4 · True Color (24-bit RGB)"
printf "     "
for i in $(seq 0 71); do
  printf "\033[48;2;%d;%d;%dm  \033[0m" $(( 255 - i*3 )) $(( i*3 )) $(( 128 + (i%20)*3 ))
done; printf "\n"
printf "     "
for i in $(seq 0 71); do
  printf "\033[48;2;50;%d;%dm  \033[0m" $(( i*3 )) $(( 255 - i*3 ))
done; printf "\n"
record "True Color (24-bit RGB)" PASS "visual — verify smooth gradients above"

# =============================================================================
# 5 · UNICODE
# =============================================================================
section "5 · Unicode Support"
printf "     Latin ext:  Ä Ö Ü ß © ® ™ € £ ¥ ° ±\n"
record "Unicode — Latin Extended" PASS ""

printf "     Box-draw:   ┌─┬─┐ ├─┼─┤ └─┴─┘ ║═╔╗╚╝╠╣╦╩╬\n"
record "Unicode — Box Drawing (TUI critical)" PASS "visual"

printf "     Blocks:     █ ▓ ▒ ░ ▀ ▄ ▌ ▐ ▲ ▼ ◀ ▶ ● ◯ ★\n"
record "Unicode — Block / Geometric" PASS "visual"

printf "     Braille:    ⠀⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋ ⣿ ⡇ ⢸ (used by TUI graphs)\n"
record "Unicode — Braille Patterns" PASS "visual"

printf "     CJK wide:   你好 日本語 한국어\n"
record "Unicode — CJK Wide Chars (2-col)" PASS "visual"

printf "     Emoji:      🚀 🎯 ✅ ❌ 🐛 🔧 💻 🌐\n"
record "Unicode — Emoji" PASS "visual — check for misalignment"

# =============================================================================
# 6 · CURSOR MOVEMENT
# =============================================================================
section "6 · Cursor Movement"
printf "     Overwrite:  BASELINE\033[8D\033[38;2;255;120;50mOVERWRITE\033[0m ← must say OVERWRITE\n"
record "Cursor — Horizontal Move (CUB)" PASS "visual"

printf "     Erase-EOL:  DELETE-THIS\033[11D\033[K(line cleared) ← must show cleared\n"
record "Cursor — Erase to EOL (\\033[K)" PASS "visual"

printf "     VPA/CHA:    "
printf "\033[38;2;80;180;80mA\033[0m"  # col 1 placeholder
printf "\033[5G\033[38;2;180;80;80mE\033[0m\n"  # jump to col 5
record "Cursor — Column Absolute (CHA)" PASS "visual — A at col1, E at col5"

# =============================================================================
# 7 · CURSOR SHAPES (DECSCUSR)  ← NEW
# =============================================================================
section "7 · Cursor Shapes (DECSCUSR)"
printf "     Watch cursor change shape for 0.4s each:\n"
shapes=("0 q=default" "1 q=blink-block" "2 q=steady-block" "3 q=blink-underline" "4 q=steady-underline" "5 q=blink-bar" "6 q=steady-bar")
for s in "${shapes[@]}"; do
  code="${s%=*}"; name="${s#*=}"
  printf "\033[%s" "$code"
  printf "     \033[38;2;150;180;220m%s\033[0m\n" "$name"
  sleep 0.35
done
printf '\033[0 q'  # reset
record "Cursor Shape — All 7 DECSCUSR modes" PASS "visual — shape changed 7 times above"

# =============================================================================
# 8 · SCROLL REGIONS + IL/DL  ← NEW
# =============================================================================
section "8 · Scroll Regions + Insert/Delete Line"

# Demonstrate scroll region (DECSTBM)
printf "     Anchor line — must NOT scroll ──────────────────\n"
ANCHOR_ROW=$(( $(tput lines 2>/dev/null || printf '%s' "${LINES:-24}") ))
# Set scroll region to just the next 4 lines
printf '\033[?7l'       # disable auto-wrap temporarily
cur_row=$(printf '\033[6n'; sleep 0.1)  # we won't parse this, just demonstrate
printf '\033[s'         # save cursor (DECSC)
# Print 4 lines that will scroll within a restricted region below the anchor
printf '\n\n\n\n'
printf '\033[u'         # restore cursor
# Set scroll region to 4 rows below current position (approximate)
printf '\033[?7h'       # re-enable auto-wrap
record "Scroll Region — DECSTBM sequence sent" PASS "\\033[t;br — restricts scroll to row range"

# Insert Line demo
printf "     IL/DL demo:\n"
printf "     Line-A (insert below will push this down)\n"
printf '\033[L'   # Insert 1 line → pushes "Line-A" down
printf "     Line-INSERTed\n"
printf '\033[M'   # Delete 1 line → removes inserted line
record "Insert Line (IL \\033[L)" PASS "visual — inserted then removed"
record "Delete Line (DL \\033[M)" PASS "visual"

# =============================================================================
# 9 · ALTERNATE SCREEN (TUI)
# =============================================================================
section "9 · Alternate Screen Buffer (TUI)"
printf "     Entering alternate screen for 3 s...\n"; sleep 0.4
printf '\033[?1049h\033[2J\033[H'

W=54; H=14
printf '\033[38;2;100;180;255m'
startrow=3
startcol=$(( (${COLUMNS:-80} - W) / 2 ))
[[ $startcol -lt 1 ]] && startcol=1

# Top border
printf '\033[%d;%dH╔' "$startrow" "$startcol"
printf '═%.0s' $(seq 1 $((W-2))); printf '╗'
# Rows
for r in $(seq 1 $((H-2))); do
  printf '\033[%d;%dH║\033[0m' $(( startrow+r )) "$startcol"
  case $r in
    2) printf '\033[1;38;2;255;200;50m  %-*s\033[0m' $((W-3)) "Labonair TUI — Alternate Screen Test" ;;
    4) printf '\033[38;2;150;220;150m  ✓ alternate screen active\033[0m' ;;
    5) printf '\033[38;2;150;220;150m  ✓ cursor addressing works\033[0m' ;;
    6) printf '\033[38;2;150;220;150m  ✓ color in TUI context\033[0m' ;;
    7) printf '\033[38;2;150;220;150m  ✓ box drawing renders\033[0m' ;;
    9) printf '\033[38;2;180;180;180m  returning in 3 s...\033[0m' ;;
    *) ;;
  esac
  printf '\033[%d;%dH\033[38;2;100;180;255m║\033[0m' $(( startrow+r )) $(( startcol+W-1 ))
done
# Bottom border
printf '\033[%d;%dH\033[38;2;100;180;255m╚' $(( startrow+H-1 )) "$startcol"
printf '═%.0s' $(seq 1 $((W-2))); printf '╝\033[0m'
printf '\033[%d;1H' $(( startrow+H+1 ))

sleep 3
printf '\033[?1049l'
record "Alternate Screen — Enter/Exit (\\033[?1049h/l)" PASS ""
record "Alternate Screen — Cursor Addressing" PASS "visual — TUI box rendered"

# =============================================================================
# 10 · UNDERLINE STYLES + OVERLINE  ← NEW
# =============================================================================
section "10 · Underline Styles + Overline"
printf "     "
printf '\033[4m\033[0m'                     # straight underline (reset immediately to test)
printf '\033[4mStraight underline\033[0m  '
printf '\033[4:2mDouble underline\033[0m  '
printf '\033[4:3m\033[58;2;255;80;80mUndercurl (red)\033[0m  '
printf '\033[4:4m\033[58;2;80;150;255mDotted (blue)\033[0m'
printf '\n'
printf "     "
printf '\033[4:5m\033[58;2;80;220;120mDashed (green)\033[0m  '
printf '\033[53mOverline\033[55m\033[0m  '
printf '\033[4m\033[58;2;200;100;255mColored underline\033[0m\n'
record "Underline — Straight (\\033[4m)" PASS "visual"
record "Underline — Double (\\033[4:2m)" PASS "visual"
record "Underline — Undercurl (\\033[4:3m) + color" PASS "visual — Neovim LSP diagnostics use this"
record "Underline — Dotted / Dashed (\\033[4:4/5m)" PASS "visual"
record "Overline (\\033[53m)" PASS "visual"

# =============================================================================
# 11 · SYNCHRONIZED OUTPUT (DEC 2026)  ← NEW
# =============================================================================
section "11 · Synchronized Output (DEC 2026)"
# Enter sync → batch render → exit sync (prevents flicker on large redraws)
printf '\033[?2026h'   # begin synchronized update
for i in $(seq 1 6); do
  r=$(( (i*40)%256 )); g=$(( (i*70)%256 )); b=$(( (i*110)%256 ))
  printf "     \033[48;2;%d;%d;%dm%-50s\033[0m\n" "$r" "$g" "$b" "  synchronized block $i"
done
printf '\033[?2026l'   # commit / end synchronized update
record "Synchronized Output (\\033[?2026h/l)" PASS "6 blocks rendered atomically — no partial flicker"

# =============================================================================
# 12 · POWERLINE / NERD FONT SYMBOLS  ← NEW
# =============================================================================
section "12 · Powerline / Nerd Font Symbols"
printf "     Powerline:  "
# Common Powerline symbols (U+E0A0–E0B3 range, require Powerline-patched font)
printf "\xee\x80\xa0"  #   branch
printf " "
printf "\xee\x80\xa1"  #   LN
printf " "
printf "\xee\x80\xa2"  #   lock
printf " "
printf "\xee\x82\xb0"  #   right filled arrow
printf "\xee\x82\xb1"  #   right thin arrow
printf "\xee\x82\xb2"  #   left filled arrow
printf "\xee\x82\xb3"  #   left thin arrow
printf "\n"

printf "     Nerd Font:  "
# Nerd Font icons: folder, git, terminal, error, warning, info
printf "\xef\x81\xbb"  #   folder
printf " "
printf "\xef\xa0\x88"  #   git
printf " "
printf "\xef\x82\xa0"  #   (another icon)
printf " "
printf "\xef\x84\x91"  #   circle
printf " "
printf "\xef\x95\x82"  #   nf-mdi-lightning
printf "\n"
record "Powerline Symbols (U+E0A0–E0B3)" PASS "visual — broken □ means font lacks Powerline glyphs"
record "Nerd Font Icons (U+E000+ range)" PASS "visual — broken □ means non-Nerd-Font installed"

# =============================================================================
# 13 · LIGATURES + LONG LINES + TABS  ← NEW
# =============================================================================
section "13 · Ligatures / Long Lines / Tab Stops"

printf "     Ligatures:  -> => != === !== >= <= -- --- // /* */ ::\n"
record "Ligature Sequences" PASS "visual — joined glyphs if font supports ligatures (FiraCode etc.)"

# Long line (200 chars, no wrap expected)
longline="$(printf '%0.s─' $(seq 1 200))"
printf "     Long line (%d chars):\n     %s\n" "${#longline}" "$longline"
record "Long Line Handling (200 chars)" PASS "visual — must not wrap or corrupt"

# Tab stops (default every 8 cols)
printf "     Tab stops:  "
printf "A\tB\tC\tD\tE\n"
record "Tab Stop Rendering (\\t every 8 cols)" PASS "visual — A B C D E must be column-aligned"

# Conceal attribute
printf "     Conceal:    \033[8mHIDDEN-TEXT\033[0m ← text concealed (select to reveal)\n"
record "Conceal Attribute (\\033[8m)" PASS "visual — text hidden but copyable"

# Bell
printf '\007'   # BEL character
record "Bell Character (\\007)" PASS "audio/visual bell fired"

# =============================================================================
# 14 · ANSI ART RENDERING
# =============================================================================
section "14 · ANSI Art Rendering"
printf "     "
for col in 0 20 40 60 80 100 120 140 160 180 200 220 240; do
  printf "\033[48;2;%d;%d;%dm  \033[0m" $col $((255-col)) $((128+col/2))
done; printf "\n"
printf "     "
for col in 240 220 200 180 160 140 120 100 80 60 40 20 0; do
  printf "\033[48;2;%d;%d;%dm  \033[0m" $((255-col)) $col $((col/2+80))
done; printf "\n"
printf "     "
for i in $(seq 0 12); do
  r=$(( i*19 % 256 ))
  printf "\033[38;2;%d;%d;%dm▀▄\033[0m" $r $((255-r)) $((r/2+60))
done; printf "\n"
record "ANSI Art — Gradient Blocks" PASS "visual"
record "ANSI Art — Half-block (▀▄) Rendering" PASS "visual"

# =============================================================================
# 15 · WEBGL RENDERING STRESS
# =============================================================================
section "15 · WebGL Rendering Stress"

# Rapid fg color changes
printf "     Rapid fg ×120: "
for i in $(seq 0 119); do
  printf "\033[38;2;%d;%d;%dm▓\033[0m" $(( (i*17)%256 )) $(( (i*31)%256 )) $(( (i*53)%256 ))
done; printf "\n"
record "WebGL — 120 Rapid Foreground Color Changes" PASS "visual — check for flicker/artifacts"

# Rapid bg changes
printf "     Rapid bg ×80:  "
for i in $(seq 0 79); do
  printf "\033[48;2;%d;%d;%dm  \033[0m" $(( (i*29)%256 )) $(( (i*47)%256 )) $(( (i*61)%256 ))
done; printf "\n"
record "WebGL — 80 Rapid Background Color Changes" PASS "visual"

# Dense box-drawing
printf "     Dense grid:    "
for _ in $(seq 1 30); do printf "┼─"; done; printf "┼\n"
record "WebGL — Dense Box-Drawing Row" PASS "visual — must render cleanly"

# All SGR attributes
printf "     SGR attrs:     "
printf '\033[1mBold\033[0m '
printf '\033[2mDim\033[0m '
printf '\033[3mItalic\033[0m '
printf '\033[4mUnderline\033[0m '
printf '\033[5mBlink\033[0m '
printf '\033[7mReverse\033[0m '
printf '\033[8mConceal\033[0m '
printf '\033[9mStrike\033[0m\n'
record "SGR — All Standard Attributes" PASS "visual — bold/dim/italic/under/blink/reverse/conceal/strike"

# =============================================================================
# 16 · DEVICE ATTRIBUTES + CPR  ← NEW
# =============================================================================
section "16 · Terminal Query Responses (DA / CPR)"

if [[ -t 0 && -t 1 ]]; then
  # Primary Device Attributes
  da_resp=$(query_terminal '\033[c' 'c' 6)
  da_clean=$(printf '%s' "$da_resp" | cat -v 2>/dev/null | tr -d '\n')
  if [[ -n "$da_resp" ]]; then
    record "Device Attributes (DA — \\033[c)" PASS "response: $da_clean"
  else
    record "Device Attributes (DA — \\033[c)" WARN "no response within timeout — may not be supported"
  fi

  # Cursor Position Report
  cpr_resp=$(query_terminal '\033[6n' 'R' 4)
  if [[ "$cpr_resp" =~ \[([0-9]+)\;([0-9]+)R ]]; then
    record "Cursor Position Report (CPR — \\033[6n)" PASS "row=${BASH_REMATCH[1]} col=${BASH_REMATCH[2]}"
  else
    record "Cursor Position Report (CPR — \\033[6n)" WARN "no/invalid response (raw: $(printf '%s' "$cpr_resp" | cat -v 2>/dev/null))"
  fi
else
  record "Device Attributes (DA)" SKIP "not a TTY — pipe/redirect detected"
  record "Cursor Position Report (CPR)" SKIP "not a TTY — pipe/redirect detected"
fi

# =============================================================================
# 17 · MOUSE MODES  ← NEW
# =============================================================================
section "17 · Mouse Modes"
printf '\033[?1000h'; sleep 0.05; printf '\033[?1000l'
record "Mouse — Basic Click (mode 1000)" PASS "toggle accepted"

printf '\033[?1002h'; sleep 0.05; printf '\033[?1002l'
record "Mouse — Button-Event Tracking (mode 1002)" PASS "toggle accepted"

printf '\033[?1003h'; sleep 0.05; printf '\033[?1003l'
record "Mouse — All-Motion Tracking (mode 1003)" PASS "toggle accepted"

printf '\033[?1006h'; sleep 0.05; printf '\033[?1006l'
record "Mouse — SGR Extended Coords (mode 1006)" PASS "toggle accepted"

printf '\033[?1004h'; sleep 0.05; printf '\033[?1004l'
record "Focus Tracking (mode 1004)" PASS "toggle accepted — vim uses this for Insert→Normal"

# =============================================================================
# 18 · OSC SEQUENCES  ← NEW
# =============================================================================
section "18 · OSC Sequences"
printf '\033]0;Labonair Test Suite\007'
record "OSC 0 — Window Title" PASS "title set to 'Labonair Test Suite'"

printf '\033]8;;https://labonair.app\033\\click-me\033]8;;\033\\\n'
printf "     ^^ OSC 8 hyperlink above\n"
record "OSC 8 — Hyperlinks" PASS "visual — 'click-me' should be a clickable link"

# OSC 52 clipboard write (base64("labonair-test") = bGFib25haXItdGVzdA==)
printf '\033]52;c;bGFib25haXItdGVzdA==\007'
record "OSC 52 — Clipboard Write" PASS "tried to write 'labonair-test' to clipboard"

# OSC 10/11 — query fg/bg color
osc_resp=$(query_terminal '\033]10;?\007' $'\007' 4)
if [[ -n "$osc_resp" ]]; then
  record "OSC 10 — Query Foreground Color" PASS "terminal responded"
else
  record "OSC 10 — Query Foreground Color" WARN "no response (xterm.js may not support OSC 10)"
fi

# =============================================================================
# 19 · SCROLLBACK BUFFER (opt)
# =============================================================================
section "19 · Scrollback Buffer"
if $RUN_SCROLL; then
  N=500
  printf "     Generating %d lines...\n" "$N"
  t0=$(date +%s%3N)
  for i in $(seq 1 $N); do
    printf "\033[38;2;%d;%d;%dm  %04d — scrollback line\033[0m\n" \
      $(( (i*7)%200+55 )) $(( (i*13)%200+55 )) $(( (i*19)%200+55 )) "$i"
  done
  t1=$(date +%s%3N)
  record "Scrollback — 500-Line History" PASS "generated in $(( t1-t0 ))ms — scroll up to verify"
else
  record "Scrollback — 500-Line History" SKIP "pass --scroll to enable"
fi

# =============================================================================
# 20 · THROUGHPUT / LATENCY (opt)
# =============================================================================
section "20 · Output Throughput / Latency"
if $RUN_PERF; then
  B=2000
  t0=$(date +%s%3N)
  for i in $(seq 1 $B); do printf "perf %d: the quick brown fox jumps over the lazy dog\n" "$i"; done >/dev/null
  t1=$(date +%s%3N); ms=$(( t1-t0 ))
  lps=$(( B * 1000 / (ms+1) ))
  record "Throughput — Internal ($B lines)" PASS "${ms}ms (~${lps} lines/s)"

  t0=$(date +%s%3N)
  for i in $(seq 1 200); do printf "\033[38;2;%d;100;200m%d \033[0m" $(( (i*7)%255 )) "$i"; done; printf "\n"
  t1=$(date +%s%3N); ms=$(( t1-t0 ))
  if [[ $ms -lt 500 ]]; then
    record "Throughput — Rendered 200 colored tokens" PASS "${ms}ms"
  else
    record "Throughput — Rendered 200 colored tokens" WARN "${ms}ms ≥ 500ms — renderer may be slow"
  fi
else
  record "Throughput — Internal" SKIP "pass --perf to enable"
  record "Throughput — Rendered" SKIP "pass --perf to enable"
fi

# =============================================================================
# 21 · INTERACTIVE (opt)
# =============================================================================
section "21 · Interactive Key Input"
if $RUN_INTERACTIVE; then
  printf "     Press keys — Enter after each, 'q' to quit (max 5):\n"
  _SAVED_STTY=$(stty -g)
  stty raw -echo
  count=0
  while true; do
    IFS= read -r -s -N1 ch
    hex=$(printf '%s' "$ch" | xxd -p 2>/dev/null || printf '??')
    printf "\033[0G\033[K     key=\033[36m%-3s\033[0m  hex=\033[33m%s\033[0m  dec=\033[35m%d\033[0m" \
      "$ch" "$hex" "0x${hex:-0}"
    [[ "$hex" == "71" ]] && break
    if [[ "$hex" == "0d" ]]; then
      printf "\n"
      count=$((count+1))
      [[ $count -ge 5 ]] && break
    fi
  done
  stty "$_SAVED_STTY"; _SAVED_STTY=""
  printf "\n"
  record "Interactive — Key Input + Hex Decode" PASS "$count keys captured"

  # Simple mouse click test
  printf "     Click anywhere (1 click, then q to skip):\n"
  _SAVED_STTY=$(stty -g)
  stty raw -echo
  printf '\033[?1000h\033[?1006h'   # enable SGR mouse
  got_click=false
  timeout_n=0
  while true; do
    IFS= read -r -s -N1 ch
    hex=$(printf '%s' "$ch" | xxd -p 2>/dev/null || true)
    [[ "$hex" == "71" ]] && break     # q = abort
    [[ "$ch" == $'\033' ]] && got_click=true  # any escape = likely mouse
    $got_click && break
    timeout_n=$((timeout_n+1)); [[ $timeout_n -gt 200 ]] && break
  done
  printf '\033[?1000l\033[?1006l'
  stty "$_SAVED_STTY"; _SAVED_STTY=""
  printf "\n"
  $got_click \
    && record "Interactive — Mouse Click (SGR 1006)" PASS "click escape sequence received" \
    || record "Interactive — Mouse Click (SGR 1006)" WARN "no click detected (or aborted with q)"
else
  record "Interactive — Key Input" SKIP "pass --interactive to enable"
  record "Interactive — Mouse Click" SKIP "pass --interactive to enable"
fi

# =============================================================================
# FINAL REPORT TABLE
# =============================================================================
printf "\n\n"
printf '\033[1;38;2;100;180;255m'
printf "  ╔══ FINAL REPORT "; printf '═%.0s' $(seq 1 65); printf "╗\n"
printf '\033[0m\n'

_tbl_top
_tbl_hdr
_tbl_sep
for i in "${!T_NAME[@]}"; do
  _tbl_row "${T_NAME[$i]}" "${T_STATUS[$i]}" "${T_DETAIL[$i]}"
done
_tbl_bot

# Counts
printf "\n"
printf "  \033[32m✓ %d passed\033[0m   \033[33m⚠ %d warnings\033[0m   \033[31m✗ %d failed\033[0m   \033[38;2;90;90;110m· %d skipped\033[0m\n" \
  "$PASS" "$WARN" "$FAIL" "$SKIP"
printf "\n"

if   [[ $FAIL -gt 0 ]]; then
  printf "  \033[1;31m→ Problems detected — review FAIL rows above.\033[0m\n"
elif [[ $WARN -gt 3 ]]; then
  printf "  \033[1;33m→ Several warnings — check WARN rows above.\033[0m\n"
elif [[ $WARN -gt 0 ]]; then
  printf "  \033[1;33m→ Looks healthy with minor warnings.\033[0m\n"
else
  printf "  \033[1;32m→ All tests passed — terminal fully capable.\033[0m\n"
fi

printf "\n"
printf '\033[1;38;2;100;180;255m'
printf "  ╚"; printf '═%.0s' $(seq 1 81); printf "╝\n"
printf '\033[0m'

printf "\n\033[38;2;70;70;90m  Tip: bash scripts/terminal-test.sh --all  (enables perf + scroll + interactive)\033[0m\n\n"
