# Labonair — Review-Fix-Umsetzungsplan (reduziert: migrations-unabhängig)

## Context

Ein umfassendes 6-Agent-Review der gesamten App hat 26 nummerierte Befunde plus 7 Edge-Cases ergeben. Die kritischsten wurden persönlich am Quellcode nachverifiziert, keine Vermutungen. Der Nutzer hat entschieden, was gefixt wird (siehe unten), und danach den Plan ein zweites Mal eingeschränkt: Es gibt eine **rein theoretische, nicht beschlossene** Überlegung, `ssh2` (libssh2-Bindings) in `src-tauri/src/modules/ssh/` und `src-tauri/src/modules/sftp/` mittelfristig durch `russh`/`russh-sftp` zu ersetzen (siehe `russh-migration.md` im Projekt-Root). Damit Fixes an der ssh2-spezifischen Session-/Lock-/Blocking-Architektur nicht zu Wegwerfarbeit werden, falls diese Migration doch passiert, wurden alle Punkte, die tief in diese Architektur eingreifen, aus dem Scope genommen. Alles andere (Frontend, reine lokale-FS-Rust-Commands, xterm.js-Logik) bleibt, da migrations-unabhängig.

**Ursprüngliche Nutzerentscheidung (was überhaupt gefixt wird):**
- Fixen: 1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26 + alle 7 Edge-Cases
- Explizit NICHT ändern: #2 (Secrets im OS-Keychain — App ist nicht notarisiert, Keychain-Zugriff würde Probleme verursachen), #5 (Attach-to-Agent/Reference-in-Chat umgeht die Deny-List — **gewollt**)
- Nicht im Scope: #21 (globale serielle Transfer-Queue über Hosts hinweg parallelisieren) — größere Architektur-Änderung

**Zweite Einschränkung (migrations-unabhängig, diese Runde):**
- **Entfernt** (hängt tief an `ssh2`-spezifischer API/Session-Mutex-Architektur, wäre bei einer russh-Migration ohnehin komplett neu geschrieben):
  - Workstream C komplett (#10 Cancel-Bug, #12 rekursiver Ordner-Transfer, #20 Streaming-Upload, Upload-TOCTOU-Edge-Case) — hängt an `ssh2::Sftp`-API (`OpenFlags`, `sftp.create`, `sftp.stat`, Session-Mutex-Muster).
  - Aus Workstream D: #25 (`sftp_delete`/`sftp_calculate_size` Lock-Scope), Edge-Case `sftp_connect`-TOCTOU-Race, Edge-Case Tunnel-Ref-Count-Race.
  - Aus Workstream E: die vier SSH/SFTP-`spawn_blocking`-Wraps (`ssh_exec_command`, `ssh_pty_resize`, `ssh_pty_write`, `sftp_disconnect`) — unter einer async-nativen Bibliothek bräuchte keiner davon überhaupt einen Wrap.
  - Aus Workstream F: #24 (`bridge_loop`-Busy-Wait in `ssh/client.rs`) — reines ssh2-Blocking-Read-Problem, verschwindet strukturell unter async.
  - Workstream N komplett (Git-Exec stdout/stderr) — nutzt `ssh2::ExtendedData` direkt, russh-Channel-API sieht Extended-Data anders.
- **Bleibt** (migrations-unabhängig, egal was mit der SSH-Bibliothek passiert): Workstream A (AI-Security), B (reine xterm.js-Frontend-Logik), D-Rest (#11, reiner lokaler Prozess-Kill), E-Rest (`fs/mutate.rs`, reines lokales FS), F-Rest (#23, `fs_grep`/`fs_glob`), G, H, I, J, K (Frontend-Store/Editor/Snippets/Scrollback), L komplett (SFTP-Teil ruft nur eine bereits existierende paginierte Command auf, kein neuer ssh2-Code; Explorer-Teil ist reines lokales FS), M (Hosts-Store/Keychain), O (Git-Graph-Canvas).

Design-Entscheidungen aus der ersten Planungsrunde (unverändert gültig für die verbliebenen Punkte):
- Shell-Deny-List (#8): Secret-Pfad-Muster aus `checkReadable` zusätzlich im Shell-Text blocken, nicht nur Sudo/Escape-Lücken.

---

## Workstream A — AI-Tool-Security (#1, #3, #4, #6, #7, #8)

**#1 — SSH-Remote `read_file`/`list_directory` umgeht Deny-List komplett**
`src/modules/ai/tools/fs.ts` — die SSH-Zweige (Zeilen ~26-41 `read_file`, ~78-92 `list_directory`) rufen `ssh_exec_command` ohne jede Prüfung auf. Da `checkReadable`/`checkWritable` (`src/modules/ai/lib/security.ts`) nur lokale Pfad-Strings prüfen und `ToolContext` (`tools/context.ts`) keinen Remote-Session-Zugriff jenseits der reinen Tab-ID bereitstellt, ist der pragmatische Fix: Vor dem `ssh_exec_command`-Aufruf denselben `checkReadable(path)`-Check anwenden wie im lokalen Zweig (der Pfad-String selbst ist deny-list-relevant, unabhängig davon ob lokal oder remote — `.ssh/id_rsa` bleibt `.ssh/id_rsa`). Kein neuer Remote-Session-Kontext nötig, nur der bestehende Check vor die bestehende `invoke`-Zeile ziehen, in beiden Tools.

**#3 — Symlink-Bypass**
`checkReadable`/`checkWritable` in `security.ts` prüfen nur den literalen Pfad-String; `fs_read_file` (`src-tauri/src/modules/fs/file.rs`) folgt Symlinks via `std::fs::metadata`/`std::fs::read`. Fix: `read_file`/`list_directory` in `fs.ts` rufen vor `native.readFile`/`native.readDir` zusätzlich `invoke("fs_realpath", { path })` (neuer, kleiner Rust-Command, `std::fs::canonicalize` + `spawn_blocking`) auf und wenden `checkReadable` **zusätzlich** auf den aufgelösten Pfad an — schlägt einer der beiden Checks fehl, wird verweigert. Gleiches Prinzip für `checkWritable` in `edit.ts`/`fs.ts`s `write_file`.

**#4 — `grep`/`glob` prüfen nur die Root, nicht die Treffer**
`src/modules/ai/tools/search.ts` — `grep`- und `glob`-Tools (Zeilen ~48-52 bzw. ~78+) rufen `checkReadable(r.path)` einmal auf der Such-Root auf. Fix: nach Erhalt der Ergebnisse (`res.hits`/`res.entries`) jeden Treffer-Pfad zusätzlich durch `checkReadable` filtern, bevor er zurückgegeben wird — Treffer, die scheitern, werden aus der Ergebnisliste entfernt (nicht die ganze Anfrage abbrechen). Bei `grep` reicht das Filtern auf `h.path`, bei `glob` auf jedes `entry.path`.

**#6 — TOCTOU bei generierten Private-Key-Permissions**
`src-tauri/src/modules/credentials/mod.rs::credential_generate_keypair` (Zeilen ~305-312): `std::fs::write` läuft vor `set_permissions(0o600)`. Fix: Datei mit `std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&key_path)` öffnen (via `std::os::unix::fs::OpenOptionsExt`, `#[cfg(unix)]` — App ist nur macOS+Linux) und die PEM-Bytes in den bereits mit 0600 erstellten File-Handle schreiben. Der separate `set_permissions`-Aufruf danach entfällt komplett — keine Race-Window mehr.

**#7 — Remote-Edit-Tempdateien ungeschützt**
`src-tauri/src/modules/ssh/sftp.rs::prepare_remote_edit` (Zeilen ~410-454): `std::fs::create_dir_all(&temp_dir)` und `std::fs::write(&temp_path, &file_data)` bekommen aktuell nur Default-Umask-Rechte. Fix: analog zu #6 — `temp_dir` nach `create_dir_all` explizit auf `0o700` setzen (`set_permissions`, `#[cfg(unix)]`), und `temp_path` mit derselben `OpenOptionsExt::mode(0o600)`-Technik statt `std::fs::write` erstellen. Cleanup-Verhalten (`cleanup_remote_edit_temp`, fire-and-forget bei Tab-Close) bleibt unverändert.

**#8 — Shell-Deny-List (`run_command`) leicht umgehbar**
`src/modules/ai/lib/security.ts::checkShellCommand` (Zeilen ~157-179): Zwei Erweiterungen:
1. Sudo/Escape-Lücke schließen: vor dem Pattern-Matching einen führenden `sudo\s+`/`doas\s+`-Token aus dem Command-String strippen, damit die bestehenden `DESTRUCTIVE_PATTERNS`/Blockier-Regexes (`rm -rf /`, `dd of=/dev/...`, `mkfs`/`fdisk`) auch mit Sudo-Präfix greifen.
2. Secret-Pfad-Erkennung: `checkShellCommand` scannt den rohen Command-String zusätzlich auf Vorkommen der bereits existierenden `SECRET_BASENAME_PATTERNS`/`SECRET_PATH_SEGMENTS` (aus `checkReadable`, wiederverwenden statt duplizieren — als Substring-/Regex-Scan über den ganzen String, damit auch Quoting-Varianten erfasst werden) und blockt (nicht nur warnt) bei Treffer.
   - Bekannte, akzeptierte Grenze (im Code als Kommentar dokumentieren): Command-Substitution (`$(cat ~/.ssh/id_rsa)`), Base64-/Hex-Umwege sind über reines String-Matching nicht zuverlässig erkennbar — bleibt Aufgabe der Approval-UI.

**Kritische Dateien:** `src/modules/ai/tools/fs.ts`, `src/modules/ai/tools/search.ts`, `src/modules/ai/tools/edit.ts`, `src/modules/ai/lib/security.ts`, `src-tauri/src/modules/fs/file.rs` (neuer `fs_realpath`-Command + Registrierung in `lib.rs`), `src-tauri/src/modules/credentials/mod.rs`, `src-tauri/src/modules/ssh/sftp.rs`.

---

## Workstream B — SSH-Terminal-Query-Reply-Fix (#9)

**Verifizierter Befund:** Der `isRemote`-Gate in `terminalSessionRegistry.ts:229` skippt nur Labonairs eigenen `registerTerminalQueryHandlers`-Aufruf. xterm.js registriert aber selbst unconditional eingebaute Handler für CSI `n` (CPR, `InputHandler.ts:256`, `deviceStatus()` bei `:2653`) und CSI `c` (DA1) im `InputHandler`-Konstruktor — ohne NaN-Guard. Der Parser dispatcht CSI-Handler LIFO (`EscapeSequenceParser.ts:676-687`). Für lokale Sessions gewinnt Labonairs später registrierter Handler; für SSH-Sessions bleibt xterms eingebauter, ungeschützter Handler der einzige Responder — über denselben langsamen SSH-IPC+Netzwerk-Pfad, der als Root Cause der TUI-Korruption identifiziert wurde. OSC 10/11 sind tatsächlich sauber deaktiviert (kein xterm-Built-in dafür).

**Fix:** In `terminalSessionRegistry.ts`, wenn `s.isRemote`, statt `() => {}` eine neue Funktion `registerTerminalQuerySwallowHandlers(term)` aufrufen (neu in `osc-handlers.ts`), die CSI `c`- und CSI `n`-Handler registriert, die die Query **schlucken** (`return true`, kein `writeToProcess`-Aufruf). Da diese Handler nach xterms Konstruktor-Handlern registriert werden, gewinnen sie im LIFO-Dispatch:
```ts
// osc-handlers.ts — neu
export function registerTerminalQuerySwallowHandlers(term: Terminal): () => void {
  const handles: IDisposable[] = [];
  handles.push(term.parser.registerCsiHandler({ final: "c" }, () => true));
  handles.push(term.parser.registerCsiHandler({ final: "n" }, () => true));
  return () => handles.forEach((h) => h.dispose());
}
```
In `terminalSessionRegistry.ts:229`: `const query = s.isRemote ? registerTerminalQuerySwallowHandlers(term) : registerTerminalQueryHandlers(term, (d) => s.bridge.writeToPty(d));`

**Zusätzlich (gleiche Baustelle):**
- `SshTerminalPane.tsx:57-58` (`getCursorPixelPos`) und `block/lib/blockDecorations.ts:205,347` lesen `cursorX/cursorY` ohne Finiteness-Guard — denselben `Number.isFinite`-Guard wie im bestehenden CPR-Handler anwenden (Helper `safeCursorPos(buf)` in `osc-handlers.ts` extrahieren, an beiden Stellen wiederverwenden).
- Test hinzufügen: `osc-handlers.test.ts` um Fälle für `registerTerminalQuerySwallowHandlers` erweitern.

**Kritische Dateien:** `src/modules/terminal/lib/osc-handlers.ts`, `src/modules/terminal/lib/terminalSessionRegistry.ts`, `src/modules/terminal/SshTerminalPane.tsx`, `src/modules/terminal/block/lib/blockDecorations.ts`, `src/modules/terminal/lib/osc-handlers.test.ts`.

**Verifikation:** Da die letzten 2 Sessions genau dieses Problem bereits (fälschlich) als gelöst markiert hatten — nach diesem Fix **zwingend** mit echtem SSH-Host + `gh auth login`/`claude` in `pnpm tauri dev` live testen, nicht nur `vitest`/`tsc`.

---

## Workstream D — Rust: Kill-Deadlock (#11)

`src-tauri/src/modules/shell/background.rs`: Reaper-Thread hält `child`-Mutex während des blockierenden `wait()`; `kill()` braucht denselben Lock → Deadlock (ein hängender Background-Prozess ist über die Kill-API dann gar nicht mehr stoppbar). Fix: PID unabhängig vom Mutex speichern.
```rust
pub struct BackgroundProc {
    ...
    pub pid: std::sync::atomic::AtomicU32, // NEU, 0 = "kein PID / bereits reaped"
}
```
`pid` wird direkt nach `cmd.spawn()` via `child.id()` gesetzt (vor dem Move in `Mutex::new(Some(child))`). Neues `kill()`:
```rust
pub fn kill(&self) {
    let pid = self.pid.load(Ordering::Acquire);
    if pid != 0 {
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL); }
    }
}
```
`libc` ist bereits direkte Dependency, App ist nur macOS+Linux (kein Windows-Zweig nötig). Der Reaper behält sein Lock-während-`wait()`-Muster unverändert — unproblematisch, da `kill()` diesen Lock nicht mehr braucht.

**Kritische Datei:** `src-tauri/src/modules/shell/background.rs`.

---

## Workstream E — Blocking-I/O `spawn_blocking`-Sweep für lokale FS-Commands (#22, Teilmenge)

Betrifft die sechs synchronen `#[tauri::command] pub fn` in `src-tauri/src/modules/fs/mutate.rs` (`fs_create_file`, `fs_create_temp_file`, `fs_create_dir`, `fs_rename`, `fs_copy_into`, `fs_delete`), die blockierende lokale I/O ohne `spawn_blocking` machen — Verstoß gegen CLAUDE.md-Regel 3. Referenzmuster bereits korrekt vorhanden in `fs/file.rs::fs_read_file` (Body unverändert in `spawn_blocking(move || {...}).await.map_err(|e| e.to_string())?` einwickeln, `pub fn` → `pub async fn`). Alle sechs Funktionen haben nur owned Parameter — straightforward, keine `tauri::State`-Verrenkungen nötig. Jeder Tauri-`invoke_handler!`-Eintrag in `lib.rs` bleibt unverändert (Command-Namen ändern sich nicht).

**Kritische Datei:** `src-tauri/src/modules/fs/mutate.rs`.

---

## Workstream F — Rust-Perf: `fs_grep`/`fs_glob` Parallelisierung (#23)

`fs/grep.rs::fs_grep` nutzt `WalkBuilder::build()` (single-threaded) statt `build_parallel()`, obwohl die Hit-Akkumulatoren (`Arc<Mutex<Vec<GrepHit>>>`, `Arc<AtomicUsize>`, `Arc<AtomicBool>`) bereits thread-safe sind. Fix: `.build()` → `.build_parallel()`, per-Entry-Body von `for dent in walker.flatten()` in eine Closure-Factory umbauen (`walker.run(|| Box::new(move |entry| { ...; WalkState::Continue }))`), Matcher/Glob-Konfiguration klonen (beide Typen sind `Clone`). `truncated.load()` früh auf `WalkState::Quit` statt `Continue` prüfen, um alle Worker-Threads sofort zu stoppen.

`fs_glob` braucht vorher dieselbe Akkumulator-Umstellung (`Vec<GlobHit>` → `Arc<Mutex<Vec<GlobHit>>>`, `bool truncated` → `Arc<AtomicBool>`), dann dieselbe `build_parallel()`-Umstellung.

**Kritische Datei:** `src-tauri/src/modules/fs/grep.rs`.

---

## Workstream G — Frontend Tab-Store-Performance (#17, #18, #19)

**#17/#18 — TabBar/SidebarTabList re-rendern bei jeder Store-Mutation**
`TabBar.tsx:65` und `SidebarTabList.tsx:62` abonnieren `s.tabs` direkt (volle Array-Referenz, die bei JEDER Store-Mutation neu ist — auch wenn `updatePaneSessionCwd` bei jedem OSC-7-cwd-Update aus jedem Terminal `tabs.map()` aufruft, `tabsStore.ts:674`). Fix: wertbasiert memoisierter Selektor statt Referenzvergleich auf dem Roh-Array.

In `tabsStore.ts` neuer Selektor mit Cache, der pro Tab-ID nur dann ein neues Summary-Objekt baut, wenn sich `kind`/`dirty`/Label tatsächlich geändert haben — nicht bei jeder Objekt-Referenzänderung des Tabs selbst (z.B. bei cwd-Updates):
```ts
type TabSummary = { id: number; kind: Tab["kind"]; dirty: boolean; label: string };
const summaryCache = new Map<number, TabSummary>();
function toSummary(t: Tab): TabSummary {
  const dirty = t.kind === "editor" ? t.dirty : false;
  const label = labelFor(t);
  const prev = summaryCache.get(t.id);
  if (prev && prev.kind === t.kind && prev.dirty === dirty && prev.label === label) return prev;
  const next: TabSummary = { id: t.id, kind: t.kind, dirty, label };
  summaryCache.set(t.id, next);
  return next;
}
export const selectTabSummaries = (s: TabsState): TabSummary[] => s.tabs.map(toSummary);
```
`closeTab`-Action ergänzt `summaryCache.delete(id)`. `TabBar.tsx`/`SidebarTabList.tsx` wechseln von `useTabsStore((s) => s.tabs)` zu `useTabsStore(useShallow(selectTabSummaries))`. `labelFor(t)` muss nach `tabsStore.ts` verschoben/exportiert werden (vorhandene Logik nur verschieben, nicht neu schreiben).

**#19 — AppShell erzeugt bei jedem Render neue Inline-Closures/Objektliterale**
`src/app/components/AppShell.tsx` (Zeilen ~94-193): `sidebarPassthrough`-Objektliteral (~20 Inline-Arrow-Functions) und die Props an `<Header>` werden jeden Render neu gebaut, was jede Memoisierung in `Header`/`SidebarContent` aushebelt. Fix: stabile Closures mit `useCallback` wrappen, `sidebarPassthrough` mit `useMemo` bauen (Deps: Zustand-Store-Actions sind bereits referenzstabil, daher meist leeres/kleines Dep-Array). `onNewGitGraph` (Zeilen ~104-116) ebenfalls in `useCallback`.

**Kritische Dateien:** `src/modules/tabs/store/tabsStore.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/SidebarTabList.tsx`, `src/app/components/AppShell.tsx`.

---

## Workstream H — Editor-Autosave (#13)

`src/modules/editor/lib/useAutoSave.ts`: Effekt-Dependencies `[editorAutoSave, editorAutoSaveDelay, doc, isUntitled]` — `doc` ändert sich nur beim Datei-Laden, nicht bei Edits. Timer feuert daher nur einmal pro Datei-Öffnung.

Fix: In `useDocument.ts` einen `editVersion`-Zähler ergänzen (`const [editVersion, setEditVersion] = useState(0)`), in `onChange` bei jedem Aufruf inkrementiert. `useAutoSave`s Effekt-Dependencies werden zu `[editorAutoSave, editorAutoSaveDelay, editVersion, isUntitled, doc.status]` plus früher Guard `if (!dirty) return;`. Damit armt jede Keystroke-Änderung den Debounce-Timer neu.

**Kritische Dateien:** `src/modules/editor/lib/useAutoSave.ts`, `src/modules/editor/lib/useDocument.ts`.

---

## Workstream I — Toter Command-Palette-Eintrag (#14)

`useSettingsCommands.ts:213-221` dispatched `labonair:sftp-toggle-hidden`, worauf niemand hört — `SftpPane.tsx`s lokale, nicht-exportierte `toggleHiddenFiles()`-Funktion ist der tatsächliche Toggle-Pfad. Fix: Logik als exportierte Helper-Funktion `toggleSftpHiddenFiles()` nach `src/modules/settings/store.ts` verschieben, `SftpPane.tsx` und Command-Palette nutzen beide dieselbe Funktion statt des toten `CustomEvent`-Dispatches.

**Kritische Dateien:** `src/modules/command-palette/hooks/useSettingsCommands.ts`, `src/modules/sftp/SftpPane.tsx`, `src/modules/settings/store.ts`.

---

## Workstream J — Snippet-Listener-Leak (#15)

`src/modules/snippets/lib/useSnippetExec.ts` (Zeilen ~94-142): `registerRunListeners(runId)` läuft unconditional VOR dem SSH-Session-Existenz-Check; bei fehlender Session wird `return`et ohne dass `snippet_run_ssh` je aufgerufen wird — die zwei Listener leaken bis Component-Unmount. Fix: Reihenfolge umstellen — `sshSession`-Lookup und Bail-out zuerst, `registerRunListeners(runId)` erst unmittelbar vor dem tatsächlichen `invoke`-Aufruf.

**Kritische Datei:** `src/modules/snippets/lib/useSnippetExec.ts`.

---

## Workstream K — Dormant-Scrollback-Datenverlust bei Flush-Fehler (#16)

`dormantRing.ts::peekNew()` setzt `flushedBytes = total` unconditional, bevor `flushDormantScrollback()` weiß, ob `scrollback_save` erfolgreich war — Bytes gehen bei Fehler/Größenlimit dauerhaft verloren.

Fix: Trennung "Vorschau ohne Mutation" und "Commit nach Erfolg":
- `DormantRing.peekNew(write)` → `previewNew(write): number` (mutiert `flushedBytes` nicht, gibt erreichten Offset zurück) + `commitFlushed(uptoOffset)` (mutiert explizit).
- `terminalSessionRegistry.ts::peekDormantAnsi(sessionId)` → liefert zusätzlich den Offset, plus neue `commitDormantFlush(sessionId, uptoOffset)`.
- `flushDormantScrollback()` ruft nach erfolgreichem `scrollback_save` explizit `commitDormantFlush` auf; bei Fehler/Bail wird nicht committed.
- `drain()` (Rebind-Replay-Pfad) bleibt unverändert.

**Kritische Dateien:** `src/modules/terminal/lib/dormantRing.ts`, `src/modules/terminal/lib/terminalSessionRegistry.ts`, `src/modules/session/scrollback.ts`, `dormantRing.test.ts`.

---

## Workstream L — SFTP/Explorer-Pagination-Parität (#26)

- **Dual-Pane-SFTP-Tab** (`src/modules/sftp/store/sftpStore.ts::loadRemoteDir`, Zeile ~154): nutzt aktuell nicht-paginiertes `sftp_read_dir`. Fix: auf bereits existierendes `sftp_read_dir_page` umstellen (reiner Call-Site-Wechsel, kein neuer Rust-Code — Command wird vom Sidebar-Explorer bereits genutzt), mit demselben Offset-Tracking-Pattern wie `useFileTree.ts`. `SftpPane.tsx` braucht einen "Load more"-Trigger analog zum Explorer-Tree.
- **Lokaler Sidebar-Explorer** (`src/modules/explorer/lib/providers/localFsProvider.ts::readDir`, Zeilen ~35-51): `fs_read_dir` liefert immer die komplette Liste. Fix: neuer optionaler `offset`/`limit`-Parameter für `fs_read_dir` (Rust, `fs/tree.rs`, reines lokales FS) analog zu `sftp_read_dir_page`s Contract, `localFsProvider.ts` reicht `opts?.offset` durch.

**Kritische Dateien:** `src/modules/sftp/store/sftpStore.ts`, `src/modules/sftp/SftpPane.tsx`, `src/modules/explorer/lib/providers/localFsProvider.ts`, `src-tauri/src/modules/fs/tree.rs`.

---

## Workstream M — Hosts-Store-Edge-Cases

**`deleteManyHosts`-Partial-Failure** (`hostsStore.ts:189-196`): `Promise.all` bricht beim ersten Fehler komplett ab. Fix: `Promise.allSettled`, nur erfolgreiche IDs aus lokalem State filtern, fehlgeschlagene IDs über `useNotificationStore.addNotification` melden.

**`duplicateHost` verliert Credentials** (`hostsStore.ts:198-220`): `Host`-Read-Typ enthält kein `password`-Feld. Fix serverseitig (Klartext-Passwort nie über IPC hin und zurück): neuer Rust-Command `hosts_duplicate(id) -> Result<Host, LabonairError>` (`src-tauri/src/modules/hosts/db.rs`), der die DB-Zeile kopiert und intern `get_password`/`store_password` (bestehende Helper) für `"labonair-app"`/`"labonair-sudo"` unter der neuen Host-ID repliziert. `hostsStore.ts::duplicateHost` ruft diesen neuen Command statt `createHost(payload)`.

**Kritische Dateien:** `src/modules/hosts/store/hostsStore.ts`, `src-tauri/src/modules/hosts/db.rs`, `src-tauri/src/lib.rs`.

---

## Workstream O — Git-Graph `Math.max`-Stack-Safety (Edge-Case)

`src/modules/git-graph/components/GitGraphCanvas.tsx:106`: `Math.max(1, ...commits.map((c) => c.laneCount))` spreadet potenziell zehntausende Argumente. Fix:
```ts
const maxLaneCount = useMemo(
  () => commits.reduce((max, c) => (c.laneCount > max ? c.laneCount : max), 1),
  [commits],
);
```

**Kritische Datei:** `src/modules/git-graph/components/GitGraphCanvas.tsx`.

---

## Empfohlene Ausführungsreihenfolge

0. `review-fix-plan.md` (dieser reduzierte Plan) ins Projekt-Root schreiben. ✅ (dieser Schritt)
1. **Security zuerst:** Workstream A — höchstes Risiko, keine Abhängigkeiten.
2. **Workstream B** (SSH-TUI-Fix) separat mit Priorität, da bereits zweimal fälschlich als erledigt markiert — eigener Fokus-Pass plus Live-Verifikation vor dem Weitermachen.
3. **Rust-Block:** D (#11), E (`fs/mutate.rs`), F (#23) — klein, unabhängig, können in einer Session gebündelt werden.
4. **Frontend-Perf-Block:** G, H, I, J, K, L — unabhängig voneinander, beliebige Reihenfolge.
5. **Rest:** M, O — klein, unabhängig, jederzeit einschiebbar.

## Verifikation

Nach jedem Workstream (nicht erst am Ende):
- Rust-Änderungen: `cd src-tauri && cargo check && cargo clippy`, `cargo test --lib`.
- Frontend-Änderungen: `pnpm exec tsc --noEmit`, `pnpm vitest run` (für B, G, H, K neue Testfälle ergänzen, da dort Logikänderungen mit klarem Vorher/Nachher-Verhalten vorliegen).
- **Workstream B ist NICHT als erledigt zu markieren, bis ein echter `pnpm tauri dev`-Test gegen einen SSH-Host mit `gh auth login` oder `claude` sauberes Rendering zeigt** — automatisierte Tests reichen hier nachweislich nicht (siehe Historie).
- Am Ende jedes committeten Workstreams: kurzer Eintrag in `handshake.md` gemäß Projekt-Konvention, plus Task-Status-Update falls ein `tasks/TASK_*.md` existiert.
