# Skill: integrate-notifications

Use this skill whenever the user asks to wire a module, feature, or area of the app into the **Nexum notification system** — so errors, warnings, and success events surface in the `NotificationDropdown` in the header.

---

## System Overview

### Store — `@/modules/notifications/store/useNotificationStore`

```ts
addNotification({
  type: "error" | "warning" | "info" | "success",
  title: string,      // short label, e.g. "SSH Connection Failed"
  message: string,    // full error text (shown in monospace pill)
  source?: string,    // badge label, e.g. "SSH", "SFTP", "Hosts"
})
```

- Max 100 entries; oldest are dropped automatically.
- Spam guard: duplicate `message + type` within 2 s is swallowed.
- `removeNotification(id)` and `clearAll()` are available.

### Helper — `@/lib/errors.ts`

```ts
import { handleApiError } from "@/lib/errors";

// Wraps any caught value (NexumError or unknown) → addNotification({ type: "error", ... })
handleApiError(e, "Descriptive title", "SourceBadge");
```

`handleApiError` already handles `NexumError` (Rust-side structured errors with `{ code, message }`) and plain strings/unknowns. **Always prefer this over calling `addNotification` directly for errors.**

### UI

`NotificationDropdown` lives in the `Header`. It renders automatically whenever `notifications.length > 0`. The bell icon **pulses red** when any notification has `type: "error"`. No additional wiring needed in the UI.

---

## Integration Checklist

When integrating a module/feature/area:

1. **Find all `catch` blocks and `.catch()` calls** in the target area that currently swallow errors (`catch {}`, `catch (e) { console.error(...) }`, etc.).

2. **Replace silent catches with `handleApiError`:**
   ```ts
   // Before
   } catch (e) {
     console.error(e);
   }

   // After
   } catch (e) {
     handleApiError(e, "Human-readable title", "ModuleBadge");
   }
   ```

3. **For non-error events** (success, info, warning) call `addNotification` directly from the store:
   ```ts
   import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";

   // Inside a React component
   const addNotification = useNotificationStore((s) => s.addNotification);
   addNotification({ type: "success", title: "Host saved", message: "Changes persisted.", source: "Hosts" });

   // Outside React (store, lib, async util)
   useNotificationStore.getState().addNotification({ ... });
   ```

4. **Choose the right `source` badge** — use the module name in PascalCase: `"SSH"`, `"SFTP"`, `"Hosts"`, `"Snippets"`, `"AI"`, `"Editor"`, `"System"`, etc.

5. **Do NOT show a toast or alert-dialog for errors that are already handled by `handleApiError`** — the notification panel is the single source of truth for async errors.

6. **Verify TypeScript** after changes: `pnpm exec tsc --noEmit`.

---

## Patterns by Context

### React component
```tsx
import { handleApiError } from "@/lib/errors";

async function save() {
  try {
    await invoke("hosts_update", { host });
  } catch (e) {
    handleApiError(e, "Failed to save host", "Hosts");
  }
}
```

### Zustand store action
```ts
import { handleApiError } from "@/lib/errors";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";

async fetchHosts() {
  try {
    const hosts = await invoke<Host[]>("hosts_get_all");
    set({ hosts });
  } catch (e) {
    handleApiError(e, "Failed to load hosts", "Hosts");
  }
}
```

### Global unhandled rejection (already wired in `App.tsx`)
```ts
// App.tsx already calls:
window.addEventListener("unhandledrejection", (e) =>
  handleApiError(e.reason, "Unhandled Error", "System")
);
```
Do not duplicate this — it covers any `invoke()` call whose promise was not explicitly caught.

---

## Files to Know

| Path | Purpose |
|---|---|
| `src/modules/notifications/store/useNotificationStore.ts` | Zustand store, types `AppNotification`, `NotificationType` |
| `src/modules/notifications/components/NotificationDropdown.tsx` | Bell icon + popover UI in Header |
| `src/lib/errors.ts` | `handleApiError` helper |
| `src/types.ts` | `NexumError`, `isNexumError` |
| `src/app/App.tsx` | Global `unhandledrejection` / `error` listeners |

---

## What NOT to do

- Do not use `alert()`, browser dialogs, or shadcn `toast()` for async operation errors.
- Do not swallow errors silently — every user-visible operation should have error reporting.
- Do not call `addNotification` with raw Rust error strings without sanitizing — use `handleApiError` which applies `isNexumError` first.
- Do not add the notification dropdown to a second place in the UI — it belongs only in `Header`.
