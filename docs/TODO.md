English | [中文文档](TODO_zh.md)

# TODO List

> Last Updated: 2026-07-20

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](../CHANGELOG.md) or [FEATURES.md](./FEATURES.md).

---

## 🟡 Medium Priority (P2)

### Quality Gates

- [ ] **Production TypeScript Typecheck in CI**
  - Add a `typecheck` script that runs `tsc -p tsconfig.json --noEmit`
  - Run it in CI before build/package
  - Keep `tsconfig.test.json` for test compilation, but do not rely on it as the only typecheck gate

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
