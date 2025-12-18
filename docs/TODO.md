English | [中文文档](TODO_zh.md)

# TODO List

> Last Updated: 2025-12-17

> ⚠️ **Note**: This document should only contain pending tasks. Completed tasks should be removed and documented in [CHANGELOG.md](../CHANGELOG.md) or [FEATURES.md](./FEATURES.md).

---

## 🔴 High Priority (P0)

### Test Coverage Improvement

- [ ] **Add remaining unit tests** (Target: 80%, Current: 152 tests)
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

- [ ] **Configure pre-commit hook** for automatic ESLint checking

---

## 🟢 Low Priority (P2)

### Features (Future Versions)

- [ ] **Auto-cleanup**
  - Automatically delete tasks older than N days
  - Configurable retention policy
  - Dry-run mode

- [ ] **Advanced Quota Analytics**
  - Burn rate calculation (quota/hour)
  - Estimated time to exhaustion (ETE)
  - Usage pattern analysis

### UI/UX Improvements

- [ ] **Dark/Light Theme Support**
  - Ensure all custom colors respect VS Code theme
  - Test with popular themes (One Dark, Solarized, etc.)

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

- [ ] **Improve Error Handling**
  - Add user-friendly error messages for network failures
  - Log detailed errors in Output Channel
  - Avoid exposing technical details in UI

- [ ] **Webview i18n Support**
  - Webview components have hardcoded English strings
  - Affected: Usage History, Timeline, Stable, Brain, Code Tracker, Loading...
  - Need to pass translations from extension to webview

---
