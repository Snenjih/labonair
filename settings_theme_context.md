# Settings UI & Theme Engine Context
**Project:** Labonair
**Goal:** Complete overhaul of the Settings Window UI to match the "Zed Editor" aesthetic, and implementation of a JSON-based Theme Engine.

## 1. UI/UX Architecture (Zed-Style Layout)
The Settings Window (`src/settings/SettingsApp.tsx`) must be completely refactored from a Top-Tab layout to a Sidebar-Detail layout.
- **Left Sidebar (w-64):** 
  - Top: A search input (`<Input type="search" />`).
  - Below: A vertical list of categories (General, Appearance, Terminal, Editor, File Manager, Models, Agents, About).
  - Active category has a distinct background (`bg-accent/50`).
- **Right Content Area (flex-1):**
  - Displays the settings for the active category.
  - **Search Behavior:** If the user types in the search bar, ignore the active category and flat-map ALL settings across all categories that match the query in their title or description.
- **Row Design:** Use the existing `SettingRow` component but style it exactly like Zed: No heavy borders around rows. Just a clear Title, a smaller descriptive text below it, and the control (Switch, Dropdown) aligned to the far right.

## 2. New Configuration Options (Zustand Store additions)
Extend `src/modules/settings/store.ts` (`Preferences` type and `DEFAULT_PREFERENCES`) with:

**Terminal Settings:**
- `terminalCursorBlink`: boolean
- `terminalCursorStyle`: "block" | "underline" | "bar"
- `terminalFontFamily`: string
- `terminalScrollback`: number
- `terminalLetterSpacing`: number
- `terminalLineHeight`: number
- `terminalFontWeight`: "normal" | "medium" | "bold"

**App Appearance (UI):**
- `appTheme`: string (The filename of the JSON theme)
- `appFontFamily`: string
- `appFontSize`: number
- `appLineHeight`: number

**Editor Settings:**
- `editorAutoSave`: "off" | "afterDelay" | "onFocusChange"
- `editorLineNumbers`: boolean
- `editorWordWrap`: boolean
- `editorTabSize`: number (2 | 4 | 8)
- `editorBracketMatching`: boolean

## 3. The JSON Theme Engine (Rust + React)
Themes are no longer hardcoded CSS. They are standalone `.json` files.
- **Storage:** Rust must manage a folder `~/.local/share/com.labonair.app/themes/`.
- **Default Theme:** A hardcoded `default-dark.json` must be embedded in Rust. If the user selects another theme, its JSON values override the default ones.
- **Theme JSON Structure:**
  ```json
  {
    "name": "Labonair Dark",
    "author": "Crynta",
    "type": "dark",
    "colors": {
      "background": "#0f111a",
      "foreground": "#e4e4e5",
      "accent": "#6366f1",
      // ... all shadcn variables (card, popover, border, etc.)
      "terminal_black": "#1c1e2b",
      "terminal_red": "#e06c75"
      // ... all 16 ANSI colors
    }
  }
  ```
- **The UI (Theme Picker):** 
  - In the "Appearance" category, the theme setting is a Button that opens a custom Popup/Popover.
  - The Popup lists all themes. Hovering temporarily applies CSS variables to the `:root` for a live preview.
  - Right-aligned on each theme row in the popup: an `Export` icon and a `Delete` icon (Trash).
  - Top-right of the popup: an `Import` button (opens OS file dialog via Tauri to select a .json file).
- **Rust IPC Commands required:** `themes_get_all`, `theme_import`, `theme_export`, `theme_delete`.
- **CSS Injection:** React fetches the active theme JSON via IPC on boot and injects the HEX colors as resolved OKLCH or HSL variables directly into `document.documentElement.style` to apply them globally to Tailwind.


---

## 4. Data-Driven Settings Architecture (Crucial for Search)
To implement the "flat search" across all categories cleanly, do NOT hardcode the UI rows inside multiple massive React components.
- **Rule:** Create a configuration array/schema for all settings (e.g., `SETTING_DEFINITIONS`).
- Each definition should have: `id` (matching the store key), `label`, `description`, `category` (General, Terminal, etc.), and `controlType` (Switch, Select, Input).
- **Search Logic:** When `searchQuery` is empty, filter this array by the active sidebar category. When `searchQuery` has text, filter the array globally where `label` or `description` includes the query, and render the results in a flat list, optionally with small category badges above the results.

## 5. Wiring Settings to the Core Components (The "Glue")
Adding settings to the store is only half the job. You MUST wire them into the actual application components so they react in real-time.

### 5.1 Terminal Wiring (`src/modules/terminal/lib/useTerminalSession.ts`)
- Subscribe to the new terminal preferences.
- Update the `xterm.js` instance dynamically. 
- Map `terminalCursorStyle` to `term.options.cursorStyle`.
- Map `terminalCursorBlink` to `term.options.cursorBlink`.
- Map `terminalFontFamily`, `terminalFontSize`, `terminalLetterSpacing`, `terminalLineHeight`, and `terminalFontWeight` to their respective `term.options`.
- **Note:** Changing font size or line height requires calling `fitAddon.fit()` immediately afterward so the terminal grid recalculates!

### 5.2 Editor Wiring (`src/modules/editor/EditorPane.tsx`)
- **Visuals:** Map `editorLineNumbers` to `lineNumbers()` extension. Map `editorWordWrap` to `EditorView.lineWrapping` extension. Map `editorTabSize` to `EditorState.tabSize.of()`. Map `editorBracketMatching` to `bracketMatching()`.
- **Auto-Save Logic:** 
  - If `editorAutoSave` is `"afterDelay"`: Implement a debounced `useEffect` (e.g., 5000ms) that calls the `save()` function whenever the `buffer` changes.
  - If `editorAutoSave` is `"onFocusChange"`: Attach an `onBlur` event listener to the CodeMirror view that triggers `save()`.

## 6. Theme Color Conversion (HEX to Tailwind HSL/OKLCH)
- **Context:** `shadcn/ui` and Tailwind v4 in this project rely on CSS variables defined as raw numbers (e.g., `--background: 220 13% 9%;` for HSL). 
- **Rule:** Since user-created JSON themes will likely use standard HEX colors (e.g., `"#0f111a"`), you MUST include a utility function (e.g., `hexToHslRaw(hex: string)`) in `src/hooks/useThemeEngine.ts` that converts HEX strings into the exact raw HSL/OKLCH string format that Tailwind expects before injecting it into `document.documentElement.style`.
