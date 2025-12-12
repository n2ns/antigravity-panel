English | [中文文档](docs/CHANGELOG_zh.md)

# Changelog

## [1.2.0] - 2025-12-12

### Improved
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

