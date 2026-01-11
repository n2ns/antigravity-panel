English | [中文文档](TODO_zh.md)

# TODO List

> Last Updated: 2026-01-11

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](../CHANGELOG.md) or [FEATURES.md](./FEATURES.md).

---

## 🔴 High Priority (P0)

### Test Coverage Improvement

- [ ] **Maintain high unit test coverage** (Target: 80%, Current: 243 tests)
  - [ ] `HttpClient` - HTTPS→HTTP fallback, protocol cache
  - [ ] `StatusBarManager` - Status bar updates (requires VS Code integration tests)
  - [ ] `SidebarProvider` - Webview message handling (requires VS Code integration tests)
  - [ ] Webview Components - Lit component unit tests (using @web/test-runner)

---

## 🟡 Medium Priority (P1)

### New Features

- [ ] **Quota Warning Notifications**
  - Show VS Code notification when quota drops below threshold
  - Support different severity levels (warning/critical)
  - Configurable notification enable/disable

- [ ] **Time-based Cache Filtering**
  - Add "Delete tasks older than X days" option
  - UI: Date picker in sidebar toolbar
  - Backend: Filter by `createdAt` timestamp

### Code Quality

- [x] **Configure pre-commit hook** for automatic ESLint checking (Completed in v2.1.0)

---

## 🟢 Low Priority (P2)

### Features (Future Versions)

- [ ] **Auto-cleanup**
  - Automatically delete tasks older than N days
  - Configurable retention policy
  - Dry-run mode

- [x] **Advanced Quota Analytics** (Completed in v2.1.0)
  - Burn rate calculation (quota/hour)
  - Estimated time to exhaustion (ETE)
  - Usage pattern analysis

### UI/UX Improvements

- [x] **Dark/Light Theme Support** (Completed in v2.0.0/v2.2.0)
  - Native VS Code theme colors and transitions implemented

### Performance

- [ ] **Lazy Loading for Large Tasks**
  - Load task files on-demand (not all at once)
  - Virtual scrolling for large file lists
  - Pagination for history chart

- [ ] **Polling Optimization**
  - Pause polling when extension is not visible
  - Reduce network calls

---

## 📋 Documentation

- [ ] **Add Contributing Guide (CONTRIBUTING.md)**
  - Development environment setup instructions
  - Code style guidelines
  - Testing requirements
  - PR submission process

- [ ] **Enhance JSDoc Comments**
  - Add JSDoc for all public APIs
  - Include parameter descriptions and return types
  - Add usage examples

---

## 🔧 Technical Debt

- [x] **Improve Error Handling** (Phase 1 completed in v2.5.0)
  - Standards-compliant error handling using `NodeJS.ErrnoException`
  - Reduced boilerplate and improved type safety in async operations
  - Log detailed errors in Output Channel (Implemented for Commit Generator)

- [x] **Webview i18n Support** (Completed in v2.1.0)
  - Implemented dynamic translation passing to webview components.

---
