

> **System-Befehl: Nächster Task ausführen**
> 
> Bitte führe das "Session START Protocol" aus deiner `CLAUDE.md` aus:
> 1. Analysiere die `handshake.md` und `tasks/README.md`, um herauszufinden, welcher Task aktuell `in_progress` ist oder als nächstes (`not_started`) an der Reihe ist.
> 2. Lies dir die dazugehörige `tasks/TASK_XYZ.md` Datei vollständig und genau durch.
> 3. Teile mir kurz (auf Deutsch) mit, welchen Task du jetzt startest und was die Hauptziele sind.
> 4. Beginne mit der Implementierung des Codes genau nach den "Work Instructions" dieses Tasks. Beachte dabei stets die Architektur-Regeln aus den `*_context.md` Dateien und der `prd.md`.
> 
> **Sobald du den Code fertiggestellt hast, befolge strikt das "Task Transition Protocol":**
> - Führe Compiler-Checks durch (`cargo check` für Rust, `npx tsc --noEmit` für React). Code darf keine Fehler werfen!
> - Setze den Task in der Markdown-Datei und der README auf `completed`.
> - Erstelle einen sauberen Git-Commit (auf Englisch).
> - Aktualisiere die `handshake.md`.
> - Frage mich am Ende kurz, ob wir direkt mit dem nächsten Task weitermachen sollen.









***

> **System-Befehl: Architektur-Update (Terax-Inspiration, Editor & Sidebar)**
> 
> Hallo Claude, wir haben zwei neue, hochpriorisierte Features beschlossen, die wir in unsere Architektur-Dokumente und den Projektplan integrieren müssen. 
> 
> Bitte lies dir die folgenden Änderungen durch und aktualisiere die entsprechenden `.md` Dateien in unserem Projekt:
> 
> **FEATURE 1: Permanente Local File Sidebar**
> - Eine schmale, linksbündige Sidebar (Tree-View), die unabhängig von den Tabs existiert.
> - Sie dient als ständiger Begleiter (wie der Finder), aus dem man Dateien ins Terminal (für absolute Pfade) oder in den SFTP-Manager ziehen kann.
> - Sie kann über einen Button in der Titlebar ein- und ausgeblendet werden.
> - **WICHTIG:** Sie ersetzt NICHT das Home-Dashboard (Hosts) und sie ersetzt NICHT die Local-Hälfte der SFTP-Split-Pane. Sie ist ein rein zusätzliches, globales Tool.
> 
> **FEATURE 2: In-App Editor (CodeMirror 6)**
> - Ein neuer Tab-Typ: `editor`
> - Wenn man im SFTP-Manager eine Text-Datei doppelt klickt oder "Edit" wählt, öffnet sich ein neuer Nexum-Tab mit einem CodeMirror 6 Editor.
> - Die Datei wird von Rust nach `/tmp` geladen. Bei `Cmd+S` im Editor wird sie gespeichert und von Rust automatisch per SFTP wieder hochgeladen.
> - Beinhaltet Größenlimits (keine 500MB Logs im Editor öffnen).
> 
> ---
> **DEINE AUFGABE (Bitte führe diese Dateianpassungen durch):**
> 
> 0. **READ: `prd.md`, `layout_context.md`, `sftp_ssh_context.md`, `editor_sidebar_context.md`(The Features Context and PRD file)**
>
> 1. **Update `prd.md`**: 
>    - Füge in Sektion 3.1 die togglebare "Local File Sidebar" hinzu.
>    - Füge eine neue Sektion "3.8 In-App Code Editor" mit den CodeMirror-Details hinzu.
> 
> 2. **Update `layout_context.md`**: 
>    - Aktualisiere das "Root DOM Structure (Mental Model)", sodass unter der Titlebar ein Flex-Row Layout entsteht: Links die `<LocalSidebar />` und daneben die `<div className="flex-1 relative">` für den Tab-Content.
>    - Beschreibe den Toggle-Button für die Sidebar in der Titlebar.
> 
> 3. **Update `sftp_ssh_context.md`**: 
>    - Aktualisiere 3.4 (In-Place Editing). Erkläre, dass nun ein Editor-Tab (`CodeMirror`) geöffnet wird, anstatt die Datei in VS Code / TextEdit auf dem Mac zu öffnen.
> 
> 4. **Update den Plan (`plan-overview.md` & `tasks/README.md`)**:
>    - Füge `TASK_03_3_local_sidebar.md` (Phase 3) hinzu.
>    - Füge `TASK_06_3_in_app_editor.md` (Phase 6) hinzu.
> 
> 5. **Erstelle die beiden neuen Task-Dateien**:
>    - Erstelle `tasks/TASK_03_3_local_sidebar.md` (inkl. Dependencies zu Zustand, um den Sidebar-Open-State zu speichern).
>    - Erstelle `tasks/TASK_06_3_in_app_editor.md` (inkl. `npm install @uiw/react-codemirror` und Rust `/tmp` file syncing logic).
> 
> Bitte bestätige mir kurz, wenn du alle Dateien erfolgreich aktualisiert und die beiden neuen Tasks angelegt hast!














**Speichere dir diesen "Audit & Status-Check Prompt" ab:**

***

> **System-Befehl: Architektur-Audit & Status-Check**
> 
> Pausiere die aktive Entwicklung. Schlüpfe in die Rolle eines Principal Software Architects und QA-Testers. Deine Aufgabe ist es, den tatsächlichen Ist-Zustand des Codes gegen unsere Architektur-Dokumente abzugleichen.
> 
> **Bitte führe folgende Checks durch:**
> 
> 1. **Codebase Scan:** Vergleiche die aktuellen Dateien in `src/` und `src-tauri/src/` mit den Anforderungen aus der `prd.md` und den `*_context.md` Dateien. 
> 2. **Heuristiken-Prüfung:** 
>    - Gibt es Verletzungen der "Strict IPC Boundary" (wurden Node.js APIs im React-Frontend verwendet)?
>    - Wurden blockierende I/O- oder Netzwerk-Operationen in Standard-Tauri-Commands geschrieben, statt `tokio::spawn` zu nutzen?
>    - Wird lokaler React-State für Dinge genutzt, die eigentlich in den globalen Zustand-Store gehören?
> 3. **Task-Verifizierung:** Prüfe die `tasks/README.md`. Sind die Tasks, die auf `completed` stehen, *wirklich* vollständig und funktional implementiert, oder fehlen noch Edge-Cases?
> 4. **Compiler-Check:** Führe im Hintergrund `cargo check` (bzw. `cargo clippy`) und `npx tsc --noEmit` aus, um versteckte Typen- oder Compiler-Fehler zu finden.
> 
> **Erstelle mir danach einen detaillierten "Gesundheitsbericht" (auf Deutsch):**
> - Was funktioniert bereits exzellent und ist architektonisch sauber?
> - Welche versteckten Fehler, Compiler-Warnungen oder Architektur-Verletzungen hast du gefunden?
> - Stimmt die `handshake.md` noch mit der Realität überein?
> - **Was sind die genauen, nächsten Action-Steps**, um gefundene Lücken zu schließen, bevor wir mit neuen Features (Tasks) weitermachen?



***

### Wann solltest du diesen Prompt nutzen?

1. **Nach Abschluss einer ganzen Phase** (z. B. wenn alle Tasks von Phase 3 abgeschlossen sind, bevor Phase 4 startet).
2. **Wenn dir Fehler auffallen:** Wenn die App beim manuellen Testen von dir komisches Verhalten zeigt (z. B. UI friert ein, Terminal flackert).
3. **Wenn du am nächsten Tag weiterarbeitest** und sicherstellen willst, dass die KI keine "Altlasten" aus der vorherigen Session übersehen hat.

Dieser Prompt ist quasi dein **Sicherheitsnetz**. Er zwingt Claude/Cursor, den eigenen geschriebenen Code kritisch zu hinterfragen und zu korrigieren, anstatt einfach stur den nächsten Task abzuarbeiten!
