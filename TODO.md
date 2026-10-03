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

- [ ] **Weekly usage day labels shift across time zones**
  - `dayStart` is computed in the extension host's time zone and formatted in the Webview's; with Remote-SSH or containers in another zone, every bar label is off by one day (`src/view/webview/components/weekly-usage.ts`)
- [ ] **Tooltips do not flip below the anchor**
  - `src/view/webview/utils/tooltip-manager.ts` always places the tooltip above the element, so it is clipped when the anchor is near the top of the scrolled sidebar
- [ ] **Output panel updates count as editor activity**
  - `onDidChangeTextDocument` in `app.vm.ts` does not filter by URI scheme, so output channel appends reset the idle-drain timer while the Output panel is visible (not yet reproduced)

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
