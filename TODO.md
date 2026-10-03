# TODO List

> Last Updated: 2026-10-03

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](CHANGELOG.md) or [FEATURES.md](docs/FEATURES.md).

---

## 🟡 Medium Priority (P2)

### Lifecycle Validation

- [ ] **Antigravity Extension Activation Lifecycle**
  - Verify that commands remain registered when service initialization fails
  - Verify initialization failure feedback and command fallback behavior
  - Verify boot timer and scheduler cleanup in `deactivate()`, and resource disposal through the host's `context.subscriptions`
  - Validate host-dependent behavior in the Antigravity IDE Extension Development Host

### Low-Severity Logic Errors (code review 2026-10-03)

- [ ] **`retry()` returns a failed result after the last attempt**
  - `src/shared/utils/retry.ts`: when every attempt returns a non-null value that `shouldRetry` still rejects, the last value is returned instead of `null`, contrary to the JSDoc
  - No current caller uses a custom `shouldRetry`, so nothing is affected today
- [ ] **Weekly usage day labels shift across time zones**
  - `dayStart` is computed in the extension host's time zone and formatted in the Webview's; with Remote-SSH or containers in another zone, every bar label is off by one day (`src/view/webview/components/weekly-usage.ts`)
- [ ] **Tooltips do not flip below the anchor**
  - `src/view/webview/utils/tooltip-manager.ts` always places the tooltip above the element, so it is clipped when the anchor is near the top of the scrolled sidebar
- [ ] **Output panel updates count as editor activity**
  - `onDidChangeTextDocument` in `app.vm.ts` does not filter by URI scheme, so output channel appends reset the idle-drain timer while the Output panel is visible (not yet reproduced)
- [ ] **Initial state JSON is not escaped for `<script>`**
  - `src/view/html-builder.ts` injects `JSON.stringify` output without escaping `</script>` or `<`; no current string contains it, so it cannot be triggered today

### Cache Cleaning

- [ ] **Decide how conversation `.db` files are cleaned**
  - Since Antigravity IDE 2.0 conversations are stored as `conversations/<uuid>.db` (plus `-wal` / `-shm`); task deletion and cache cleaning only handle `<uuid>.pb`, so the `.db` files remain after a task is deleted
  - Decide whether to delete `.db` / `-wal` / `-shm` together with the task and in the orphan rule, and whether deletion requires Antigravity to be closed (open SQLite files, sidebar index in `state.vscdb`)
- [ ] **Decide how `brain/tempmediaStorage` is handled**
  - The IDE's temporary media directory is currently listed as a Brain task and can take a keep slot or be deleted by cleaning
  - Options: only treat UUID-named directories as tasks, or exclude `tempmediaStorage` by name

---

## 🔵 Optional Improvements (P4)

- [ ] **Strongly Type Webview Messages**
  - Share the message type between the extension host and Webview
  - Use discriminated unions to associate each message name with its required parameters
  - Keep complete state payloads and partial updates distinct where their semantics differ
  - Today `WebviewStateUpdate.tasks` / `contexts` are declared as `TreeSectionState` (`collapsed`, `stats`) while the provider sends `{ expanded, folders }`, hidden by a cast in `sidebar-app.ts`; `UsageChartData.displayMinutes` / `interval` are required in the Webview type but optional in the view model
