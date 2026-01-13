English | [中文文档](docs/CHANGELOG_zh.md)

# Change Log

## [2.5.6] - 2026-01-12

### Fixed

- **Windows PowerShell Quote Escaping**: Fixed `cmd.exe` stripping double quotes when spawning PowerShell by using single-quote concatenation (`'name=''' + $n + ''''`) instead of interpolated strings. Resolves "ParserError" on Windows systems.
- **Windows Workspace ID Normalization**: Fixed workspace ID mismatch between extension and Language Server by URL-encoding path segments and converting ALL special characters (including `.`, `-`, spaces) to underscores. Paths like `israel.toledo` and `Local Projects` now correctly match server format (`israel_toledo`, `Local_20Projects`).
- **UI Contrast**: Fixed "Local service not detected" message readability in light themes by ensuring link colors inherit from button text color.
- **Process Detection Timeout**: Increased PowerShell command timeouts (3s→8s execute, 5s→10s warmup) to accommodate cold start + WMI query latency on Windows.
- Special thanks to @iskisraell for the contribution (PR #47).

## [2.5.5] - 2026-01-12

### Fixed

- **Light Theme Support**: Fixed sidebar panel CSS issues where text was invisible or had poor contrast in VS Code light themes. Replaced hardcoded colors with native VS Code theme variables (`--vscode-button-*`, `--vscode-button-secondary*`).
- **Code Cleanup**: Removed unused `.discussions-btn` CSS class (~36 lines of dead code).

## [2.5.4] - 2026-01-12

### Fixed

- **Windows Process Detection**: Fixed PowerShell quote escaping issue (Issue #46) by implementing a robust hybrid strategy (Interpolated Strings + Format Operator fallback) to solve "ParserError" on certain Windows environments.

## [2.5.3] - 2026-01-12

### Fixed

- **Windows Process Detection**: Added `wmic` as a robust fallback for environments where PowerShell CIM is restricted or failing. Improved parser security with strict `--app_data_dir` verification.
- **Workspace ID Mismatch**: Fixed "Wrong workspace detected" errors by correctly preserving dots (`.`) and hyphens (`-`) during path normalization on Windows. Added loose matching logic for better resilience.
- **Documentation**: Updated `normalizeWindowsPath` documentation and added regression tests to ensure long-term stability for complex paths.

## [2.5.2] - 2026-01-11

### Improved

- **Connection Diagnostics**: Enhanced the "Local service not detected" experience with actionable error messages (e.g., "Wrong workspace", "Auth failed") and a new `Run Diagnostics` tool.
- **Troubleshooting**: Added `tfa.showLogs` command to quickly access the extension's output channel.

### Fixed

- **Process Detection**: Fixed workspace ID matching logic to correctly handle case-sensitivity, URL encoding, and UNC paths, solving "Wrong workspace detected" errors.
- **NLS Missing Keys**: Fixed missing translations for new commands across all supported languages.
- Special thanks to @simbaTmotsi for the contribution (PR #44).

## [2.5.1] - 2026-01-11

### Added

- **UI Scaling**: Introduced `tfa.dashboard.uiScale` setting allowing users to adjust the panel's scale factor from `0.8` to `2.0`.
- **Proportional Scaling**: Re-engineered gauges (circular and semi-arc) using `rem` units to ensure they scale proportionally with the global UI font size.
- **Automated Quality Guard**:
  - Added NLS alignment tests to ensure perfect 1:1 mapping across all 13 supported languages.
  - Added automated placeholder verification between `package.json` and NLS bundles.
  - Added unit tests for UI Scale clamping and data distribution logic.

### Improved

- **Localization Audit**: Conducted a full audit of all 13 language packs, synchronizing `package.nls.json` and `bundle.l10n.json` to ensure 100% completion.
- **Service Recovery UI**: Updated documentation and refined the Restart, Reset, and Reload tools for better stability.
- **Service Stability**: Integrated UI configuration management into the ViewModel for consistent state distribution.

### Changed

- **Code Cleanup**: Removed ~320 lines of unused legacy CSS styles and modularized `webview.css` into separate component files (`gauge.css`, `chart.css`, etc.) for better maintainability.

## [2.5.0] - 2026-01-11

### Added

- **AI Commit Message Generator**: Added a flexible Commit Message Generator supporting both **Local LLM (Ollama)** and **Anthropic Claude**.
  - **Dual Mode**: Works out-of-the-box with local Ollama (privacy-first) or connects to Claude API for cloud-based generation.
  - **Workaround**: Serves as a robust alternative when the IDE's built-in generator is unavailable.
  - **Features**: Supports conventional commits, custom prompts, and intelligent diff truncation.
  - Special thanks to @simbaTmotsi for the contribution (PR #42).

### Improved

- **Process Detection**: Enhanced service detection logic (v2.4.7) is fully integrated.
- **UI Contrast**: Improved text visibility in the panel by standardizing foreground colors.

## [2.4.7] - 2026-01-10

### Fixed

- **Windows Workspace ID Mismatch**: Fixed Language Server detection failing on Windows due to path normalization differences. Extension now correctly encodes drive letter colon as `_3A_` and preserves directory case to match Language Server format.
- **Error Reporting Clarity**: Added `workspace_mismatch` failure reason for clearer diagnostics when all candidates are rejected due to Workspace ID mismatch.

### Changed

- **Module Refactoring**: Extracted Workspace ID normalization logic to `shared/utils/workspace_id.ts` for better maintainability and testability.

## [2.4.6] - 2026-01-08

### Fixed

- **macOS Port Detection**: Improved `lsof` command with `-a` flag and grep PID filter to ensure only target process ports are captured.
- **PowerShell Cold Start**: Added warm-up handling for first timeout on Windows - now waits 3 seconds and retries without consuming retry count.
- **Linux Port Detection**: Added dynamic command detection (lsof > ss > netstat) to avoid errors when specific commands are unavailable.

### Added

- **External Boot Retry**: Added 3 additional retries at extension level with 5-second intervals, providing extra resilience on top of ProcessFinder's internal retries.
- **Diagnostic Output**: When detection fails, now outputs related processes and platform-specific troubleshooting tips to help users debug connectivity issues.

## [2.4.4] - 2026-01-05

### Fixed

- **WSL Multi-Profile Support**: Fixed an issue where inaccurate quota data was displayed in WSL environments when using multiple VS Code profiles.

### Added

- **Enhanced Diagnostics**: Improved connection troubleshooting by outputting retry attempts and detailed failure reasons (auth, network, process) to the "Toolkit for Antigravity" Output Channel.

## [2.4.3] - 2026-01-05

### Fixed

- **Critical**: Fixed `no_port` / 404 error by updating health check endpoint to `GetUserStatus`.
- **WSL Connectivity**: Fixed NAT mode issues by probing Windows Host IP.
- **Network**: Fixed global proxy instability by forcing direct connection (`agent: false`).
- **Startup Stability**: Added 3s initial warm-up delay and increased retry attempts to 5 (total wait ~20.5s) to solve timeout issues on slower Windows environments.
- **Process Detection**: Added robust keyword-based detection (`csrf_token`) fallback.

### Added

- Automated build synchronization to Windows artifact directory.

## [2.4.2] - 2026-01-01

### Fixed

- **macOS Port Detection (Issue #21)**: Fixed `parseListeningPorts` incorrectly including ports from other processes. Now filters `lsof` output by PID to ensure only the target Language Server's ports are detected.

### Added

- **Enhanced Diagnostics**: Auto-reported issues now include additional debugging information:
  - Token Preview (first 8 characters of CSRF token)
  - Port Sources (command line vs netstat)
  - Protocol Used (HTTPS or HTTP fallback)
  - Retry Count

## [2.4.1] - 2025-12-27

### Added

- **Auto-Accept Interval Configuration**: Added `tfa.system.autoAcceptInterval` setting to customize the polling frequency of the Auto-Accept feature (default: 800ms).
- **Full Localization Support**: Added professional translations for all 13 supported languages for the Auto-Accept feature, commands, and tooltips.
- **UI Label Strategy**: Standardized all panel labels and command titles to remain in English for technical consistency, while localized tooltips now provide detailed descriptions.

## [2.4.0] - 2025-12-27

### Changed

- **Tooltip System Refactor**: Completely rewritten tooltip system using a global manager. Tooltips now use `position: fixed` relative to the viewport, ensuring full-width display without clipping or overflow issues in narrow sidebars.
- **Footer UI Update**: Updated "Feedback" and "Star" buttons in the sidebar footer to use VS Code's native secondary button styling for a more consistent and professional look.

### Fixed

- **Tooltip Positioning**: Resolved issues where tooltips would be cut off by the panel boundaries or overlap incorrectly with other elements.

## [2.3.0] - 2025-12-25

### Added

- **User Info Extraction**: Now extracts user subscription information from Antigravity API (tier, plan name, upgrade options).
- **Token Usage Tracking**: Added support for tracking Prompt Credits and Flow Credits usage with formatted display.
- **TokenUsageViewState**: New view state for displaying token/credit consumption in the panel.
- **User Info Card Toggle**: New setting `tfa.dashboard.showUserInfoCard` to show/hide the user profile card and credits bar.
- **Tokens Section**: Added a dedicated "Tokens" section header in the sidebar for Prompt/Flow credits.
- **Full i18n Coverage**: Completed internationalization for Turkish (`tr`) and Polish (`pl`) language packs.

### Changed

- **Status Bar Emoji Indicators**: Replaced background color warnings with emoji indicators (🟢🟡🔴) for a cleaner appearance.
- **Removed Dashboard Icon**: Removed the `$(dashboard)` icon from status bar text since emoji indicators now provide visual feedback.
- **Markdown Tooltip**: Status bar tooltip now uses MarkdownString with table formatting for perfect column alignment.
- **Cache Icon Updated**: Changed cache icon from 💾 to 💿 (optical disk) for better visual representation.
- **Default Polling Interval**: Changed default quota refresh interval from 120s to 90s for better responsiveness.
- **Toolbar Button Tooltip Removal**: Removed tooltips from Rules, MCP, and Allowlist buttons (common knowledge for developers).

### Improved

- **PromptCreditsInfo Enhanced**: Added `usedPercentage` field for more comprehensive credit tracking.
- **FlowCreditsInfo**: New interface for tracking Flow Credits (used in complex AI operations).
- **Toolbar Button Layout**: Fixed button text squeezing in narrow sidebar by using flexible basis with `white-space: nowrap`.
- **Usage Chart Legend**: Improved adaptive wrapping for Timeline/Step and prediction info groups.
- **Credits Bar Spacing**: Added 16px top margin to separate Tokens section from Usage History chart.
- **Section Header Theming**: Applied VS Code's secondary button theme colors to Brain and Code Tracker titles.
- **Tooltip Overflow Fix**: Implemented smart right-edge alignment for tooltips to prevent sidebar boundary clipping.

## [2.2.2] - 2025-12-20

### Changed

- **Cache Settings Reorganization**: Moved cache-related settings (`autoClean`, `autoCleanKeepCount`, `scanInterval`, `warningSize`, `hideEmptyFolders`) from "System & Maintenance" to a dedicated "TFA: Cache" configuration group for better discoverability.
- **Configuration Namespace Update**: Renamed cache settings from `tfa.system.*` to `tfa.cache.*` namespace for clearer semantics.
- **Auto-Clean Notification**: Improved notification message to show before/after cache sizes (e.g., "Auto-clean completed. Before: 512 MB, After: 245 MB.").
- **Cache Warning Buttons**: Replaced "Clean Now Settings" button with "View" (opens brain directory) and "Settings" (opens extension settings) for clearer user actions.
- **Warning Cooldown**: Reduced cache warning notification cooldown from 24 hours to 1 hour for more timely alerts.

### Fixed

- **Duplicate Notification Bug**: Fixed an issue where both auto-clean and manual warning notifications could appear in the same scan cycle.
- **L10n Completeness**: Updated all 10 language translation files with new strings for cache notifications.

## [2.2.1] - 2025-12-18

### Changed

- **Configuration Adjustment**: Global update from `gagp` to `tfa` (Toolkit for Antigravity) and reorganized all settings into logical groups (Dashboard, Status Bar, System).
- **Gauge Spacing**: Refined visual spacing between individual gauges and labels for a more compact and balanced layout.

### Added

- **Service Recovery UI**: Added dedicated "Restart Service" and "Reset Status" buttons in the sidebar for quick troubleshooting of Agent unresponsiveness and quota sync issues.
- **Connectivity Diagnostics**: Introduced `tfa.runDiagnostics` command to manually verify server status. Detailed logs (attempts, ports, PIDs) are now redirected to the primary "Toolkit for Antigravity" output channel for easier analysis without losing context.

### Fixed

- **Status Bar Display**: Fixed `resetTime` not updating and `used`/`remaining` formats always showing as percentage. They now correctly display time (e.g., "2h 30m") and fractional values (e.g., "25/100") [Fixes #9].
- **Localization Loading**: Fixed an issue where localized strings (`report.*`) were missing in automated bug reports due to a packaging error in v2.2.0 [Fixes #5, #8].
- **Test Coverage**: Added automated tests to ensure localization integrity and status bar format correctness.

## [2.2.0] - 2025-12-18

### Added

- **Modular Gauge Architecture**: Refactored the quota visualization system into a strategy-based modular architecture, allowing for multiple display styles.
- **Precision Semi-Arc Gauge**: Implemented a new 210-degree "Industrial Precision" instrument style with multi-track layout and theme-adaptive coloring (set as default).
- **Visual Customization**: Added `tfa.quotaDisplayStyle` setting enabling users to choose between the new Semi-Arc and the Classic Donut styles.
- **Responsive Footer**: Optimized the sidebar footer for narrow panel widths with automatic button wrapping and layout adjustments.

### Improved

- **Type Safety**: Eliminated `any` usage in core webview components for better reliability.
- **Math Precision**: Extracted SVG geometry calculations to a shared utility with dedicated unit tests.

### Fixed

- **Sidebar Layout Overflow**: Resolved an issue where footer buttons would be cut off in extremely narrow sidebar states.

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

- **Rebranding**: Renamed extension to **Toolkit for Antigravity** (formerly _Antigravity Panel_) to align with our long-term product vision
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
