English | [中文文档](docs/TODO_zh.md)

# TODO List

> Last Updated: 2026-07-22

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](CHANGELOG.md) or [FEATURES.md](docs/FEATURES.md).

---

## 🟢 Low Priority (P3)

### Test Coverage

- [ ] **Real Coverage Reporting**
  - Add `c8`, `nyc`, or equivalent coverage tooling
  - Generate an lcov report for Codecov
  - Add minimum thresholds for critical service, view-model, and platform parsing modules

- [ ] **Extension Activation Tests**
  - Add tests for command registration from `activate()`
  - Cover initialization failure fallback behavior
  - Verify `deactivate()` clears timers and scheduler resources

- [ ] **Webview Runtime Tests**
  - Add jsdom/happy-dom or equivalent tests for `sidebar-app`
  - Cover state hydration, `postMessage` routing, folder actions, and event dispatch

- [ ] **Auto-Accept CDP Injection Tests**
  - Extract the clicker script into a testable unit

### Performance

- [ ] **Polling Optimization**
  - Pause polling when extension is not visible
  - Reduce network calls

### Dependency Maintenance

- [ ] **Mocha `diff` Advisory**
  - Track the low-severity `mocha@11.7.6` → `diff@7.0.0` development-only advisory
  - Upgrade when Mocha supports a patched `diff` release
  - Avoid an incompatible forced override solely to silence `npm audit`

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

- [ ] **Unify Configuration Schema**
  - Keep `package.json` contributes, defaults, `TfaConfig`, and validation rules aligned
  - Avoid direct configuration reads outside `ConfigManager` unless there is a documented reason

- [ ] **Strongly Type the Webview Protocol**
  - Add a shared `webview-protocol.ts`
  - Use discriminated unions for messages and payloads
  - Avoid separate frontend/backend types with the same name but different semantics

---

## 📋 Documentation

- [ ] **Enhance JSDoc Comments**
  - Add JSDoc for all public APIs
  - Include parameter descriptions and return types
  - Add usage examples
