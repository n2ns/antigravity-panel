English | [中文文档](FEATURES_zh.md)

# Features

> This document lists all implemented features in Antigravity Panel.

---

## 📊 Quota Monitoring

### Real-time Quota Display
- Visual quota display grouped by model families (Gemini, Claude, GPT, etc.)
- Pie charts showing remaining quota percentage per group
- Color-coded warnings when quota runs low (warning/critical thresholds)
- Separate tracking and display for **Gemini 3 Flash**, Pro, and Ultra groups
- **Customizable Gauge Styles**: Refactored the visualization engine to support multiple rendering strategies. Users can choose between:
  - **Semi-Arc**: A modern, 210-degree industrial precision instrument style (Default).
  - **Classic Donut**: The historical full-circle gauge style.
- Automatic refresh with configurable polling interval (minimum 60s)

### Active Group Detection
- Automatically detects which model group is currently in use
- Detection based on quota consumption changes (>0.1% threshold)
- Persists active group state across sessions

### Usage History & Analytics
- Interactive bar charts showing usage over time
- Configurable display range (10-120 minutes)
- 24-hour history tracking with persistent storage
- Color-coded visualization by model family

### Usage Prediction
- 🔥 **Usage Rate**: Real-time consumption speed (%/hour) based on recent activity
- ⏱️ **Runway**: Estimated time until quota exhaustion (~Xh, ~Xd, or >7d)
- Displays "Stable" when no consumption detected

### Prompt Credits Display
- Shows available/monthly prompt credits
- Remaining percentage calculation

---

## 🗂️ Cache Management

### Brain Tasks Management
- Browse AI conversation caches with folder tree view
- Display task metadata: size, file count, creation date
- Preview files: images, markdown, and code files
- One-click deletion with confirmation dialog
- Smart cleanup: keeps newest 5 tasks to prevent interrupting active work

### Code Tracker Management
- Browse code analysis caches per project
- Folder tree view with expand/collapse
- Delete individual files or entire directories
- Automatic tab closing when deleting open files

### Cache Notifications
- Warning notification when cache exceeds threshold (configurable, default 500MB)
- 24-hour cooldown to prevent notification spam
- Independent cache check interval (configurable, default 120s)

### Hide Empty Folders
- Option to hide empty folders in tree views (`tfa.cacheHideEmptyFolders`)

---

## 📱 Status Bar Integration

### Quota Display
- Shows remaining quota percentage for active model group with concise labels (e.g., "Pro", "Flash")
- Detailed tooltip on hover showing all active groups with full labels and reset times
- Multiple display styles: percentage, reset time, used, remaining
- Color-coded status: normal (green), warning (yellow), critical (red)
- Configurable thresholds for warning (default 30%) and critical (default 10%)

### Cache Size Display
- Shows total cache size in status bar
- Toggleable via `tfa.statusBarShowCache` setting

---

## ⚙️ Quick Configuration Access

### One-click Shortcuts
- Edit Global Rules (`~/.gemini/GEMINI.md`)
- Configure MCP settings (`~/.gemini/antigravity/mcp_config.json`)
- Manage Browser Allowlist (`~/.gemini/antigravity/browserAllowlist.txt`)
- Open extension settings

---

## 💬 Community & Feedback

### Feedback Integration
- Report bugs via the built-in Intelligent Feedback System (pre-fills diagnostics)
- Side-by-side buttons in footer for **Report Issue** (GitHub Issues) and **Project Home**
- Full localization support for all UI elements and feedback instructions

## 🏗️ Architecture & Performance

### Cache-First Startup
- UI renders immediately from cached data
- Asynchronous refresh with latest data
- Webview state persistence using `vscode.setState()`/`getState()`

### MVVM Architecture
- `QuotaViewModel` as unified data aggregation layer
- Clean separation of concerns between UI and business logic
- Dependency injection for testability

### Retry Mechanism
- Configurable retry with multiple backoff strategies:
  - Fixed: constant delay between retries
  - Linear: delay increases linearly
  - Exponential: delay doubles each retry
- Customizable retry conditions and callbacks

### HTTP Client
- Automatic HTTPS → HTTP fallback
- Protocol caching for subsequent requests
- Configurable timeout

### Task Scheduler
- Register multiple independent polling tasks
- Dynamic interval updates
- Start/stop individual tasks or all at once

### Process Detection
- Cross-platform Antigravity Language Server detection
- Windows: PowerShell + netstat
- macOS/Linux: pgrep + lsof/ss

---

## 🌐 Internationalization

### Supported Languages (11)
- English
- 简体中文 (Simplified Chinese)
- 繁體中文 (Traditional Chinese)
- 日本語 (Japanese)
- Français (French)
- Deutsch (German)
- Español (Spanish)
- Português (Brasil) (Portuguese)
- Italiano (Italian)
- 한국어 (Korean)
- Русский (Russian)

---

## 🔒 Security

### Content Security Policy
- Strict CSP for Webview security
- External CSS (no `'unsafe-inline'`)
- Nonce-based script loading
- Restricted resource loading (`default-src 'none'`)

---

## 🧪 Testing

### Unit Test Coverage
- 165 tests across 16 test files
- Pure Node.js environment (no VS Code runtime required)
- Core modules fully tested:
  - ConfigManager, CacheManager, QuotaManager
  - QuotaViewModel, QuotaStrategyManager
  - Scheduler, Retry, HttpClient
  - ProcessFinder, PlatformStrategies
  - HtmlBuilder, Format utilities

---

## 🔧 Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `tfa.statusBarShowQuota` | `true` | Show quota in status bar |
| `tfa.statusBarShowCache` | `true` | Show cache size in status bar |
| `tfa.statusBarStyle` | `percentage` | Display style: percentage/resetTime/used/remaining |
| `tfa.statusBarThresholdWarning` | `30` | Warning threshold (%) |
| `tfa.statusBarThresholdCritical` | `10` | Critical threshold (%) |
| `tfa.pollingInterval` | `120` | Quota refresh interval (seconds, min 60) |
| `tfa.quotaDisplayStyle` | `semi-arc` | Gauge style: semi-arc or classic-donut |
| `tfa.visualizationMode` | `groups` | Display mode: groups/models |
| `tfa.showGptQuota` | `false` | Show GPT quota (shares with Claude) |
| `tfa.historyDisplayMinutes` | `60` | Usage chart time range (10-120 min) |
| `tfa.cacheCheckInterval` | `120` | Cache check interval (seconds, min 30) |
| `tfa.cacheWarningThreshold` | `500` | Cache warning threshold (MB) |
| `tfa.cacheHideEmptyFolders` | `false` | Hide empty folders in tree views |
| `tfa.autoCleanCache` | `false` | Auto-clean cache |
| `tfa.debugMode` | `false` | Enable debug logging |

