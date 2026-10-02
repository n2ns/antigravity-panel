English | [中文文档](docs/TODO_zh.md)

# TODO List

> Last Updated: 2026-10-02

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](CHANGELOG.md) or [FEATURES.md](docs/FEATURES.md).

---

## 🟡 Medium Priority (P2)

### Lifecycle Validation

- [ ] **Antigravity Extension Activation Lifecycle**
  - Verify that commands remain registered when service initialization fails
  - Verify initialization failure feedback and command fallback behavior
  - Verify boot timer and scheduler cleanup in `deactivate()`, and resource disposal through the host's `context.subscriptions`
  - Validate host-dependent behavior in the Antigravity IDE Extension Development Host

### Configuration Correctness

- [ ] **Check Configuration Defaults and Constraints**
  - Compare defaults and constraints declared in `package.json` with runtime configuration reads
  - Confirm whether the `dashboard.refreshRate` manifest default of 90 seconds and `ConfigManager` fallback of 120 seconds are intentionally different
  - Correct unintended differences and extend existing configuration tests where needed

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
