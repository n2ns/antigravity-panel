English | [中文文档](docs/CHANGELOG_zh.md)

# Changelog

## [2.1.0] - 2025-12-17

### Added
- **Intelligent Feedback System**: Added a localization-aware bug reporting system with automatic diagnostic pre-filling (version, OS, error codes).
- **Advanced Diagnostics**: `ProcessFinder` now identifies specific failure reasons: `no_process`, `ambiguous` (multi-instance), `no_port`, and `auth_failed`.
- **Parsing Error Monitoring**: Added monitoring for server API response anomalies with dedicated feedback triggers.
- **Localization Framework**: Implemented `vscode.l10n` for runtime notifications, ensuring 100% i18n alignment for error messages.
- **Model Quota Granularity**: Separated Gemini 3 Flash and Pro into distinct tracking groups in the status bar and sidebar.
- **Community Integration**: Added a prominent "Join Discussions" button in the sidebar footer to bridge user feedback and GitHub discussions.
- **Quality Guard**: Integrated Husky and lint-staged to enforce code quality with automated ESLint checks and unit tests before every commit.
- **Streamlined Status Bar**: Active group quota is now displayed with concise labels (Pro/Flash) and an enhanced hover tooltip showing all active groups' details.

### Changed
- **UI Realignment**: Fixed redundant naming in sidebar titles; now standardized as `Antigravity: Toolkit`.
- **Architecture Refinement**: Extracted feedback logic into a reusable `FeedbackManager` component, maintaining MVVM cleanliness.
- **Dashboard Sorting**: Quota disks now strictly follow the order defined in `quota_strategy.json`, ensuring Gemini Flash always appears first.

### Fixed
- **UI Sync Deadzone**: Resolved an issue where quota disks would display 0% instead of 100% when the reset timer hit "Ready".
- **ESLint Technical Debt**: Cleaned up all 11+ identified linting errors and warnings for a cleaner codebase.


## [2.0.0] - 2025-12-17

> **The Architecture Update**: A complete recreation of the internal engine based on MVVM architecture, ensuring stability, testability, and future extensibility.

### Improved
### Changed
- **Rebranding**: Renamed extension to **Toolkit for Antigravity** (formerly *Antigravity Panel*) to align with our long-term product vision
- **Architecture Optimization**: Refactored `ConfigManager` and `WebviewHtmlBuilder` for better testability
  - Introduced `IConfigReader` interface for dependency injection
  - Removed direct `vscode` module dependency from core modules
  - Core business logic can now be unit tested in pure Node.js environment
- **Dependency Injection**: `SidebarProvider` now receives dependencies via constructor instead of creating instances internally

### Added
- **New Unit Tests**: Added comprehensive tests for `ConfigManager` and `WebviewHtmlBuilder`
  - `config_manager.test.ts`: 18 new tests
  - `html_builder.test.ts`: 13 new tests
  - Total: 168 tests passing
- **Advanced Configuration**: Added customizable Quota Server Host setting (`gagp.advancedServerHost`) for complex network environments
- **API Path Config**: Added configurable API endpoint path (`gagp.advancedQuotaApiPath`)

## [1.1.0] - 2025-12-11

### Added
- **Independent Cache Polling**: Cache size check now runs independently with configurable interval (`gagp.cacheCheckInterval`)
- **Cache Warning Notifications**: Automatic warning when cache exceeds threshold, with 24-hour cooldown
- **Hide Empty Folders Option**: New setting (`gagp.cacheHideEmptyFolders`) to hide empty folders in Brain and Code Tracker trees

### Improved
- **Smart Cache Cleaning**: Keeps newest 5 brain tasks and their conversations to prevent interrupting active work
- **Clean Cache Dialog**: Added "Open Folder" button for manual cleanup option
- **Delete Confirmation**: Code Tracker directory deletion now shows confirmation dialog

### Fixed
- **Code Tracker Delete Button**: Fixed delete button not working due to Lit property reflection issue
- **Tree Refresh After Delete**: Fixed directory tree not refreshing after file/folder deletion

## [1.0.3] - 2025-12-10

### Added
- **MVVM Architecture**: Introduced QuotaViewModel as unified data aggregation layer
- **Active Group Auto-Detection**: Automatically detects active model group based on quota consumption changes (>0.1% threshold)
- **Cache-First Startup**: UI renders immediately from cache, then refreshes asynchronously

### Fixed
- **Status Bar Active Group**: Fixed incorrect active group display (was showing wrong group due to simple string matching)
- Fixed icon display issues in the extension sidebar and toolbar

## [1.0.2] - 2025-12-10

### Improved
- Reduced extension package size by 85% for faster installation and updates
- Improved extension loading performance

## [1.0.1] - 2025-12-10

### Fixed
- Fixed quota prediction display disappearing after loading
- Fixed quota chart rendering issues on startup

### Improved
- Enhanced code quality and stability

## [1.0.0] - 2025-12-09

### Added
- Initial release
- Real-time Gemini API quota monitoring with visual charts
- Cache management for Gemini conversations
- Quick access to Gemini configuration files
- Multi-language support (English, Chinese, Japanese, Korean, and more)
- Automatic quota refresh with configurable intervals
- Status bar integration showing current quota usage

