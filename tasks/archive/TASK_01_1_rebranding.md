# Task 01.1 — Rebranding & Project Configuration
**Phase:** 1 — Rebranding & Foundation
**Status:** completed
**Priority:** Critical (Foundation for the fork)

## Background & Context
We are hard-forking the "Terax" codebase to build "Nexum". Before we add any new architecture, we must purge the old branding, update all bundle identifiers, and adjust Rust crate configurations. This ensures the app compiles, runs, and builds under the name "Nexum" with the bundle ID `com.nexum.app`.

## Work Instructions

### 1. Update Frontend Configuration
- Open `package.json` and change the `"name"` field from `"terax"` to `"nexum"`.
- Open `index.html` and `settings.html` and change the `<title>` tags from "Terax" to "Nexum".

### 2. Update Backend Configuration
- Open `src-tauri/tauri.conf.json`. Change `"productName"` to `"Nexum"` and `"identifier"` to `"com.nexum.app"`. Update the `longDescription` to reflect Nexum's purpose.
- Open `src-tauri/Cargo.toml`. 
  - Change `[package] name` to `"nexum"`.
  - Change `[lib] name` to `"nexum_lib"`.
- Open `src-tauri/src/main.rs`. Change the entry point call from `terax_lib::run()` to `nexum_lib::run()`.

### 3. Update UI Branding References
- In `src/app/App.tsx`, search for hardcoded "Terax" strings (e.g., in the `EmptyState` component inside the AI mini-window or the input placeholder) and change them to "Nexum".
- In `src/settings/sections/AboutSection.tsx`, change `setName("Terax")` to `setName("Nexum")`. Update the `REPO_URL` and `WEBSITE` to placeholders if necessary, and ensure `app.crynta.terax` text is changed to `com.nexum.app`.
- In `src/modules/ai/config.ts`, update `SYSTEM_PROMPT` references from "Terax" to "Nexum" and `KEYRING_SERVICE` to `"nexum-ai"`.

## Files to Modify
- `package.json`
- `index.html`
- `settings.html`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/main.rs`
- `src/app/App.tsx`
- `src/settings/sections/AboutSection.tsx`
- `src/modules/ai/config.ts`

## Expected Outcome
The project successfully compiles and launches with `pnpm tauri dev`. The window title, about section, and AI placeholders all read "Nexum".

## Additional Information
- **Important**: Run `pnpm exec tsc --noEmit` and `cargo check` after these changes to ensure no imports or lib references were broken by the rename.
