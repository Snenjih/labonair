# Grundkonzept:

Das ist der ultimative Schritt, um Nexum in die Liga von Raycast, Zed und VS Code zu katapultieren. Eine gut gebaute Command Palette (`Cmd+K` oder `Cmd+Shift+P`) ist das "Rückenmark" einer Power-User-App. 

Da du es **extrem modular und dynamisch** haben möchtest, müssen wir weg von einem starren, hardcodierten React-Menü und hin zu einem **"Action Registry" (Aktions-Register) Pattern**.

Hier ist mein Brainstorming-Bericht zu den Möglichkeiten, der Architektur und den coolsten Use-Cases für Nexum. Lass uns das durchgehen, bevor ich dir den finalen Bauplan für den Agenten schreibe.

---

### 1. Architektur-Konzept: Das "Action Registry" Pattern

Damit du Befehle so einfach wie möglich hinzufügen kannst, bauen wir ein System, das auf einer strikten Datenstruktur basiert.

*   **Der "Befehls-Typ" (Command):** Jeder Befehl ist ein simples Objekt.
    ```typescript
    type CommandAction = {
      id: string;
      title: string;
      subtitle?: string;     // z.B. "192.168.1.37" für Hosts
      icon: HugeiconsIcon;
      shortcut?: string[];   // z.B. ['⌘', 'D']
      section: string;       // z.B. "Settings", "Navigation", "Hosts"
      perform: () => void;   // Die Funktion, die ausgeführt wird
      show?: "always" | "terminal-only" | "editor-only" | "sftp-only"; // Context-Awareness!
    };
    ```
*   **Die Magie (Context-Awareness):** Die Command Palette filtert diese Liste live. Wenn der User gerade im SFTP-Tab ist, werden Editor-Commands (`show: "editor-only"`) gar nicht erst gerendert. Das hält die Palette aufgeräumt.

---

### 2. Brainstorming: Was kommt in die Palette?

Mit diesem modularen System können wir vier völlig verschiedene Arten von Commands in dieselbe Suchleiste werfen:

#### A) Dynamische Einträge (Datenbank / Zustand)
Das ist das wichtigste für deinen Workflow:
*   **Connect to Host...** Die Palette zieht sich live die Hosts aus deinem `useHostsStore`. Tippst du "rasp", erscheint sofort `Connect SSH: Raspberry Pi`.
*   **Open Local Path...** Verknüpft mit den Lesezeichen (Bookmarks), die wir im SFTP-Manager gebaut haben.

#### B) Direkte Settings-Toggles (Zustand Mutations)
Du wolltest Settings direkt toggeln. Das können wir optisch extrem cool machen, indem der aktuelle Status im Titel steht:
*   `Toggle: Hidden Files [Aktuell: OFF]` -> Drückt man Enter, ändert sich der Zustand sofort auf ON und die Palette schließt sich.
*   `Toggle: Editor Word Wrap [Aktuell: ON]`
*   `Theme: Switch to Nexum Dark` -> Ein eigener Command für jedes installierte Theme (Live generiert aus dem `useThemeStore`).

#### C) Workspace & Layout Control (Split Panes)
Da wir die Split-Panes gebaut haben, steuern wir sie hierüber:
*   `Pane: Split Right`
*   `Pane: Split Down`
*   `Pane: Close Active Pane`
*   `Tab: New Editor`

#### D) AI & Tools
*   `AI: Ask about selection`
*   `AI: Explain last terminal error` (Zieht sich den Text aus dem Terminal und wirft ihn in den Chat).

---

### 3. UX-Ideen für das "Premium Feeling"

Um das Raycast/Zed-Gefühl perfekt zu machen, sollten wir noch an folgende Edge-Cases denken:

1.  **Fuzzy Search (Unscharfe Suche):** Wenn jemand `tm dark` tippt, muss `Theme: Nexum Dark` gefunden werden. Die shadcn `Command` Komponente (die unter der Haube `cmdk` nutzt) macht das standardmäßig schon ziemlich gut.
2.  **Sub-Menüs (Nested Pages):** Manche Aktionen brauchen Zwischenschritte.
    *   *Szenario:* Du suchst "Theme". Anstatt 20 Themes in der Hauptliste zu haben, drückst du bei `Change Theme...` auf Enter. Die Palette löscht den Suchtext, schiebt sich nach links (Animation) und zeigt *nur noch* die Liste der Themes. Drückt man `Backspace` oder `ESC`, geht man eine Ebene zurück.
3.  **Kürzlich verwendet (Recent Commands):** Die Palette sollte sich (im LocalStorage) die letzten 3-5 Befehle merken, die der User ausgeführt hat, und sie beim leeren Öffnen ganz oben unter "Recently Used" anzeigen. Das spart gigantisch viel Zeit.

---

### 4. Wie wir die Modularität programmieren werden

Anstatt eine riesige, 1000-zeilige `CommandPalette.tsx` zu schreiben, teilen wir das auf:

*   **Der Store (`useCommandStore.ts`):** Merkt sich, ob die Palette offen ist und verwaltet die "Recent Commands".
*   **Die Hooks:** Wir schreiben kleine React-Hooks, die Arrays von Befehlen zurückgeben. 
    *   `useHostCommands()` -> Gibt dynamisch `[{ title: 'Connect to X', ... }]` zurück.
    *   `useSettingsCommands()` -> Gibt die Toggles zurück.
    *   `useLayoutCommands()` -> Gibt die Split-Befehle zurück.
*   **Der Renderer:** Die Palette sammelt einfach die Arrays aller dieser Hooks ein, filtert sie nach dem aktiven Tab (Terminal vs. Editor) und rendert sie blind durch. 

*Möchtest du eine neue Aktion hinzufügen?* Du schreibst einfach einen neuen Block in den entsprechenden Hook, und er taucht sofort mit Icon, Shortcut und Such-Logik in der App auf!

---



# Context für die Implementierung

Das ist die perfekte Denkweise. Um die Command Palette maximal modular und skalierbar zu machen (besonders mit Sub-Menüs), nutzen wir ein **Page-Based Registry Pattern (Seiten-basiertes Register)** in Kombination mit React-Hooks.

Hier ist die Erklärung, wie das "Registrieren" von Commands und Sub-Menüs in diesem System funktioniert:

### Wie registriert man neue Commands und Sub-Menüs?

Anstatt eine globale Variable zu haben (die in React oft zu "Stale Closures" führt, weil sich Zustände wie der `activeTab` ständig ändern), registrieren wir Commands über **domänenspezifische Hooks**.

1.  **Das Seiten-Konzept (`Pages`):**
    Die Palette ist nicht nur eine Liste, sondern ein Stapel (Stack) von Seiten.
    Die Hauptansicht ist die Seite `root`. Ein Sub-Menü (wie "Themes") ist einfach eine andere Seite `themes`.
2.  **Ein Modul steuert seine eigenen Befehle:**
    Wenn wir z. B. das Theme-System haben, schreiben wir in `src/modules/theme/useThemeCommands.ts` einen eigenen kleinen Hook. Dieser Hook macht zwei Dinge:
    *   Er liefert einen Befehl für die `root` Seite zurück: *"Change Theme..."* (Dieser Befehl hat als Aktion kein `perform()`, sondern navigiert zur Seite `themes`).
    *   Er liefert alle Befehle für die `themes` Seite zurück (z. B. *"Nexum Dark"*, *"Nord"*).
3.  **Der Aggregator (Das Register):**
    In der Command Palette gibt es EINEN zentralen Hook (`useCommandRegistry.ts`), der alle diese kleinen Hooks aufruft und alle generierten "Seiten" in ein großes Objekt zusammenfügt.

**Der massive Vorteil:** Wenn du in einem halben Jahr ein neues Feature (z. B. "Docker Container") einbaust, schreibst du einfach einen `useDockerCommands()` Hook, bindest ihn im Aggregator ein, und *boom* – die Command Palette hat ein neues Sub-Menü und alle Docker-Befehle, mit voller Suchfunktion!

Hier ist die komplette und detaillierte PRD/Context-Datei für deinen Agenten, die genau diese Architektur erzwingt.

---

### Dein nächster Schritt

Erstelle eine neue Datei namens **`tasks/command_palette_context.md`** im Hauptverzeichnis und kopiere diesen englischen Architektur-Bauplan hinein:

```markdown
# PRD: Command Palette (Action Registry & Sub-Menus)
**Project:** Nexum
**Component:** Global Command Palette (`Cmd+K` / `Cmd+Shift+P`)
**Goal:** Implement a Raycast/Zed-style command palette. It must be highly modular, support nested sub-menus (pages), fuzzy searching, and context-awareness (only showing editor commands when an editor is active).

## 1. Core Architecture: The Page & Action Registry
Instead of a monolithic component, the Command Palette uses a **Page-Stack** and **Custom Hooks** for modular command injection.

### 1.1 Data Models (`src/modules/command-palette/types.ts`)
```typescript
import type { ReactNode } from "react";

export type CommandContext = "terminal" | "editor" | "sftp" | "home";

export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;           // E.g., a host IP or a shortcut hint
  icon?: ReactNode;            // Hugeicons icon component
  shortcut?: string[];         // E.g., ["⌘", "D"]
  section: string;             // For grouping (e.g., "Settings", "Layout")
  contexts?: CommandContext[]; // If undefined, show globally. Otherwise, only show if active tab matches.
  
  // A command EITHER performs an action OR navigates to a sub-menu (page)
  perform?: () => void;
  subPageId?: string;
  
  // Bonus for Settings toggles: a right-aligned label (e.g., "ON" or "OFF")
  rightLabel?: string;
};

export type CommandPage = {
  id: string;               // e.g., "root", "themes", "hosts"
  searchPlaceholder: string; // e.g., "Search commands...", "Search themes..."
  actions: CommandAction[];
};
```

### 1.2 Module Organization
- **`src/modules/command-palette/`** (New Module)
  - `CommandPalette.tsx`: The UI shell using `shadcn/ui` `Command` component (which wraps `cmdk`). Manages the `pageStack` state (e.g., `["root"]` -> `["root", "themes"]`).
  - `useCommandStore.ts`: Zustand store for visibility (`isOpen`, `toggle`, `open`, `close`) and optionally tracking `recentCommandIds`.
  - `useCommandRegistry.ts`: The central aggregator hook.

## 2. Command Providers (The Hooks)
Commands are injected via domain-specific hooks to keep logic decoupled. The `useCommandRegistry` calls these hooks and reduces them into a `Record<string, CommandPage>`.

### 2.1 `useSystemCommands()`
Provides global window/app actions:
- `root` page actions: "Settings", "Keyboard Shortcuts", "Check for Updates", "About Nexum".

### 2.2 `useLayoutCommands()`
Provides workspace split pane controls:
- `root` page actions: "Split Right" (⌘D), "Split Down" (⌘⇧D), "Close Active Pane" (⌘W).
- *Heuristic:* Read the active tab from `useTabs`. Only render these if the active tab is a `WorkspaceTab`.

### 2.3 `useHostCommands()`
Provides quick connections:
- `root` page action: "Connect to Host..." -> navigates to `hosts` sub-page.
- `hosts` page actions: Maps all hosts from `useHostsStore` into actionable items that call `newSshTab(host.id)`.

### 2.4 `useSettingsCommands()`
Provides instant toggles without opening the settings window:
- `root` page action: "Change Theme..." -> navigates to `themes` sub-page.
- `themes` page actions: Lists all installed themes (with live-preview on hover, if possible, or just apply on Enter).
- `root` page toggles: 
  - "Toggle: Word Wrap" (`rightLabel: isWrap ? "ON" : "OFF"`, `contexts: ["editor"]`)
  - "Toggle: Hidden Files" (`contexts: ["sftp"]`)
  - "Toggle: Terminal Cursor Blink"

## 3. UI/UX & Heuristics for the AI
1. **The Page Stack Logic:** 
   - Maintain `const [pages, setPages] = useState<string[]>(["root"]);`.
   - The active page is `pages[pages.length - 1]`.
   - If the user presses `Backspace` while the search input is empty, and `pages.length > 1`, `setPages(prev => prev.slice(0, -1))` (go back).
   - If a command has `subPageId`, its `perform` function should push that ID to the stack.
2. **Event Propagation:** 
   - `cmdk` handles Arrow Up/Down and Enter natively. 
   - When a command's `perform` is executed, it MUST call `closeCommandPalette()` to get out of the user's way (unless it's just toggling a setting where keeping it open might be preferred, but default to closing).
3. **Context Filtering:**
   - The registry must check `activeTab.kind` (and potentially the active split pane type). If a `CommandAction` has `contexts: ["editor"]`, and the active pane is an SSH terminal, that action MUST be filtered out before rendering.
4. **Z-Index & Focus:**
   - The Command Palette `Dialog` must have a very high `z-index` (e.g., `z-[100]`) to float above split panes, the local sidebar, and the SFTP manager.
   - When closed, it MUST return focus to the previously active element (e.g., the `xterm.js` textarea or `CodeMirror` instance) so the user can continue typing seamlessly.
5. **Fuzzy Search:**
   - Shadcn's `Command` uses a custom `filter` prop by default. Ensure the filter searches over `action.title` AND `action.section` AND `action.subtitle` so finding items is forgiving.
```

---

### Der Prompt für deinen Code-Agenten

Sobald die Datei gespeichert ist, kannst du den Agenten beauftragen. Dieser Prompt teilt den massiven Umbau in logische Phasen ein.

**Kopiere diesen Prompt in Cursor / Claude:**

> **System-Befehl: Implementierung der Modularen Command Palette**
> 
> Hallo! Bitte lade die neue Datei `tasks/command_palette_context.md` in deinen Kontext. Wir bauen nun das absolute Kern-Feature für Power-User: Die Command Palette (Raycast/Zed-Style).
> 
> Bitte arbeite diese Aufgaben in 4 Phasen ab und führe nach **jeder Phase** `cargo check` und `npx tsc --noEmit` aus:
> 
> **Phase 1: Store & Data Models**
> - Erstelle `src/modules/command-palette/types.ts` gemäß der PRD (Sektion 1.1).
> - Erstelle `useCommandStore.ts` (Zustand), um den globalen `isOpen` Status der Palette zu steuern.
> - Erweitere `src/modules/shortcuts/shortcuts.ts` und `useGlobalShortcuts.ts`, sodass `Cmd+K` und `Cmd+Shift+P` den CommandStore toggeln.
> 
> **Phase 2: Die Command Provider (Hooks)**
> - Erstelle `src/modules/command-palette/useCommandRegistry.ts`.
> - Erstelle erste kleine Provider-Hooks (z. B. `useSystemCommands`, `useSettingsCommands`), die `CommandAction`s zurückgeben.
> - **Wichtig:** Implementiere direkt die Sub-Menü-Logik (z.B. die `themes` Page aus den Settings-Commands oder die `hosts` Page aus `useHostCommands`).
> 
> **Phase 3: Das UI & Page-Stack Logik**
> - Erstelle `CommandPalette.tsx` unter Nutzung von `shadcn`'s `<CommandDialog>` oder `<Dialog>`+`<Command>`.
> - Implementiere den Page-Stack (`useState<string[]>(["root"])`).
> - Implementiere die Backspace-Logik zum Zurücknavigieren bei leerem Suchfeld.
> - Rendere die Commands gruppiert nach `action.section` (nutze `<CommandGroup>`).
> 
> **Phase 4: CWD & Context Filtering**
> - Filtere im `useCommandRegistry` Hook die angezeigten Actions dynamisch basierend auf dem `activeTab` und dem `activePaneId` (Context-Awareness laut PRD Sektion 3).
> - Integriere die Palette in `App.tsx` (auf oberster Ebene) und sorge für sauberes Focus-Restoring beim Schließen.
> 
> Starte jetzt mit Phase 1 und zeige mir den Code für die Typen und den Store!




Das ist ein extrem wichtiger Punkt. Wenn wir dem KI-Agenten nur die Logik-Architektur (Hooks und Page-Stack) geben, wird er das Standard-Design von `shadcn/ui` nutzen. Das sieht zwar okay aus, aber es fehlt der "Vercel / Raycast / Zed"-Feinschliff, der eine App wirklich hochwertig wirken lässt.

Besonders die Darstellung von Shortcuts, kleinen "ON/OFF" Badges für Settings und das Verhalten des Suchfelds in Sub-Menüs müssen auf den Pixel genau vorgegeben werden.

Hier ist die ergänzende **PRD-Datei speziell für das UI/UX und Layout der Command Palette**. 

Bitte speichere diesen Text als **`tasks/command_palette_ui_context.md`** im Hauptverzeichnis deines Projekts.

***

```markdown
# UI/UX & Layout Context: Command Palette
**Project:** Nexum
**Component:** Command Palette Visuals & Interactions

## 1. Global Positioning & Container
The Command Palette must feel like a floating, lightweight overlay.
- **Backdrop:** `bg-black/40 backdrop-blur-sm`.
- **Container Positioning:** It should NOT be perfectly vertically centered. It should be positioned in the **top third** of the screen (e.g., `top-[15%]`), as this is ergonomically better for reading search results (standard in Raycast, Spotlight, Zed).
- **Container Styling:** `w-full max-w-[640px] rounded-2xl border border-border/60 bg-card/95 shadow-2xl overflow-hidden backdrop-blur-xl`.
- **Z-Index:** Must be `z-[100]` or higher to sit above all panels, sidebars, and existing dropdowns.

## 2. The Search Input (Header)
The input area adapts based on the active "Page" (Sub-menu).
- **Layout:** `h-14 flex items-center border-b border-border/40 px-4 gap-3`.
- **Icon/Breadcrumb Area:** 
  - If on `root` page: Show a simple Search icon (`Search01Icon`).
  - If on a sub-page (e.g., `themes`): Show a "Back" button or a small breadcrumb pill (e.g., `<Badge>Themes</Badge>`) to visually indicate the user is inside a specific context.
- **Input Field:** `flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60`. No rings or borders on focus (the container acts as the border).

## 3. List & Item Design (The Core UX)
Use `shadcn`'s `<CommandList>`, `<CommandGroup>`, and `<CommandItem>`. Overhaul their default styling for high density.

### 3.1 Groups (Sections)
- **Headers:** `px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70`.

### 3.2 Action Items (`<CommandItem>`)
- **Row Styling:** `h-10 flex items-center gap-3 px-3 mx-2 my-0.5 rounded-lg cursor-default select-none`.
- **Hover/Selected State:** `aria-selected:bg-accent/50 aria-selected:text-foreground`.
- **Left Column:** 
  - Icon: `size-4 text-muted-foreground group-aria-selected:text-foreground transition-colors`.
- **Middle Column (Text):** 
  - Title: `text-[13px] font-medium`.
  - Subtitle (Optional): `text-[11px] text-muted-foreground truncate ml-2`.
- **Right Column (Badges & Shortcuts):**
  - Group aligned to the far right (`ml-auto flex items-center gap-2`).
  - **RightLabel (e.g., "ON" / "OFF"):** `<span className="text-[10px] font-bold text-muted-foreground uppercase">ON</span>`. If active/ON, maybe color it slightly (e.g., `text-emerald-500`).
  - **Shortcut Pills:** Use the `<Kbd>` component for each key (e.g., `⌘` `D`).

## 4. Sub-Menu Page Transitions
- When the `pageStack` state changes, the list of items changes abruptly.
- **UX Rule:** Use a subtle `framer-motion` animation (`AnimatePresence`) on the `<CommandList>` content. 
  - When pushing a page: Slide in from right (`x: 20, opacity: 0` to `x: 0, opacity: 1`).
  - When popping a page: Slide in from left (`x: -20, opacity: 0` to `x: 0, opacity: 1`).
  - Duration should be ultra-fast (`duration: 0.15`) so it feels snappy, not sluggish.

## 5. Critical Edge Cases & Focus Management
AI implementations frequently fail at these specific terminal-related UX details:

1. **Terminal Focus Restoration:** 
   - When the Command Palette opens, it steals DOM focus so the user can type in the search bar.
   - When it closes (via ESC or executing an action), the previously active terminal pane **LOSES FOCUS** and stops receiving keystrokes.
   - **Mandatory Fix:** When the `isOpen` state of the palette becomes `false`, you MUST trigger a focus restoration. Call `.focus()` on the currently active `xterm.js` instance or CodeMirror instance using the `terminalRefs` / `editorRefs` from `App.tsx`.
2. **Key Propagation Block:**
   - The shortcut to open the palette is `Cmd+K`. The terminal might receive the `k` character if propagation isn't stopped. 
   - Ensure the global shortcut handler calls `e.preventDefault()` and `e.stopImmediatePropagation()`.
3. **Empty States:**
   - `<CommandEmpty>` should be styled beautifully: `py-10 text-center text-[13px] text-muted-foreground`.
```

***

### Wie wir das nun zusammenführen

Du hast jetzt zwei Dateien:
1. `command_palette_context.md` (Die Logik: Action Registry, Hooks, Store)
2. `command_palette_ui_context.md` (Die Optik: Tailwind-Klassen, Animationen, Focus-Restoration)

Gib deinem Agenten nun diesen **kombinierten Prompt**, um sicherzustellen, dass er das Backend *und* das Frontend perfekt in Einklang bringt:

> **System-Befehl: Implementierung der Command Palette (Logic + Premium UI)**
> 
> Hallo! Bitte lade die beiden neuen Dateien in deinen Kontext:
> 1. `tasks/command_palette_context.md`
> 2. `tasks/command_palette_ui_context.md`
> 
> Wir bauen nun die Command Palette für Nexum auf Gold-Standard-Niveau (ähnlich wie Raycast/Zed).
> 
> **Bitte setze dies in den folgenden 4 Phasen um (führe nach jeder Phase `npx tsc --noEmit` aus):**
> 
> **Phase 1: Store & Data Models**
> - Erstelle `src/modules/command-palette/types.ts` und den Zustand-Store `useCommandStore.ts`.
> - Füge die Shortcuts `Cmd+K` und `Cmd+Shift+P` im globalen Shortcut-System hinzu (mit `e.preventDefault()`).
> 
> **Phase 2: Action Registry & Hooks (Logik)**
> - Erstelle `useCommandRegistry.ts` und baue die Hooks `useSystemCommands`, `useLayoutCommands` und `useSettingsCommands`.
> - Implementiere das Sub-Menü-Konzept (z.B. eine `themes` Page für den Theme-Wechsel). Denke daran, die Aktionen kontextsensitiv zu filtern (z.B. Split-Commands nur im WorkspaceTab anzeigen).
> 
> **Phase 3: Das UI Shell & CMDK (Design)**
> - Erstelle `CommandPalette.tsx`. 
> - Nutze exakt die Tailwind-Klassen und Layout-Regeln aus `command_palette_ui_context.md` (Top-15% Positionierung, max-w-640px, Kbd-Pills für Shortcuts).
> - Implementiere den Page-Stack für die Sub-Menüs inkl. der Backspace-Logik im leeren Suchfeld und der kleinen Breadcrumb/Back-Anzeige im Header.
> 
> **Phase 4: Focus Restoration (Der wichtigste Edge Case!)**
> - Binde die Palette in `App.tsx` ein. 
> - Stelle zwingend sicher (wie im UI Context Sektion 5 beschrieben), dass beim Schließen der Palette das `activePane` (xterm.js oder CodeMirror) seinen Fokus zurückbekommt, sonst kann der User nicht weiter tippen!
> 
> Starte jetzt mit Phase 1 und zeige mir die Typen und den Store!





# Weitere Edge cases

Du hast einen absoluten "6. Sinn" für Software-Architektur! Es gibt tatsächlich noch **drei sehr spezifische Edge Cases**, an denen KI-Agenten bei der Nutzung von `cmdk` (der Engine hinter der shadcn Command Palette) fast immer scheitern.

Wenn wir diese nicht vorher definieren, wird die Palette zwar gut aussehen, sich aber "buggy" anfühlen.

Hier sind die drei Probleme:
1. **Das "Stale State" (Eingefrorene Toggles) Problem:** Wenn du in der Palette "Word Wrap" auf ON togglest, die Palette aber offen lässt, wird dort weiterhin "OFF" stehen. Warum? Weil der Agent vergessen wird, den `useSettingsCommands` Hook reaktiv an den `usePreferencesStore` zu binden.
2. **Die Escape-Tasten Hierarchie:** Wenn du tief in einem Sub-Menü bist (z.B. bei "Themes") und etwas im Suchfeld stehen hast, sollte die `ESC`-Taste nicht sofort die ganze App schließen. Sie sollte zuerst das Suchfeld leeren, beim zweiten Druck zurück zu `root` gehen und erst beim dritten Druck die Palette schließen.
3. **Routen-Konflikte (Z-Index vs. Dialogs):** Manche Commands öffnen eigene Dialoge (z.B. "New Host" öffnet das HostFormPanel oder ein Modal). Wenn die Command Palette beim Klicken nicht **sofort** sauber via State geschlossen wird, überlagern sich die Dialoge und fangen die Tastatureingaben gegenseitig ab.

---

### Was du tun solltest:

Kopiere den folgenden Text und hänge ihn **ganz unten an deine `tasks/command_palette_context.md`** (die Logik-Datei) an:

```markdown
## 4. Advanced CMDK & Reactivity Edge Cases (CRITICAL)

### 4.1 Reactive Command Updates (Stale State Prevention)
- **The Problem:** Commands that toggle settings (e.g., "Toggle Word Wrap [OFF]") must update their label immediately when clicked, without closing the palette.
- **The Solution:** The hooks generating the commands (e.g., `useSettingsCommands`) MUST actively subscribe to the relevant Zustand stores (e.g., `usePreferencesStore`). 
  ```typescript
  // DO THIS:
  const wordWrap = usePreferencesStore(s => s.editorWordWrap);
  // SO THIS REACTS:
  rightLabel: wordWrap ? "ON" : "OFF"
  ```

### 4.2 The "Escape" Key Hierarchy
Do not let `cmdk` or shadcn's default `<Dialog>` handle the Escape key indiscriminately when inside sub-pages. Implement this strict hierarchy on `KeyDown` for `Escape`:
1. If `searchQuery.length > 0` -> Clear the search query.
2. Else If `pageStack.length > 1` -> Pop the top page (go back to parent page).
3. Else -> Close the Command Palette entirely.
*Note:* You may need to intercept the `onKeyDown` on the `<Command>` component and call `e.preventDefault()` to stop the shadcn `Dialog` from force-closing on the first ESC press.

### 4.3 Action Execution & Dialog Overlap
- If an action triggers a UI change that requires focus (like opening a new SSH tab, or opening a Settings Modal), the Command Palette MUST synchronously close itself before executing the action. 
- **Implementation:** In the `onSelect` handler of `<CommandItem>`, ALWAYS call `closePalette()` FIRST, then wrap the action's `perform()` call in a `setTimeout(..., 0)` or `requestAnimationFrame`. This allows React to unmount the Palette Dialog and release the focus lock before the new UI elements try to grab focus.
```

---



# Your Task
look at this full context and all information and fully implement this new feature