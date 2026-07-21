# Localization and Internationalization (i18n/l10n) Rules

This document outlines the specific localization strategy for Antigravity Panel to ensure professional technical consistency across all supported languages.

## Summary of Rules

As of version 2.6.3, the following rules apply to all 15 supported languages:

### 1. Technical Terms and UI Labels (English ONLY)
All primary UI labels, technical terms, and command titles on the panel must remain in **English**. Do not translate these strings even if a localized version exists in the source files.

**Active target strings include (but are not limited to):**
- **Core Features**: `Rules`, `MCP`, `Allowlist`, `Brain`, `Code Tracker`, `Auto-Accept`.
- **Panel Actions**: `Restart`, `Reset`, `Reload`.
- **Command Titles**: `Restart Agent Service`, `Reset Status`, `Connectivity Diagnostics`, `Show Logs`.
- **Navigation/UI**: `Docs`, `Feedback`, `Star`, `Prompt`, `Flow`, `Usage History`, `Settings`, `View`.

Dynamic account values such as the subscription tier are service data, not localizable UI labels. Removed or unimplemented labels must not be kept in localization bundles solely as placeholders for possible future UI.

### 2. Tooltips, Descriptions, and Explanations (LOCALIZED)
All strings that provide context, help, or descriptions for the UI elements must be fully translated into the user's native language.

**Target strings include:**
- Hover tooltips for buttons and commands.
- Settings descriptions in `package.json` (via `package.nls.*.json`).
- Information/Warning/Error notification messages.
- Detailed status messages (e.g., descriptions of why a connection failed).

### 3. Change Management
When adding new UI elements:
1. Add the technical label in English to `bundle.l10n.json`.
2. Add a corresponding `*Tooltip` or `*Description` key for localization.
3. Ensure the English label is mirrored exactly in all `bundle.l10n.*.json` files.

---
*Note: This strategy ensures that power users can quickly identify technical terms used in documentation and community discussions while still receiving helpful local-language explanations for every feature.*
