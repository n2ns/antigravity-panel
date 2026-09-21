English | [中文文档](docs/TODO_zh.md)

# TODO List

> Last Updated: 2026-09-21

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

---

## 🔵 Optional Improvements (P4)

- [ ] **Strongly Type Webview Messages**
  - Share the message type between the extension host and Webview
  - Use discriminated unions to associate each message name with its required parameters
  - Keep complete state payloads and partial updates distinct where their semantics differ
