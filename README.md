## Labonair Terminal and SSH, SFTP
<img src="src-tauri/icons/icon.png" align="left" width="200"/>

### `Labonair`
<p><strong>macOS-native remote workspace — SSH · SFTP · Terminal · Editor · AI</strong></p>

Labonair is a macOS-native remote workspace built on Tauri 2 + Rust and React 19. It combines SSH terminal sessions, a full-featured SFTP file manager, an integrated code editor with remote editing support, and a first-class AI side-panel — all in a single lightweight app. API keys live in the OS keychain, no telemetry, no account required.

  <p>
    <img src="https://img.shields.io/badge/version-0.7.0-blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/built%20with-Tauri%202-orange" alt="tauri" />
  </p>

---


## Features

**SSH Terminal**
- Native PTY backend via `ssh2` + `portable-pty` — one tab per connection
- xterm.js + WebGL renderer, multi-tab with background streaming
- **Recursive split-pane workspace** — infinite horizontal (`⌘D`) and vertical (`⌘⇧D`) splits per tab; resize handles, click-to-focus, close pane with `⌘⇧W`
- Terminal history survives split/close (no remounts — flat render layer architecture)
- Shell integration (cwd reporting, prompt markers) via injected init scripts
- Inline search, link detection, true-color, 2FA / keyboard-interactive auth
- Known-host fingerprint verification with in-app warning flow

**SFTP File Manager**
- Virtualized split-pane browser (local ↔ remote) powered by `@tanstack/react-virtual`
- Background transfer queue with progress tracking and conflict resolution
- Context menus: rename, delete, mkdir, chmod, download, upload
- Drag-and-drop transfers between panes

**Remote Editor**
- Open remote files directly in the editor via SFTP (`prepare_remote_edit` / `save_remote_edit`)
- CodeMirror 6 with language support for TS/JS, Rust, Python, HTML/CSS, JSON, Markdown
- Inline AI autocomplete and AI edit diffs
- Vim mode + prebuilt themes (Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode)

**Host Manager**
- Master-detail host list with group organisation and drag-and-drop reorder
- Hosts stored in SQLite (`rusqlite`); passwords in macOS Keychain — never on disk
- Inspector pane: connection details, SFTP/tunnel config, notes
- Multi-select, context menus, inline group creation

**Local Terminal**
- Native PTY sessions for local shells (zsh, bash, …)
- Supports the same recursive split-pane layout as SSH terminals
- Auto-detects local dev servers and opens them in a web preview tab

**AI (BYOK)**
- Providers: OpenAI, Anthropic, Google, Groq, xAI, Cerebras, OpenAI-compatible
- Local / offline models via LM Studio
- Voice input, edit diffs, multi-agent and sub-agents
- Snippets / skills, customizable system prompt
- `LABONAIR.md` for project-level AI memory and configuration
- Tasks, plans, search, file read/write tools with in-app approval flow

**Quality**
- Lightweight (~22 MB bundle), fast startup
- API keys stored in macOS Keychain via `keyring`
- No telemetry, no account required

## Host Setup

1. Open the **Host Manager** (sidebar icon or `⌘H`).
2. Click **+** to add a host — fill in hostname, port, username, and authentication method (password or private key).
3. Hosts are organised into groups; drag rows to reorder.
4. Connect via the **Connect** button or double-click — opens an SSH terminal tab.
5. Switch to the **SFTP** tab in the header to browse and transfer files.

## Configure AI

1. Open **Settings → AI**.
2. Pick a provider and paste your API key. For local inference, point Labonair at your LM Studio endpoint.
3. Keys are written to the macOS Keychain — they never touch disk or `localStorage`.

## Installation

### Homebrew (recommended)

```sh
brew tap snenjih/labonair
brew install --cask labonair
```

Homebrew automatically removes the quarantine attribute, so the app opens without warnings.

### Manual

Download the latest `.dmg` from [Releases](https://github.com/Snenjih/labonair/releases), open it, and drag `Labonair.app` to `/Applications`.

If macOS blocks the app on first launch, run:

```sh
xattr -rd com.apple.quarantine /Applications/Labonair.app
```

Then right-click `Labonair.app` → **Open** → **Open** in the dialog.

---

## Build from source

**Prerequisites**
- Rust (stable) — https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- macOS with Xcode Command Line Tools
- Tauri prerequisites — https://tauri.app/start/prerequisites/

**Run**
```bash
pnpm install
pnpm tauri dev        # development
pnpm tauri build      # production bundle (.app / .dmg)
```

**Checks**
```bash
pnpm exec tsc --noEmit          # frontend type-check
cd src-tauri && cargo check     # Rust check
cd src-tauri && cargo clippy    # Rust lint
```

## Tech stack

| Layer | Libraries |
|---|---|
| Desktop shell | Tauri 2 |
| Backend | Rust · Tokio · `ssh2` · `portable-pty` · `rusqlite` · `keyring` |
| Frontend | React 19 · TypeScript · Vite |
| Terminal | xterm.js + WebGL addon |
| Editor | CodeMirror 6 |
| AI | Vercel AI SDK v6 |
| UI | Tailwind v4 · shadcn/ui · Zustand · `@tanstack/react-virtual` |

## Architecture

```
Labonair (Tauri v2)
├── Frontend: React 19 + TypeScript + Vite
│   ├── Tailwind CSS v4 + shadcn/ui
│   ├── Zustand (tabs, transfers, hosts)
│   ├── xterm.js + WebGL (terminal rendering)
│   └── @tanstack/react-virtual (SFTP file lists)
└── Backend: Rust (Tokio async)
    ├── portable-pty → local terminal sessions
    ├── ssh2 → SSH terminal + SFTP protocol
    ├── rusqlite (bundled) → host/group storage (SQLite)
    ├── keyring → passwords in macOS Keychain
    └── tokio mpsc → background transfer queue worker
```

All OS access lives in the Rust backend. The frontend communicates exclusively via Tauri `invoke()` calls and events — no direct filesystem, process, or network access from the webview.

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Labonair is licensed under the Apache-2.0 License. See [LICENSE](LICENSE) for details.
