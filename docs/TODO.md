# TODO List

> Last Updated: 2025-12-10
> Project Version: v0.2.1

---

## 🔴 High Priority (P0)

### Test Coverage Improvement

- [ ] **Add unit tests for remaining modules** (Current: 113 tests, ~50% coverage, Target: 80%)
  - [ ] `HttpClient` - HTTPS→HTTP fallback, protocol cache
  - [ ] `StatusBarManager` - Status bar updates
  - [ ] Webview Components - Lit component unit tests (using @web/test-runner)
  - [ ] `SidebarProvider` - Webview message handling (integration tests)

### Release Preparation

- [ ] **Publish to VS Code Marketplace**
  - [x] Configure GitHub Actions auto-publish workflow ✅
  - [x] Support publishing to VS Code Marketplace ✅
  - [x] Support publishing to Open VSX Registry ✅
  - [x] Auto-create GitHub Release ✅
  - [ ] Configure GitHub Secrets (VSCE_PAT, OVSX_PAT)
  - [x] Enhance README with feature screenshots and usage guide ✅
  - [ ] Prepare Marketplace display images (at least 3)
  - [ ] Create first release tag (v0.2.1)

---

## 🟡 Medium Priority (P1)

### New Features

- [ ] **Quota Warning Notifications**
  - Show VS Code notification when quota drops below `gagp.quotaWarningThreshold`
  - Support different severity levels (warning/critical)
  - Configurable notification enable/disable

- [ ] **Time-based Cache Filtering**
  - Add "Delete tasks older than X days" option
  - UI: Date picker in sidebar toolbar
  - Backend: Filter by `createdAt` timestamp

### Code Quality

- [ ] **Add ESLint Rule Checking**
  - Run `npm run lint` to check code standards
  - Fix all ESLint warnings and errors
  - Configure pre-commit hook for automatic checking

---

## 🟢 Low Priority (P2)

### Features (Future Versions)

- [ ] **Auto-cleanup** (from plan.md v0.3.0)
  - Automatically delete tasks older than N days
  - Configurable retention policy
  - Dry-run mode

- [ ] **Advanced Quota Analytics** (from plan.md v0.3.0)
  - Burn rate calculation (quota/hour)
  - Estimated time to exhaustion (ETE)
  - Usage pattern analysis
  - Weekly/monthly reports

### UI/UX Improvements

- [ ] **Webview State Persistence**
  - Use `vscode.setState()` to save UI state
  - Restore expanded/collapsed sections on reload
  - Remember last active tab

- [ ] **Dark/Light Theme Support**
  - Ensure all custom colors respect VS Code theme
  - Test with popular themes (One Dark, Solarized, etc.)

- [ ] **Accessibility (a11y)**
  - Add ARIA labels to interactive elements
  - Keyboard navigation support
  - Screen reader compatibility

### Performance

- [ ] **Lazy Loading for Large Tasks**
  - Load task files on-demand (not all at once)
  - Virtual scrolling for large file lists
  - Pagination for history chart

- [ ] **Optimize Polling**
  - Use exponential backoff when server is unavailable
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

## 🐛 Known Issues

- [ ] **Webview CSP Warnings**
  - Investigate Content Security Policy warnings in console
  - Ensure all resources are properly configured with nonce

---

## 🔧 Technical Debt

- [ ] **Improve Error Handling**
  - Add user-friendly error messages for network failures
  - Log detailed errors in Output Channel
  - Avoid exposing technical details in UI

---


