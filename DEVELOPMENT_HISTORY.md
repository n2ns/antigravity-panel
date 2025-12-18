# Development History

This file contains detailed technical changes for developers. For user-facing changes, see CHANGELOG.md.

## [2.0.0] - 2025-12-17

### Added
- **MVVM Architecture**: Complete refactoring of the codebase into strict Model, View-Model, View, Shared, and Config layers.
  - **Services**: Introduced `QuotaService`, `CacheService`, `StorageService` for robust data handling.
  - **ViewModel**: `AppViewModel` now serves as the single source of truth for all UI state.
- **New Model Support**: Added support for **Gemini 3 Flash** (Internal ID: `MODEL_PLACEHOLDER_M18`), automatically detected via `QuotaService`.
- **Debug Tools**: Added `src/scripts/debug_server.ts` for inspecting local Language Server API responses.

### Changed
- **Testing**: Complete overhaul of the test suite (`src/test/suite`), achieving 152 passing unit tests in a pure Node.js environment.
- **Configuration**: moved `quota_strategy.json` to `src/shared/config/` and updated all import paths.
- **Shared Utilities**: Centralized common utilities (formatting, networking, logging, retry) in `src/shared`.

## [1.1.0] - 2025-12-10

### Added
- **QuotaViewModel**: New unified data aggregation layer implementing MVVM architecture (`src/core/quota_view_model.ts`)
- **Active Group Detection**: Algorithm to auto-detect active model group based on quota consumption changes (>0.1% threshold)
- **Cache-First Startup**: All UI components render from cache immediately, then async refresh
- **ViewModel Unit Tests**: 12 new test cases for QuotaViewModel (`src/test/suite/quota_view_model.test.ts`)
- **Server Integration Tests**: 13 test cases for real server testing (`src/test/suite/integration/server.test.ts`)

### Fixed
- **Status Bar Active Group**: Fixed incorrect active group display - was using simple `label.includes("gemini")` instead of proper `QuotaStrategyManager.getGroupForModel()`
- **Icon Display**: Fixed codicons not displaying in packaged extension by adding exceptions in `.vscodeignore` to include required font files (`codicon.css` and `codicon.ttf`).
- **Marketplace Publishing**: Resolved icon rendering issues in file tree and toolbar buttons when extension is installed from VSIX or Marketplace.

### Changed
- **StatusBar**: Added `updateFromViewModel()` method, removed deprecated `getCategoryStats()`
- **SidebarProvider**: Added `updateFromViewModel()` method for cache-first rendering
- **QuotaHistory**: Added `getLastViewState()`/`setLastViewState()` for ViewModel caching
- **Extension**: Refactored data flow to use ViewModel as single source of truth
- **Package Configuration**: Updated `.vscodeignore` to properly include `@vscode/codicons` font files while excluding all other `node_modules`.

## [1.0.2] - 2025-12-10

### Changed
- **Package Optimization**: Dramatically reduced extension package size from 2.58 MB to 378 KB (85% reduction) by properly configuring `.vscodeignore` to exclude unnecessary files.
- **Performance**: Improved extension loading speed by excluding `node_modules`, `out/`, and source files from the published package. All dependencies are now bundled into `dist/` files.
- **File Count**: Reduced packaged files from 1,636 to just 22 essential files (98.7% reduction).

### Internal
- **Build Configuration**: Enhanced `.vscodeignore` to follow VS Code official best practices for bundled extensions.
- **Documentation**: Removed Chinese documentation files (README_zh.md, CHANGELOG_zh.md) from published package to reduce size.

## [1.0.1] - 2025-12-10

### Fixed
- **Prediction UI**: Fixed a race condition where the "Runway" prediction text would disappear from the usage chart shortly after loading or during updates.
- **Quota Display**: Resolved an issue where the quota pie chart might not render on startup due to incomplete data processing in the refresh cycle.

### Refactor
- **Type Safety**: Eliminated `any` types in `sidebar_provider.ts` and `status_bar.ts` by introducing strict interfaces (`ModelDefinition`, `ModelQuotaInfo`).
- **Clean Code**: Fixed various linting warnings and removed unused imports in `extension.ts`.

### Internal
- **Quota Logic**: Refactored `refreshData` and `onUpdate` to use a unified `processQuotaUpdate` function, eliminating code duplication and ensuring consistent UI state updates.
- **Stability**: Improved asynchronous handling in data refresh to prevent UI updates from being overwritten by stale or incomplete data.

## [1.0.0] - 2025-12-09

### Changed
- **Release**: First stable release with all English comments and MIT license.
- **Code Quality**: All code comments have been updated to English for better international collaboration.

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
