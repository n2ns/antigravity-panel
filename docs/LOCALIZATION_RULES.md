# Localization and Internationalization (i18n/l10n) Rules

This document outlines the specific localization strategy for the Antigravity IDE Toolkit to ensure professional technical consistency across all supported languages.

## Summary of Rules

As of version 2.4.1, the following rules apply to all 13 supported languages:

### 1. Technical Terms and UI Labels (English ONLY)
All primary UI labels, technical terms, and command titles on the panel must remain in **English**. Do not translate these strings even if a localized version exists in the source files.

**Target strings include (but are not limited to):**
- **Core Features**: `Rules`, `MCP`, `Allowlist`, `Brain`, `Code Tracker`, `Auto-Accept`.
- **System Actions**: `Restart Service`, `Reset Status`, `Reload Window`, `Restart Agent Service`, `Run Diagnostics`.
- **Navigation/UI**: `Feedback`, `Star`, `User Profile`, `Tier`, `Plan`, `Prompt`, `Flow`, `Used`, `Usage History`, `Settings`, `View`.
- **States**: `Auto-Accept: ON`, `Auto-Accept: OFF`.

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
