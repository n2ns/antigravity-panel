# Change Log

All notable changes to the "Antigravity Panel" extension will be documented in this file.

## [0.2.1] - 2025-12-09

### Added
- **Quota Usage History**: Added a new chart in the sidebar showing quota usage trends over the last 24 hours.
- **Quota Strategy System**: New configuration-driven model grouping via `quota_strategy.json`, allowing flexible categorization of AI models (e.g., Gemini vs Other).
- **Multi-language Support**: Added full localization for configuration UI in 11 languages (En, Zh, Ja, Fr, De, Es, Pt, It, Ko, Ru).
- **Unit Testing Suite**: Added comprehensive unit tests (113 tests) covering core logic, utilizing a mock-based architecture for fast execution.
- **Global Rules Shortcut**: Added a quick access button [📏 Rules] to open `~/.gemini/GEMINI.md`.
- **Config**: Added `gagp.historyDisplayMinutes` to control the time range of the history chart.
- **Architecture**: Introduced `QuotaHistoryManager` for persistent history tracking.
- **Network**: Implemented robust HTTP client with automatic HTTPS-to-HTTP fallback.

### Changed
- **UI**: Improved sidebar layout to accommodate the new history chart and support dynamic model grouping.
- **Performance**: Optimized startup performance by using cached data for immediate rendering.
- **Status Bar**: Warning colors now respect `gagp.quotaWarningThreshold` and `gagp.quotaCriticalThreshold` configurations.
- **Identity**: Updated publisher and repository URLs to `n2ns` / `n2n-studio`.

## [0.2.0] - 2025-12-08

### Added
- **UI**: Added Webview-based sidebar panel replacing the simple QuickPick menu.
- **Visualization**: Added dual pie charts for Gemini and Other model quotas.
- **Brain Management**: Added Brain Task tree view with file exploring and deletion capabilities.
- **Cache**: Added Code Context Cache (`code_tracker`) management.
- **Shortcuts**: Added quick access buttons for MCP config and Browser Allowlist.
- **Icons**: Migrated to VS Code Codicons for a native look and feel.
- **Async**: Refactored file operations to be non-blocking with loading spinners.

### Fixed
- Resolved duplicate polling intervals by implementing a unified `Scheduler`.
- Fixed "Restart to update" issue by implementing state persistence.

## [0.1.0] - 2025-12-08

- Initial release (MVP).
- Basic quota monitoring in Status Bar.
- Cache size calculation and cleaning command.
- Process detection for Antigravity IDE.
