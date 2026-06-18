# Skill: update-docs

Use this skill whenever the user invokes `/update-docs` or asks to check, update, extend, or audit the documentation in the `docs/` folder.

---

## What this skill does

When invoked, perform the following steps **in order** without asking for confirmation:

1. **Audit freshness** — compare recent `git log --since="30 days ago" --name-only` output against the docs categories to identify areas where code changed but docs may be stale.
2. **Check completeness** — scan for features that exist in the codebase but lack docs coverage (see the category map below).
3. **Report findings** — output a concise table: category, status (`up-to-date` / `stale` / `missing`), and a one-line note on what needs work.
4. **Apply updates** — if the user confirms (or if the skill was invoked with `--fix`), edit the relevant `.mdx` files directly.

---

## Docs structure

All docs live in `/home/Snenjih/projekte/Nexum2/docs/` — **118 MDX files across 19 categories**:

| # | Folder | Topic |
|---|--------|-------|
| 01 | `01-getting-started/` | Installation, first launch, interface overview |
| 02 | `02-host-manager/` | Host creation, groups, multi-select, context menu |
| 03 | `03-credential-management/` | Auth methods, keychain, known-hosts, SSH keys |
| 04 | `04-ssh-terminal/` | Connection lifecycle, PTY, tab persistence |
| 05 | `05-local-terminal/` | Local PTY, shell integration, split panes |
| 06 | `06-sftp-file-manager/` | SFTP browser, transfers, conflict resolution |
| 07 | `07-transfer-queue/` | Background transfers, pause/cancel |
| 08 | `08-code-editor/` | CodeMirror 6, remote editing, AI diff |
| 09 | `09-local-file-explorer/` | File tree, actions, terminal sync |
| 10 | `10-ai-assistant/` | BYOK, tools, sessions, security, sub-agents |
| 11 | `11-themes-appearance/` | Theme engine, JSON format, import/export |
| 12 | `12-settings/` | All settings panels |
| 13 | `13-command-palette/` | Commands, context-aware, host quick-connect |
| 14 | `14-keyboard-shortcuts/` | Global, terminal, editor, SFTP shortcuts |
| 15 | `15-tabs-workspace/` | Tab types, split panes, session restore |
| 16 | `16-snippets/` | Creating and using snippets |
| 17 | `17-updates-releases/` | Auto-updater, changelog |
| 18 | `18-troubleshooting/` | SSH fails, crashes, performance, AI issues |
| 19 | `19-contributing/` | Architecture, IPC contract, PR template |

---

## MDX format rules

Every doc file uses this frontmatter — **never omit it**:

```mdx
---
title: "Human-Readable Title"
description: "One sentence describing this page for search/SEO."
---

# Human-Readable Title

Content here...
```

- Headings: `#` = page title (once), `##` = major sections, `###` = sub-sections.
- Code blocks: use fenced ` ``` ` with language tags (`ts`, `rust`, `bash`, `json`).
- No hardcoded version numbers — refer to "current version" or link to the changelog.
- Keep language neutral and user-facing. No internal Rust type names in user docs unless in a contributing page.

---

## Key source files to check for freshness

When auditing, cross-reference these source locations against their docs counterparts:

| Source | Docs category |
|--------|--------------|
| `src/modules/ai/` | `10-ai-assistant/` |
| `src/modules/terminal/` | `04-ssh-terminal/`, `05-local-terminal/` |
| `src/modules/explorer/` | `09-local-file-explorer/` |
| `src/modules/tabs/` | `15-tabs-workspace/` |
| `src-tauri/src/modules/ssh/` | `04-ssh-terminal/`, `03-credential-management/` |
| `src-tauri/src/modules/sftp/` | `06-sftp-file-manager/`, `07-transfer-queue/` |
| `src/modules/theme/` | `11-themes-appearance/` |
| `src/modules/snippets/` | `16-snippets/` |
| `src/modules/command-palette/` | `13-command-palette/` |
| `src/modules/shortcuts/` | `14-keyboard-shortcuts/` |
| `src-tauri/src/lib.rs` | `19-contributing/ipc-contract-reference.mdx` |
| `CHANGELOG.md` | `17-updates-releases/changelog.mdx` |

---

## Audit commands to run

```bash
# Recent code changes (last 30 days)
git log --since="30 days ago" --name-only --pretty=format: | sort -u | grep -v '^$'

# Check if a doc category has been touched recently
git log --since="30 days ago" -- docs/ --name-only --pretty=format: | sort -u
```

---

## What NOT to do

- Do not rewrite docs that are already accurate — prefer targeted edits.
- Do not add implementation details (Rust internals, store shapes) to user-facing docs unless in `19-contributing/`.
- Do not remove existing content without confirming with the user first.
- Do not create new `.mdx` files in a new folder without also updating any existing navigation/index that references the folder structure.
- Always run a `pnpm exec tsc --noEmit` check after touching TypeScript examples in docs to verify snippets compile (only if the project has a doc-validation step).
