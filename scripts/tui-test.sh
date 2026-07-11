#!/usr/bin/env bash
# Labonair TUI Rendering Edge-Case Test
#
# Usage: bash scripts/tui-test.sh [--fast]
#
# Complements terminal-test.sh (which checks raw capabilities: colors,
# unicode, individual escape codes). This script instead builds the actual
# *patterns* real full-screen TUIs use — split scroll regions, floating
# overlays, live redraw loops, paging, alternate charsets — and the specific
# edge cases that tend to break terminal emulators, renderer pools, and
# scrollback/reflow logic even when the individual escape codes work fine in
# isolation.
#
# Same rules as terminal-test.sh's simple edition: no test reads a response
# back from the terminal (no DA/CPR/OSC queries) — that round-trip is racy
# across terminals and was the root cause of real bugs here before. Every
# sequence is fire-and-forget. Sequential, immediate output, no deferred
# array-of-results.

FAST=false
for arg in "$@"; do
  case $arg in
    --fast) FAST=true ;;
  esac
done

# Shorter sleeps under --fast so this is scriptable/CI-able; full sleeps by
# default so a human actually has time to see each pattern render.
d() { $FAST && sleep "0.05" || sleep "$1"; }

PASS=0; WARN=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS + 1)); }
warn() { printf "  \033[33m⚠\033[0m %s \033[2m(%s)\033[0m\n" "$1" "$2"; WARN=$((WARN + 1)); }
header() { printf "\n\033[1;35m%s\033[0m\n" "$1"; }

cols=$(tput cols 2>/dev/null || stty size 2>/dev/null | cut -d' ' -f2)
rows=$(tput lines 2>/dev/null || stty size 2>/dev/null | cut -d' ' -f1)
cols=${cols:-80}; rows=${rows:-24}

_alt=0
cleanup() {
  [[ $_alt -eq 1 ]] && printf '\033[?1049l'
  printf '\033[0m\033[?25h\033[r\033[?2004l\033[0 q'
  stty sane 2>/dev/null || true
}
trap cleanup EXIT

enter_alt() { _alt=1; printf '\033[?1049h\033[2J\033[H\033[?25l'; }
exit_alt()  { printf '\033[?1049l\033[?25h'; _alt=0; }

clear
printf '\033[1;35mLabonair TUI Rendering Edge-Case Test\033[0m\n'
printf "  terminal: %sx%s   \033[2m(each pattern below mimics a real full-screen app)\033[0m\n" "$cols" "$rows"

# ── 1. Split scroll region: fixed header + scrolling body + fixed footer ───
# The canonical hard case: htop/tmux/less all pin a status line while only
# the middle region scrolls. DECSTBM restricts scrolling to rows 3..(rows-2);
# printing past the bottom of that region must scroll ONLY inside it, never
# touching row 1 (header) or the last row (footer).
header "1. Split scroll region (fixed header/footer, scrolling body)"
enter_alt
body_top=3; body_bot=$((rows - 2))
printf '\033[1;1H\033[7m%-*s\033[0m' "$cols" " HEADER — must stay pinned to row 1"
printf '\033[%d;1H\033[7m%-*s\033[0m' "$rows" "$cols" " FOOTER — must stay pinned to the last row"
printf '\033[%d;%dr' "$body_top" "$body_bot"   # DECSTBM: restrict scroll region
printf '\033[%d;1H' "$body_top"
for i in $(seq 1 $((body_bot - body_top + 6))); do
  printf "  body line %d — scrolls inside the region only\n" "$i"
  d 0.05
done
printf '\033[r'   # reset scroll region to full screen before leaving
d 0.6
exit_alt
ok "header/footer should have stayed put while the body scrolled past them"

# ── 2. Floating overlay on top of existing content ─────────────────────────
# fzf/telescope/dialog-style popup: draw a base screen, then paint a box on
# top of it without clearing the whole screen first.
header "2. Floating overlay (popup drawn on top of a base screen)"
enter_alt
printf '\033[2J\033[H'
for i in $(seq 1 "$rows"); do printf "\033[%d;1H\033[2mbase content line %d\033[0m" "$i" "$i"; done
d 0.4
pw=40; ph=6
prow=$(((rows - ph) / 2)); pcol=$(((cols - pw) / 2))
[[ $prow -lt 1 ]] && prow=1; [[ $pcol -lt 1 ]] && pcol=1
for r in $(seq 0 $((ph - 1))); do
  printf '\033[%d;%dH\033[44;37m%-*s\033[0m' $((prow + r)) "$pcol" "$pw" ""
done
printf '\033[%d;%dH\033[44;37;1m %-*s\033[0m' "$prow" $((pcol + 1)) $((pw - 2)) "MODAL OVERLAY"
printf '\033[%d;%dH\033[44;37m %-*s\033[0m' $((prow + 2)) $((pcol + 1)) $((pw - 2)) "Base content behind this box"
printf '\033[%d;%dH\033[44;37m %-*s\033[0m' $((prow + 3)) $((pcol + 1)) $((pw - 2)) "must NOT show through it."
d 1.0
exit_alt
ok "popup should have fully occluded base content behind it, nothing bled through"

# ── 3. Progress bar (same-line \r updates) ──────────────────────────────────
header "3. Progress bar (carriage-return same-line updates)"
for p in 0 25 50 75 100; do
  filled=$((p / 5)); empty=$((20 - filled))
  bar=$(printf '%*s' "$filled" '' | tr ' ' '#')
  gap=$(printf '%*s' "$empty" '')
  printf '\r  [%s%s] %3d%%' "$bar" "$gap" "$p"
  d 0.15
done
printf '\n'
ok "progress bar above should show ONE line animating, not five stacked lines"

# ── 4. Spinner (cursor save/restore same-cell updates) ──────────────────────
header "4. Spinner (single-cell repeated overwrite)"
printf '  '
for f in / - '\' '|' / - '\' '|'; do
  printf '\b%s' "$f"
  d 0.08
done
printf '\b \n'
ok "spinner glyph above should have overwritten itself in place, no trailing garbage"

# ── 5. Live dashboard (rapid full-screen redraw, htop-style) ────────────────
header "5. Live dashboard (rapid full-screen redraw loop)"
enter_alt
for frame in 1 2 3 4 5 6; do
  printf '\033[H'
  printf '\033[7m %-*s\033[0m\n' $((cols - 1)) " live dashboard — frame $frame/6"
  for row in 1 2 3 4 5; do
    pct=$(((frame * 17 + row * 23) % 100))
    filled=$((pct / 5))
    bar=$(printf '%*s' "$filled" '' | tr ' ' '█')
    gap=$(printf '%*s' $((20 - filled)) '')
    printf '  cpu%d [\033[32m%s\033[0m%s] %3d%%\033[K\n' "$row" "$bar" "$gap" "$pct"
  done
  printf '\033[J'   # clear anything below in case this frame is shorter
  d 0.15
done
d 0.3
exit_alt
ok "dashboard should have redrawn cleanly frame-to-frame, no leftover rows from earlier frames"

# ── 6. Paged / scrollable list taller than the screen ───────────────────────
header "6. Paged list (content taller than the screen, manual paging)"
enter_alt
total=$((rows * 3))
page_size=$((rows - 2))
# A short/misreported terminal height (rows <= 2) would make page_size <= 0,
# so `page * page_size` never grows — an infinite loop that never satisfies
# the `-lt total` exit condition. Floor it, and keep a hard iteration guard
# as a second safety net so the loop is always guaranteed to terminate.
[[ $page_size -lt 3 ]] && page_size=3
page=0
page_guard=0
while [[ $((page * page_size)) -lt $total && $page_guard -lt 100 ]]; do
  printf '\033[2J\033[H'
  start=$((page * page_size + 1))
  end=$((start + page_size - 1)); [[ $end -gt $total ]] && end=$total
  for i in $(seq "$start" "$end"); do printf "  item %04d\n" "$i"; done
  printf '\033[%d;1H\033[7m page %d — %d/%d items\033[0m' "$rows" $((page + 1)) "$end" "$total"
  d 0.25
  page=$((page + 1))
  page_guard=$((page_guard + 1))
done
exit_alt
ok "each page above should have fully replaced the previous one, no bleed-through between pages"

# ── 7. Syntax-highlighted block (dense SGR run changes) ─────────────────────
header "7. Syntax highlighting (dense per-token color changes)"
printf '  \033[35mfn\033[0m \033[34mmain\033[0m\033[37m(\033[0m\033[36m)\033[0m \033[37m{\033[0m\n'
printf '  \033[37m    \033[35mlet\033[0m \033[33mx\033[0m \033[37m=\033[0m \033[32m"hello"\033[0m\033[37m;\033[0m\n'
printf '  \033[37m    \033[34mprintln!\033[0m\033[37m(\033[0m\033[33m"{}"\033[0m\033[37m,\033[0m \033[33mx\033[0m\033[37m);\033[0m\n'
printf '  \033[37m}\033[0m\n'
ok "code block above should have each token colored independently, no color bleeding into the next token"

# ── 8. Selection / reverse-video spans ───────────────────────────────────────
header "8. Selection highlighting (partial-line reverse video)"
printf '  normal \033[7mSELECTED TEXT\033[0m normal again\n'
printf '  \033[7m entire line selected \033[0m\n'
ok "reverse-video spans above should have sharp boundaries, not bleed past the marked text"

# ── 9. Wide-char / emoji grid alignment ──────────────────────────────────────
header "9. Wide-char grid alignment (mixed 1-col / 2-col / ZWJ cells)"
printf '  |%-4s|%-4s|%-4s|\n' "A" "你" "🚀"
printf '  |%-4s|%-4s|%-4s|\n' "B" "好" "🎯"
printf '  \033[2mZWJ family: 👨‍👩‍👧‍👦   flag: 🇩🇪   combining: e\xcc\x81 (e + acute)\033[0m\n'
ok "grid columns above should stay aligned despite mixed character widths (visual check — this is a hard case, many terminals get it wrong)"

# ── 10. Nested panels (tmux-style split layout) ──────────────────────────────
header "10. Nested panels (split-pane layout)"
enter_alt
printf '\033[2J\033[H'
mid=$((cols / 2))
for r in $(seq 1 "$rows"); do
  printf '\033[%d;1H│' "$r"
  printf '\033[%d;%dH│' "$r" "$mid"
  printf '\033[%d;%dH│' "$r" "$cols"
done
printf '\033[1;2H\033[7m pane A \033[0m'
printf '\033[1;%dH\033[7m pane B \033[0m' $((mid + 2))
for r in $(seq 3 $((rows - 1))); do
  printf '\033[%d;3H left pane line %d' "$r" "$r"
  printf '\033[%d;%dH right pane line %d' "$r" $((mid + 3)) "$r"
done
d 0.8
exit_alt
ok "two side-by-side panes above should not have overwritten each other's content"

# ── 11. DEC Special Graphics charset (non-Unicode line drawing) ─────────────
# Older ncurses apps without a UTF-8 locale draw boxes via this charset
# instead of Unicode box-drawing — a distinct code path from section 9 of
# terminal-test.sh's Unicode box-drawing test.
header "11. DEC Special Graphics charset (legacy line-drawing, non-Unicode)"
printf '  \033(0lqqqqk\033(B\n'
printf '  \033(0x    x\033(B\n'
printf '  \033(0mqqqqj\033(B\n'
ok "box above drawn via DEC Special Graphics (ESC ( 0), not Unicode — should still render as a clean box"

# ── 12. Insert/delete character mid-line (ICH/DCH) ───────────────────────────
header "12. Insert/delete character mid-line"
printf '  ABCDEFGH\033[3D\033[2@XY\n'
printf '  \033[2mabove: inserted XY before position 6 without retyping the tail\033[0m\n'
printf '  ABCDEFGH\033[3D\033[2P\n'
printf '  \033[2mabove: deleted 2 chars at position 6, tail shifted left\033[0m\n'
ok "ICH (\\033[@) / DCH (\\033[P) mid-line edits above should shift only the tail, not the whole line"

# ── 13. Cursor at screen boundary corners ────────────────────────────────────
header "13. Cursor boundary corners (edge-of-screen writes)"
enter_alt
printf '\033[2J'
printf '\033[1;1HTL'
printf '\033[1;%dH%s' $((cols - 1)) "TR"
printf '\033[%d;1H%s' "$rows" "BL"
# Bottom-right corner: writing the LAST cell must not force an unwanted
# scroll (a classic off-by-one bug in terminal emulators' auto-wrap logic).
printf '\033[%d;%dH%s' "$rows" $((cols - 1)) "BR"
d 0.8
exit_alt
ok "all four corners above should have shown their label with no forced scroll or wraparound"

# ── 14. Rapid alternate-screen enter/exit cycling ────────────────────────────
# Simulates quickly opening/closing vim, less, fzf back to back — stresses
# whether the main-buffer state (and any renderer pool behind it) survives
# repeated toggling intact.
header "14. Rapid alternate-screen cycling (open/close a TUI 5x fast)"
printf "  main-buffer marker BEFORE cycling — must still be here after\n"
for i in 1 2 3 4 5; do
  _alt=1
  printf '\033[?1049h\033[2J\033[H'
  printf "cycle %d/5" "$i"
  d 0.1
  printf '\033[?1049l'
  _alt=0
done
printf "  main-buffer marker AFTER cycling — should be directly below the BEFORE line\n"
ok "both marker lines above should be present with nothing from the alt-screen cycles leaked between them"

# ── 15. Bracketed paste mode toggle ──────────────────────────────────────────
header "15. Bracketed paste mode"
printf '\033[?2004h'
d 0.05
printf '\033[?2004l'
ok "bracketed paste mode toggled on then off (fire-and-forget, no response read)"

# ── 16. Bell ──────────────────────────────────────────────────────────────────
header "16. Terminal bell"
printf '\007'
ok "bell character sent — audio/visual bell should have fired once"

# ── Summary ──────────────────────────────────────────────────────────────────
header "Summary"
printf "  \033[32m%d checks completed\033[0m   \033[33m%d warnings\033[0m\n" "$PASS" "$WARN"
printf "  \033[2mEvery line above needs a human to actually look at it — this test verifies\033[0m\n"
printf "  \033[2mpatterns, not just individual escape codes. Re-run with --fast for a quick pass.\033[0m\n\n"
