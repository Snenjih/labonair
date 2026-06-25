# Labonair Theme Schema v2 — Migration Prompt for Community Themes Repository

> **Context for the agent executing this prompt:**
> This document is a complete migration guide for the Labonair community themes repository.
> You must update every existing theme file AND the indexer/CI pipeline to conform to the
> new schema defined below. Read this entire document before writing a single line of code.

---

## What Changed and Why

Labonair's theme engine has been expanded from ~38 color variables to ~70. The new schema
(`schema.json` in the main app repo) is now the canonical definition for what a theme file
can express. Every key in the schema maps to a live CSS custom property in the app.

The changes fall into four categories:

1. **New surface tokens** — toolbar, title bar, and status bar can now be individually colored
2. **New border states** — focused, selected, disabled, transparent, and variant borders
3. **New semantic status colors** — error, warning, success, info, hint, modified
4. **Terminal palette expansion** — dim ANSI variants, bright/dim foreground overrides
5. **Key rename / notation change** — terminal and sidebar keys moved to dot notation

---

## Full Schema Reference (v2)

This is the complete set of valid keys for a Labonair theme JSON file. Every key is optional —
the app falls back to CSS defaults for any missing key. Themes do not need to include all keys,
but well-crafted themes should define all of them.

```json
{
  "name": "My Theme",
  "author": "Author Name",
  "type": "dark",
  "colors": {

    // ── Core surfaces ──────────────────────────────────────────────────────────
    "background":            "#...",   // Main app background
    "foreground":            "#...",   // Default text color
    "card":                  "#...",   // Card/panel background
    "card_foreground":       "#...",   // Card text color
    "popover":               "#...",   // Popover/dropdown background
    "popover_foreground":    "#...",   // Popover text color

    // ── Primary action color ───────────────────────────────────────────────────
    "primary":               "#...",   // Accent / brand color
    "primary_foreground":    "#...",   // Text on primary backgrounds

    // ── Secondary / muted surfaces ────────────────────────────────────────────
    "secondary":             "#...",   // Secondary surface color
    "secondary_foreground":  "#...",   // Text on secondary backgrounds
    "muted":                 "#...",   // Muted surface (tab bars, rows)
    "muted_foreground":      "#...",   // Muted / subdued text
    "accent":                "#...",   // Hover / active highlight surface
    "accent_foreground":     "#...",   // Text on accent backgrounds

    // ── Destructive ───────────────────────────────────────────────────────────
    "destructive":           "#...",   // Destructive action color (delete, error)
    "destructive_foreground":"#...",   // Text on destructive backgrounds  ← NEW

    // ── Form / focus ──────────────────────────────────────────────────────────
    "border":                "#...",   // Default border color
    "input":                 "#...",   // Input field background
    "ring":                  "#...",   // Legacy focus ring (still used by some shadcn components)

    // ── Named surface areas  ──────────────────────────────────────────────────
    "sidebar.background":    "#...",   // Sidebar / file tree background   ← RENAMED (was: "sidebar")
    "toolbar.background":    "#...",   // Top toolbar / header bar          ← NEW
    "title_bar.background":  "#...",   // Window title bar area             ← NEW
    "status_bar.background": "#...",   // Bottom status bar                 ← NEW

    // ── Border state variants ─────────────────────────────────────────────────
    "border.variant":        "#...",   // Subtle structural borders         ← NEW
    "border.focused":        "#...",   // Border when element is focused    ← NEW
    "border.selected":       "#...",   // Border when element is selected   ← NEW
    "border.transparent":    "#00000000", // Transparent border (no border) ← NEW
    "border.disabled":       "#...",   // Border for disabled elements      ← NEW

    // ── Semantic status colors ─────────────────────────────────────────────────
    "modified":              "#...",   // Modified/changed indicator        ← NEW
    "error":                 "#...",   // Error state (separate from destructive) ← NEW
    "warning":               "#...",   // Warning state                     ← NEW
    "info":                  "#...",   // Informational state               ← NEW
    "hint":                  "#...",   // Hint / secondary metadata         ← NEW
    "success":               "#...",   // Success / done state              ← NEW

    // ── UI interaction ────────────────────────────────────────────────────────
    "cursor":                "#...",   // Text cursor / caret color         ← NEW
    "selection":             "#...20", // Text selection background (supports alpha) ← NEW

    // ── Terminal surface ──────────────────────────────────────────────────────
    "terminal.background":        "#...",  // Terminal panel background   ← RENAMED (was: "terminal_background")
    "terminal.foreground":        "#...",  // Terminal default text        ← RENAMED (was: "terminal_foreground")
    "terminal.bright_foreground": "#...",  // Bold/bright terminal text    ← NEW
    "terminal.dim_foreground":    "#...",  // Dim terminal text            ← NEW

    // ── Terminal ANSI normal 8 ────────────────────────────────────────────────
    // (all RENAMED from terminal_black etc. to terminal.ansi.black etc.)
    "terminal.ansi.background":   "#...",  // ANSI background (usually = terminal.background)
    "terminal.ansi.black":        "#...",  // ← was: terminal_black
    "terminal.ansi.red":          "#...",  // ← was: terminal_red
    "terminal.ansi.green":        "#...",  // ← was: terminal_green
    "terminal.ansi.yellow":       "#...",  // ← was: terminal_yellow
    "terminal.ansi.blue":         "#...",  // ← was: terminal_blue
    "terminal.ansi.magenta":      "#...",  // ← was: terminal_magenta
    "terminal.ansi.cyan":         "#...",  // ← was: terminal_cyan
    "terminal.ansi.white":        "#...",  // ← was: terminal_white

    // ── Terminal ANSI bright 8 ────────────────────────────────────────────────
    "terminal.ansi.bright_black":   "#...",  // ← was: terminal_bright_black
    "terminal.ansi.bright_red":     "#...",  // ← was: terminal_bright_red
    "terminal.ansi.bright_green":   "#...",  // ← was: terminal_bright_green
    "terminal.ansi.bright_yellow":  "#...",  // ← was: terminal_bright_yellow
    "terminal.ansi.bright_blue":    "#...",  // ← was: terminal_bright_blue
    "terminal.ansi.bright_magenta": "#...",  // ← was: terminal_bright_magenta
    "terminal.ansi.bright_cyan":    "#...",  // ← was: terminal_bright_cyan
    "terminal.ansi.bright_white":   "#...",  // ← was: terminal_bright_white

    // ── Terminal ANSI dim 8 ───────────────────────────────────────────────────
    "terminal.ansi.dim_black":      "#...",  // ← NEW
    "terminal.ansi.dim_red":        "#...",  // ← NEW
    "terminal.ansi.dim_green":      "#...",  // ← NEW
    "terminal.ansi.dim_yellow":     "#...",  // ← NEW
    "terminal.ansi.dim_blue":       "#...",  // ← NEW
    "terminal.ansi.dim_magenta":    "#...",  // ← NEW
    "terminal.ansi.dim_cyan":       "#...",  // ← NEW
    "terminal.ansi.dim_white":      "#...",  // ← NEW

    // ── Misc UI ───────────────────────────────────────────────────────────────
    "sidebar-foreground":           "#...",
    "sidebar-primary":              "#...",
    "sidebar-primary-foreground":   "#...",
    "sidebar-accent":               "#...",
    "sidebar-accent-foreground":    "#...",
    "sidebar-border":               "#...",
    "sidebar-ring":                 "#..."
  }
}
```

---

## Key Rename Table (old → new)

The app still accepts the old keys for backward compatibility, but all themes in this repository
should be migrated to the canonical new keys listed below.

| Old key (v1) | New key (v2) | Notes |
|---|---|---|
| `sidebar` | `sidebar.background` | Dot notation |
| `terminal_background` | `terminal.background` | Dot notation |
| `terminal_foreground` | `terminal.foreground` | Dot notation |
| `terminal_black` | `terminal.ansi.black` | Dot notation |
| `terminal_red` | `terminal.ansi.red` | Dot notation |
| `terminal_green` | `terminal.ansi.green` | Dot notation |
| `terminal_yellow` | `terminal.ansi.yellow` | Dot notation |
| `terminal_blue` | `terminal.ansi.blue` | Dot notation |
| `terminal_magenta` | `terminal.ansi.magenta` | Dot notation |
| `terminal_cyan` | `terminal.ansi.cyan` | Dot notation |
| `terminal_white` | `terminal.ansi.white` | Dot notation |
| `terminal_bright_black` | `terminal.ansi.bright_black` | Dot notation |
| `terminal_bright_red` | `terminal.ansi.bright_red` | Dot notation |
| `terminal_bright_green` | `terminal.ansi.bright_green` | Dot notation |
| `terminal_bright_yellow` | `terminal.ansi.bright_yellow` | Dot notation |
| `terminal_bright_blue` | `terminal.ansi.bright_blue` | Dot notation |
| `terminal_bright_magenta` | `terminal.ansi.bright_magenta` | Dot notation |
| `terminal_bright_cyan` | `terminal.ansi.bright_cyan` | Dot notation |
| `terminal_bright_white` | `terminal.ansi.bright_white` | Dot notation |
| `card-foreground` | `card_foreground` | Underscore preferred in JSON |
| `popover-foreground` | `popover_foreground` | Underscore preferred in JSON |
| `primary-foreground` | `primary_foreground` | Underscore preferred in JSON |
| `secondary-foreground` | `secondary_foreground` | Underscore preferred in JSON |
| `muted-foreground` | `muted_foreground` | Underscore preferred in JSON |
| `accent-foreground` | `accent_foreground` | Underscore preferred in JSON |

---

## New Keys and Suggested Values

When migrating a theme that does not yet define the new keys, derive sensible values from
existing colors using these rules:

| New key | Suggested derivation |
|---|---|
| `toolbar.background` | Same as `card` or slightly darker than `background` |
| `title_bar.background` | Same as `toolbar.background` |
| `status_bar.background` | Same as `toolbar.background` |
| `border.variant` | Same as `border` or 1 step darker |
| `border.focused` | Same as `ring` or `primary` |
| `border.selected` | Same as `border.focused` |
| `border.transparent` | Always `"#00000000"` |
| `border.disabled` | Desaturated, darker version of `border` |
| `destructive_foreground` | `"#ffffff"` for dark themes, `"#000000"` for light |
| `modified` | A blue or cyan that stands out on the background |
| `error` | Same as or similar to `destructive` |
| `warning` | Amber/yellow that stands out — consider `primary` if it's golden |
| `info` | A calm blue — `terminal.ansi.blue` is a good source |
| `hint` | Same as `muted_foreground` |
| `success` | A green — `terminal.ansi.green` or `terminal.ansi.bright_green` |
| `cursor` | Same as `primary` or `ring` |
| `selection` | `primary` with `20` hex alpha suffix (e.g. `#6366f120`) |
| `terminal.bright_foreground` | `"#ffffff"` for dark themes |
| `terminal.dim_foreground` | `muted_foreground` or ~60% lightness of `terminal.foreground` |
| `terminal.ansi.dim_*` | Each dim color ≈ 75–80% brightness of the corresponding normal ANSI color |
| `terminal.ansi.background` | Same value as `terminal.background` |

---

## Alpha in Color Values

The `selection` key (and optionally `border.transparent`) supports **8-digit hex with alpha**:
- Format: `#RRGGBBAA` where `AA` is the alpha byte in hex (`00` = transparent, `ff` = opaque)
- Example: `#6366f120` = indigo at ~12.5% opacity
- All other color keys should use 6-digit hex `#RRGGBB` or 3-digit `#RGB`

---

## Instructions for the Agent

You are working in the Labonair community themes repository. Your job is:

### 1. Migrate every existing theme JSON file

For each `.json` file in the themes directory:

a) **Rename old keys to new dot-notation keys** using the rename table above. The old underscore
   keys (`terminal_black`, etc.) still work in the app, but this repository should only contain
   canonical v2 keys going forward.

b) **Add all missing new keys** using the derivation rules in the table above. Derive values
   intelligently from the theme's existing color palette — do not use the same hex value for
   every new key. A dark theme with a blue primary should have a blue `cursor`, blue `border.focused`,
   etc.

c) **Preserve all existing keys** that are not being renamed. Do not remove `card`, `popover`,
   `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`,
   `sidebar-*` keys.

d) **Validate JSON** — every theme file must remain valid JSON after migration.

e) **Do not change** `name`, `author`, or `type` fields.

### 2. Update the schema validation file (if one exists)

If the repository contains a JSON Schema file (e.g. `schema.json`, `theme.schema.json`,
`validate.json`, or similar) that defines the valid shape of a theme file, update it to include
all new keys. The schema should:

- List all new keys from the full schema reference above
- Mark all keys as optional (themes do not need to define every key)
- Keep old underscore keys as accepted aliases (for backward compat with submitted themes)
- Add a comment or description for each new key group

### 3. Update the CI / indexer workflow

If the repository has a CI pipeline, GitHub Actions workflow, or indexer script that:

- **Validates theme JSON files**: add all new keys to the accepted-keys allowlist so themes
  that use new keys don't fail validation
- **Generates a theme index** (e.g. `index.json`, `themes.json`): ensure new keys are included
  in the index output if they are serialized — specifically `toolbar.background`, `primary`,
  `background`, `sidebar.background` are commonly used for thumbnail generation
- **Generates theme thumbnails or preview images**: update the color extraction logic to read
  `sidebar.background` (new key, was `sidebar`) so thumbnails remain accurate
- **Lints or enforces required fields**: the only truly required fields are `name`, `type`, and
  `colors` — all individual color keys remain optional; update any lint rules that enforce
  specific color key presence to also accept the new dot-notation variants

### 4. Update README or documentation

If the repository has a README, CONTRIBUTING guide, or theme authoring docs, update the
"available color keys" section to show the full v2 key list. Replace any table or list of
valid keys with the Full Schema Reference above.

---

## Backward Compatibility Note

The Labonair app itself accepts **both** old and new key names. A theme file with `terminal_black`
still works in the app — the engine maps both to `--terminal-black`. However:

- This repository should migrate all themes to v2 keys for consistency
- New themes submitted to the community repository should be required to use v2 keys
- The CI validator should emit a **warning** (not an error) for old-style underscore terminal keys,
  guiding contributors to use the new notation

---

## Reference: Labonair Dark (default theme, v2)

Use this as a reference for what a complete v2 theme looks like:

```json
{
  "name": "Labonair Dark",
  "author": "Labonair",
  "type": "dark",
  "colors": {
    "background": "#0f111a",
    "foreground": "#e4e4e5",
    "card": "#141722",
    "card_foreground": "#e4e4e5",
    "popover": "#141722",
    "popover_foreground": "#e4e4e5",
    "primary": "#6366f1",
    "primary_foreground": "#ffffff",
    "secondary": "#1e2130",
    "secondary_foreground": "#e4e4e5",
    "muted": "#1e2130",
    "muted_foreground": "#6b7280",
    "accent": "#1e2130",
    "accent_foreground": "#e4e4e5",
    "destructive": "#e06c75",
    "destructive_foreground": "#ffffff",
    "border": "#252836",
    "input": "#252836",
    "ring": "#6366f1",
    "sidebar.background": "#141722",
    "toolbar.background": "#141722",
    "title_bar.background": "#141722",
    "status_bar.background": "#141722",
    "border.variant": "#252836",
    "border.focused": "#6366f1",
    "border.selected": "#6366f1",
    "border.transparent": "#00000000",
    "border.disabled": "#3C3C3C",
    "modified": "#61afef",
    "error": "#e06c75",
    "warning": "#e5c07b",
    "info": "#61afef",
    "hint": "#6b7280",
    "success": "#98c379",
    "cursor": "#6366f1",
    "selection": "#6366f120",
    "terminal.background": "#0f111a",
    "terminal.foreground": "#e4e4e5",
    "terminal.bright_foreground": "#ffffff",
    "terminal.dim_foreground": "#9d9d9d",
    "terminal.ansi.background": "#0f111a",
    "terminal.ansi.black": "#1c1e2b",
    "terminal.ansi.red": "#e06c75",
    "terminal.ansi.green": "#98c379",
    "terminal.ansi.yellow": "#e5c07b",
    "terminal.ansi.blue": "#61afef",
    "terminal.ansi.magenta": "#c678dd",
    "terminal.ansi.cyan": "#56b6c2",
    "terminal.ansi.white": "#abb2bf",
    "terminal.ansi.bright_black": "#3e4451",
    "terminal.ansi.bright_red": "#e06c75",
    "terminal.ansi.bright_green": "#98c379",
    "terminal.ansi.bright_yellow": "#e5c07b",
    "terminal.ansi.bright_blue": "#61afef",
    "terminal.ansi.bright_magenta": "#c678dd",
    "terminal.ansi.bright_cyan": "#56b6c2",
    "terminal.ansi.bright_white": "#ffffff",
    "terminal.ansi.dim_black": "#1c1e2b",
    "terminal.ansi.dim_red": "#b05560",
    "terminal.ansi.dim_green": "#78963d",
    "terminal.ansi.dim_yellow": "#b59060",
    "terminal.ansi.dim_blue": "#4d8bbf",
    "terminal.ansi.dim_magenta": "#9a5eae",
    "terminal.ansi.dim_cyan": "#419297",
    "terminal.ansi.dim_white": "#858b99",
    "sidebar-foreground": "#e4e4e5",
    "sidebar-primary": "#6366f1",
    "sidebar-primary-foreground": "#ffffff",
    "sidebar-accent": "#1e2130",
    "sidebar-accent-foreground": "#e4e4e5",
    "sidebar-border": "#252836",
    "sidebar-ring": "#6366f1"
  }
}
```
