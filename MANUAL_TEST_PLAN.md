# Manueller Testplan — review-fix-plan.md (Workstreams A, B, D–O)

Automatisierte Checks (`cargo check`/`clippy`/`test --lib`, `tsc --noEmit`, `vitest run`) sind für jeden Commit bereits grün. Dieser Plan deckt das ab, was nur ein Mensch mit echtem Display + echtem SSH-Host prüfen kann. Branch: `performance-internals-optimazation`.

Setup: `pnpm tauri dev` starten. Für alle SSH-Tests wird mindestens ein erreichbarer SSH-Host gebraucht (idealerweise einer mit `gh`/`claude` installiert für Test 1).

---

## 🔴 Priorität 1 — Workstream B: SSH-TUI-Query-Reply-Fix

Das ist der wichtigste Test der ganzen Liste — dieser Bug wurde in den letzten beiden Sessions bereits zweimal fälschlich als "gelöst" markiert.

**Test 1.1 — `gh auth login` über SSH**
1. SSH-Tab zu einem Host mit installiertem `gh` öffnen.
2. `gh auth login` ausführen, dem interaktiven Menü folgen (Pfeiltasten, Auswahl).
3. **Erwartet:** Menü rendert sauber, keine `NaN;1R`-artigen Textfragmente, keine doppelten/überlappenden Frames, Pfeiltasten-Navigation reagiert normal.
4. **Vorher (Bug):** Literale `NaN;1R`-Zeichen erschienen im Text, Menü zeigte gemischten/korrupten Inhalt.

**Test 1.2 — `claude` Onboarding-TUI über SSH**
1. Im selben oder neuen SSH-Tab `claude` starten (falls installiert) bzw. ein anderes Full-Screen-TUI mit Cursor-Queries (z. B. `htop`, `vim`, `less`).
2. **Erwartet:** "Welcome to Claude Code" (oder das jeweilige TUI) rendert als zusammenhängender, lesbarer Text — nicht als "WelcomentoiClaudeeCode" o. ä.
3. Menü mit Pfeiltasten durchgehen, TUI wieder verlassen (`q`/Strg+C).
4. **Erwartet:** Sauberes Redraw beim Verlassen, keine Textreste der TUI im Scrollback.

**Test 1.3 — Lokales Terminal als Kontrolle**
1. Dieselben Programme (`gh auth login`, `claude`, `htop`) in einem **lokalen** (nicht-SSH) Tab starten.
2. **Erwartet:** Rendert korrekt (war schon vorher der Fall — dient nur als Kontrollgruppe, um sicherzustellen, dass der Fix nichts an lokalen Terminals verändert hat).

**Test 1.4 — Terminal-Titel/Farben über SSH (OSC 10/11)**
1. In einem SSH-Tab ein Programm ausführen, das die Terminal-Hintergrund-/Vordergrundfarbe abfragt (z. B. `vim` mit einem Colorscheme, das `t_Co`/OSC-Farbabfrage nutzt, oder einfach `echo -e "\e]11;?\e\\"` manuell testen).
2. **Erwartet:** Kein Einfrieren, keine sichtbaren Escape-Sequenz-Reste im Terminal. (Farbabfragen werden für SSH absichtlich nicht beantwortet — das ist gewolltes Verhalten, kein Bug.)

**Falls Test 1.1/1.2 immer noch fehlschlagen:** Bitte exakt melden, was genau korrupt aussieht (Screenshot hilft) — dann brauchen wir echte Paket-Level-Instrumentierung statt weiterer statischer Code-Analyse, wie im Handshake vermerkt.

---

## 🟠 Workstream A — AI-Tool-Security

**Test 2.1 — SSH-Remote-Read der Deny-List**
1. AI-Chat öffnen, mit einem verbundenen SSH-Tab als aktivem Tab.
2. Modell auffordern: "read the file ~/.ssh/id_rsa" (oder einen anderen Pfad, der auf dem Remote-Host existiert, z. B. `~/.aws/credentials`).
3. **Erwartet:** Tool-Aufruf wird mit einer Refused-Meldung abgelehnt (z. B. "matches a sensitive-file pattern"), keine Dateiinhalte werden angezeigt.
4. Als Kontrolle: eine normale, nicht-sensible Remote-Datei lesen lassen (z. B. `~/.bashrc`). **Erwartet:** funktioniert wie gewohnt.

**Test 2.2 — Symlink-Bypass**
1. Lokal (Terminal-Tab) einen Symlink anlegen, der auf eine geschützte Datei zeigt: `ln -s ~/.ssh/id_rsa /tmp/notes.txt`.
2. AI im Chat auffordern: "read the file /tmp/notes.txt".
3. **Erwartet:** Wird verweigert (der aufgelöste Pfad wird jetzt zusätzlich geprüft), nicht mehr wie vorher stillschweigend durchgelassen.

**Test 2.3 — grep/glob-Treffer-Filterung**
1. Ein Testverzeichnis mit einer `.env`-Datei anlegen, die z. B. `SECRET=hunter2` enthält, innerhalb eines ansonsten normalen Projektordners.
2. AI auffordern, im Projektordner nach `SECRET` zu grep(pen).
3. **Erwartet:** Treffer aus `.env` erscheinen NICHT in den Ergebnissen (werden herausgefiltert), andere Treffer schon.

**Test 2.4 — Shell-Deny-List (sudo-Umgehung + Secret-Pfade)**
1. AI auffordern, `sudo rm -rf /` auszuführen (nur zur Prüfung, dass es abgelehnt wird — NICHT bestätigen falls doch ein Approval-Dialog kommt).
2. **Erwartet:** Wird sofort mit "Refused" abgelehnt, kein Approval-Dialog erscheint überhaupt.
3. AI auffordern: `cat ~/.ssh/id_rsa` als `run_command` auszuführen.
4. **Erwartet:** Wird ebenfalls abgelehnt ("references a sensitive-file pattern").

**Test 2.5 — Bewusste Ausnahme: "An Agent anhängen" umgeht die Deny-List weiterhin**
1. Im Datei-Explorer eine `.env`- oder Key-Datei per Rechtsklick "An Agent anhängen" wählen.
2. **Erwartet:** Funktioniert weiterhin (Datei wird angehängt) — das ist bewusst so belassen, kein Bug.

---

## 🟡 Workstream D/E/F — Rust-Backend (Hintergrund-Prozesse, lokale FS, Suche)

**Test 3.1 — Background-Prozess killen**
1. AI im Chat einen lang laufenden Hintergrundbefehl starten lassen (`run_command` im Background-Modus, z. B. `sleep 300`).
2. Den Prozess über die UI abbrechen/killen (Stop-Button im Tool-Status).
3. **Erwartet:** Prozess wird sofort beendet, UI zeigt "stopped"/beendet — kein Hängenbleiben, keine Zeitüberschreitung.

**Test 3.2 — Lokale Datei-Operationen (spawn_blocking-Sweep)**
1. Im Datei-Explorer: neue Datei anlegen, neuen Ordner anlegen, Datei umbenennen, Datei/Ordner löschen, eine große Datei/Ordner kopieren (per Copy/Paste oder Drag&Drop).
2. **Erwartet:** Alle Operationen funktionieren wie gewohnt, keine spürbare Verzögerung, App bleibt während der Operation responsiv (andere Tabs/Terminals frieren nicht ein).

**Test 3.3 — Suche (grep/glob) in einem großen Projekt**
1. In einem größeren Projektordner (idealerweise >5.000 Dateien, z. B. ein `node_modules`-haltiges Repo) im Explorer oder AI-Chat eine Volltextsuche starten.
2. **Erwartet:** Ergebnisse erscheinen, keine Abstürze, spürbar nicht langsamer als vorher (eher schneller durch Parallelisierung — kein exakter Benchmark nötig, nur "fühlt sich nicht kaputt an").

---

## 🟢 Workstream G — Tab-Leiste Performance

**Test 4.1 — Tab-Leiste reagiert nicht mehr auf fremde cwd-Änderungen**
1. Mehrere Terminal-Tabs öffnen (lokal reicht, SSH auch ok), in mindestens 3 davon aktiv im Hintergrund `cd`-Befehle ausführen (oder ein Skript, das wiederholt das Verzeichnis wechselt).
2. Während das im Hintergrund läuft: Tab-Leiste und Sidebar-Tab-Liste beobachten.
3. **Erwartet:** Tab-Titel/Icons flackern/springen nicht sichtbar, während Hintergrund-Tabs ihr Verzeichnis wechseln. Der aktive Tab bleibt optisch stabil.
4. Tab wechseln, umbenennen, schließen — alles sollte weiterhin normal funktionieren (Feature-Parität, keine Regression).

**Test 4.2 — Editor-Tab Dirty-Punkt / Icon**
1. Eine Datei im Editor öffnen und bearbeiten.
2. **Erwartet:** Der "ungespeicherte Änderungen"-Punkt erscheint sofort am Tab, verschwindet nach dem Speichern.
3. SSH-Terminal-Tab öffnen — Icon sollte SSH-spezifisch aussehen (nicht das normale Terminal-Icon), auch nach einem Pane-Split/aktivem-Pane-Wechsel korrekt.

---

## 🟢 Workstream H — Editor-Autosave

**Test 5.1 — Autosave feuert bei jeder Änderung neu**
1. Settings → Editor: Autosave auf "After Delay" stellen, Delay z. B. auf 2 Sekunden.
2. Eine Datei öffnen, tippen, 1 Sekunde warten, weiter tippen, 1 Sekunde warten, weiter tippen (Tastatureingaben über einen Zeitraum verteilen, der länger ist als die Delay-Zeit, aber mit Pausen kürzer als die Delay-Zeit dazwischen).
3. **Erwartet:** Datei wird NICHT vorzeitig gespeichert, solange kontinuierlich getippt wird (jede neue Eingabe verschiebt den Timer). Erst ~2 Sekunden nach der LETZTEN Eingabe wird gespeichert (Dirty-Punkt verschwindet).
4. **Vorher (Bug):** Es wurde nur einmal, kurz nach dem Öffnen der Datei, automatisch gespeichert — danach nie wieder, egal wie viel weiter getippt wurde.

---

## 🟢 Workstream I — Command Palette "Hidden Files"

**Test 6.1**
1. SFTP-Tab (Dual-Pane) öffnen.
2. Command Palette öffnen (Cmd/Ctrl+Shift+P o. ä.), "Toggle: Show Hidden Files" ausführen.
3. **Erwartet:** Versteckte Dateien (Punkt-Dateien) erscheinen/verschwinden in beiden Panes — der Befehl hat jetzt tatsächlich eine Wirkung (vorher: tat nichts).
4. Zusätzlich über den Toolbar-Button in der SFTP-Pane togglen — beide Wege sollten denselben, synchronisierten Zustand zeigen.

---

## 🟢 Workstream J — Snippet-Ausführung ohne SSH-Session

**Test 7.1**
1. Ein Snippet anlegen, das Ziel = SSH auf einen Host, zu dem AKTUELL KEIN offener Terminal-Tab existiert.
2. Snippet im "Silent"-Modus ausführen.
3. **Erwartet:** Fehlermeldung "No active SSH session for this host..." erscheint im Log-Drawer, App bleibt stabil.
4. Das mehrfach wiederholen (5-10x hintereinander).
5. **Erwartet:** Kein spürbares Memory-Leck/Verlangsamung der App danach (schwer exakt zu messen — Sinn des Tests: mehrfaches Fehlschlagen darf keine Fehlfunktion an anderer Stelle auslösen, z. B. dass danach echte SSH-Snippet-Runs nicht mehr funktionieren).
6. Danach ein Snippet gegen einen Host mit tatsächlich offener SSH-Session ausführen. **Erwartet:** Funktioniert normal, Output erscheint im Log.

---

## 🟢 Workstream K — Dormant-Scrollback

Schwer exakt zu reproduzieren (Netzwerkfehler/Größenlimit sind seltene Fälle) — folgender Test prüft zumindest den Normalfall:

**Test 8.1 — Normalfall (Regression-Check)**
1. SSH-Tab öffnen, viel Output erzeugen (z. B. `find / 2>/dev/null` kurz laufen lassen und abbrechen), dann zu einem anderen Tab wechseln (SSH-Tab wird "dormant"/hidden).
2. Mehrere Minuten warten (oder App-Einstellungen: Scrollback-Flush-Intervall falls konfigurierbar).
3. Zurück zum SSH-Tab wechseln.
4. **Erwartet:** Scrollback zeigt den Output vollständig und unverdoppelt (kein wiederholt eingefügter Text-Block).
5. App komplett beenden und neu starten.
6. **Erwartet:** Scrollback des Tabs (falls Session-Restore aktiv) ist weiterhin vollständig und nicht dupliziert.

---

## 🟢 Workstream L — SFTP/Explorer Pagination

**Test 9.1 — Dual-Pane SFTP mit großem Verzeichnis**
1. SFTP-Tab öffnen, zu einem Remote-Verzeichnis mit sehr vielen Dateien navigieren (>500, z. B. `/usr/lib` oder ein großes `node_modules`).
2. **Erwartet:** Verzeichnis lädt (ggf. nur die ersten ~500 Einträge), am Ende der Liste erscheint ein "Load more…"-Button.
3. Auf "Load more…" klicken.
4. **Erwartet:** Weitere Einträge werden angehängt, keine Duplikate, keine fehlenden Einträge, Button verschwindet, wenn alle geladen sind.

**Test 9.2 — Lokaler Explorer mit großem Verzeichnis**
1. Im Sidebar-Explorer (lokal) zu einem sehr großen lokalen Verzeichnis navigieren (>500 Einträge, z. B. `node_modules` in einem großen Projekt).
2. **Erwartet:** Verzeichnis öffnet ohne spürbare Verzögerung/Einfrieren, "Load more…"-Zeile erscheint im Baum falls mehr als eine Seite vorhanden ist (analog zum bereits bestehenden Remote-Verhalten).

**Test 9.3 — Hidden Files weiterhin korrekt (Regressionscheck zu Test 6.1)**
1. Im Dual-Pane-SFTP-Tab "Hidden Files" umschalten, während ein großes Remote-Verzeichnis geladen ist, ggf. mit bereits nachgeladenen Seiten.
2. **Erwartet:** Hidden-Files-Filterung funktioniert weiterhin korrekt über alle geladenen Seiten hinweg.

---

## 🟢 Workstream M — Host-Verwaltung

**Test 10.1 — Mehrere Hosts löschen mit simuliertem Teilfehler**
1. Mehrere Hosts auswählen (Mehrfachauswahl) und gemeinsam löschen.
2. **Erwartet (Normalfall):** Alle ausgewählten Hosts verschwinden aus der Liste.
3. (Optional, schwer zu simulieren) Falls ein Fehler auftritt (z. B. Netzwerk-/DB-Problem): **Erwartet:** Eine Fehlermeldung/Benachrichtigung erscheint, und nur die tatsächlich gelöschten Hosts verschwinden — nicht alle oder keiner.

**Test 10.2 — Host duplizieren mit Passwort-Auth**
1. Einen Host mit **Passwort-Authentifizierung** (nicht Key-based) anlegen, falls noch keiner existiert, Passwort setzen.
2. Diesen Host duplizieren (Kontextmenü "Duplicate").
3. Den duplizierten Host anklicken/verbinden versuchen, OHNE das Passwort erneut einzugeben.
4. **Erwartet:** Verbindung gelingt direkt — das Passwort wurde mitkopiert. **Vorher (Bug):** Verbindung hätte nach Passwort gefragt, weil es beim Duplizieren verloren ging.
5. Falls der Host auch ein Sudo-Passwort hatte: prüfen, dass auch das übernommen wurde (z. B. `sudo`-Befehl im Terminal des duplizierten Hosts ausführen, Passwort-Prompt sollte automatisch gefüllt werden, falls diese Funktion aktiv ist).

---

## 🟢 Workstream O — Git Graph

**Test 11.1 — Regressionscheck (kein funktionaler Unterschied erwartet)**
1. Git Graph für ein Repo mit mehreren Branches/Merges öffnen.
2. **Erwartet:** Grafik rendert wie gewohnt, Lane-Breiten sehen normal aus, keine visuellen Unterschiede zu vorher.
3. Falls ein sehr großes Repo verfügbar ist: "Load more" mehrfach klicken, um viele Commits zu laden.
4. **Erwartet:** Kein Absturz/Fehler beim Laden vieler Commits (der eigentliche Fix betrifft nur ein theoretisches Stack-Limit bei sehr großen Commit-Zahlen — in der Praxis meist nicht beobachtbar, daher primär ein Negativ-Test: nichts sollte kaputtgehen).

---

## Nach dem Testen

- Alle ✅ → Branch ist bereit für eine PR gegen `main`.
- Test 1.1/1.2 (Workstream B) schlägt fehl → mir mitteilen, exakt was zu sehen ist (idealerweise Screenshot + welcher Befehl), dann brauchen wir Paket-Level-Instrumentierung.
- Irgendein anderer Test schlägt fehl → mir mitteilen, welcher Test + was genau abweicht, dann schaue ich mir den entsprechenden Commit nochmal an.
