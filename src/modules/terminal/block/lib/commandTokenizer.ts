// ─── Shell-line tokenizer (for per-argument ghost-text completion) ──────────
//
// Deliberately not a full shell parser — this only needs to answer "which
// argument is the cursor in, and what has been committed before it" well
// enough to index/query shell history by argument position (see
// commandHistory.ts's suggestArguments). Handles the cases that actually
// show up in typed commands: single/double-quoted spans (including spaces
// inside them), backslash-escaped spaces, and `|`/`&&`/`||`/`;` as segment
// separators so `ls -la | grep w` completes `w` like a fresh command name
// instead of a third `ls` argument.

export type Segment = {
  /** Raw token text, quotes/escapes included verbatim (matches how the
   *  same text would appear in a history line typed the same way). */
  tokens: string[];
  /** Doc offset (relative to the start of the line) where each token begins. */
  tokenStarts: number[];
};

export type TokenizeResult = {
  segments: Segment[];
  /** Index of the segment the cursor is in (always the last one, since a
   *  cursor at end-of-doc can only ever be "in" the final segment). */
  activeSegmentIndex: number;
  /** Index within the active segment of the token under/before the cursor.
   *  -1 when the line is empty. */
  activeTokenIndex: number;
  /** Text of the active token from its start up to the cursor. */
  activeTokenPrefix: string;
  /** Committed tokens before the active one, within the active segment. */
  precedingTokens: string[];
  /** True while the cursor sits inside an unterminated quote — completion
   *  is suppressed in this case (see edge case notes in the plan). */
  inUnterminatedQuote: boolean;
};

const SEGMENT_OPERATORS = ["&&", "||", "|", ";"];

/** Splits `line` into segments at unquoted `|`, `&&`, `||`, `;`. Each segment
 *  is itself split into whitespace-delimited tokens, respecting quotes
 *  ('...'/"...") and backslash-escaped spaces as non-boundaries. */
function tokenizeLine(line: string): { segments: Segment[]; unterminatedQuoteFrom: number | null } {
  const segments: Segment[] = [];
  let tokens: string[] = [];
  let tokenStarts: number[] = [];
  let current = "";
  let currentStart = -1;
  let quote: '"' | "'" | null = null;
  let quoteStart = -1;

  const flushToken = () => {
    if (current.length > 0) {
      tokens.push(current);
      tokenStarts.push(currentStart);
      current = "";
      currentStart = -1;
    }
  };
  const flushSegment = () => {
    flushToken();
    segments.push({ tokens, tokenStarts });
    tokens = [];
    tokenStarts = [];
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      quoteStart = i;
      if (currentStart === -1) currentStart = i;
      current += ch;
      continue;
    }

    if (ch === "\\" && i + 1 < line.length) {
      // Escaped char (commonly a space) — consume both, never a boundary.
      if (currentStart === -1) currentStart = i;
      current += ch + line[i + 1];
      i += 1;
      continue;
    }

    if (ch === " " || ch === "\t") {
      flushToken();
      continue;
    }

    // Unquoted operator characters — only meaningful as a boundary when not
    // accumulating part of a longer token that already started (e.g. `a|b`
    // is rare enough to not special-case; operators here are expected to be
    // whitespace- or token-adjacent, which covers real shell usage).
    if (ch === "|" || ch === "&" || ch === ";") {
      const two = line.slice(i, i + 2);
      const isDoubleOp = two === "&&" || two === "||";
      const op = isDoubleOp ? two : ch;
      if (SEGMENT_OPERATORS.includes(op)) {
        flushToken();
        flushSegment();
        if (isDoubleOp) i += 1;
        continue;
      }
    }

    if (currentStart === -1) currentStart = i;
    current += ch;
  }

  const unterminatedQuoteFrom = quote ? quoteStart : null;
  flushToken();
  segments.push({ tokens, tokenStarts });
  return { segments, unterminatedQuoteFrom };
}

/** Tokenizes `line` and locates the cursor (`cursorPos`, a doc offset into
 *  `line`) within it. Callers are expected to have already isolated the
 *  current line (composer input is normally single-line, but Shift-Enter
 *  allows embedded `\n` — see ShellComposerInput) and to only call this when
 *  the cursor is at the end of that line (mid-line completion isn't
 *  supported, matching the existing whole-line ghost text's `atEnd`
 *  restriction). */
export function tokenize(line: string, cursorPos: number): TokenizeResult {
  const upToCursor = line.slice(0, cursorPos);
  const { segments, unterminatedQuoteFrom } = tokenizeLine(upToCursor);
  const activeSegmentIndex = segments.length - 1;
  const active = segments[activeSegmentIndex] ?? { tokens: [], tokenStarts: [] };

  const trailingWhitespace = /[ \t]$/.test(upToCursor) || upToCursor.length === 0;
  const activeTokenIndex = trailingWhitespace ? active.tokens.length : active.tokens.length - 1;
  const activeTokenPrefix = trailingWhitespace ? "" : (active.tokens[active.tokens.length - 1] ?? "");
  const precedingTokens = trailingWhitespace ? active.tokens : active.tokens.slice(0, -1);

  return {
    segments,
    activeSegmentIndex,
    activeTokenIndex,
    activeTokenPrefix,
    precedingTokens,
    inUnterminatedQuote: unterminatedQuoteFrom !== null,
  };
}

/** Same segment/token split as `tokenize`, but for a full historical line
 *  with no "active" cursor — used to build the per-position history index.
 *  Returns each segment's token list only. */
export function tokenizeFull(line: string): string[][] {
  return tokenizeLine(line).segments.map((s) => s.tokens);
}
