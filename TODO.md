English | [中文文档](docs/TODO_zh.md)

# TODO List

> Last Updated: 2026-07-22

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](CHANGELOG.md) or [FEATURES.md](docs/FEATURES.md).

---

## 🟡 Medium Priority (P2)

### Test Coverage

- [ ] **Extension Activation Lifecycle Tests**
  - Add tests for command registration from `activate()`
  - Cover initialization failure fallback behavior
  - Verify `deactivate()` clears boot timers, schedulers, and automation resources

- [ ] **Webview Runtime Tests**
  - Add jsdom/happy-dom or equivalent tests for `sidebar-app`
  - Cover state hydration, `postMessage` routing, folder actions, and event dispatch

### Configuration Correctness

- [ ] **Unify Configuration Schema**
  - Keep `package.json` contributes, defaults, `TfaConfig`, and validation rules aligned
  - Include currently separate settings such as `dashboard.showUserInfoCard` and commit-message configuration
  - Avoid direct configuration reads outside `ConfigManager` unless there is a documented reason
  - Add a contract test that compares manifest keys/defaults with the runtime schema

---

## 🟢 Low Priority (P3)

### Test Coverage

- [ ] **CI Coverage Guardrails**
  - Add `c8`, `nyc`, or equivalent coverage tooling to the existing unit-test runner
  - Publish a coverage summary in CI without requiring a third-party upload service
  - Add focused minimum thresholds for critical service, view-model, and platform parsing modules

---

## 🔵 Architecture (P4)

### Maintainability

- [ ] **Split AppViewModel Responsibilities**
  - Extract quota projection into a dedicated `QuotaStateProjector`
  - Extract cache tree state into a dedicated cache/tree view model
  - Extract notification policy and automation coordination from `AppViewModel`

- [ ] **Clarify Domain Type Ownership**
  - Move quota/cache domain types out of `shared/utils/types.ts`
  - Keep platform process types under `shared/platform`
  - Keep configuration types under `shared/config`

- [ ] **Strongly Type the Webview Protocol**
  - Add a shared `webview-protocol.ts`
  - Use discriminated unions for messages and payloads
  - Avoid separate frontend/backend types with the same name but different semantics
