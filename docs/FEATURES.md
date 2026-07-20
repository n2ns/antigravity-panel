English | [中文文档](FEATURES_zh.md)

# Features

> This document lists all implemented features in Antigravity Panel.

---

## 📊 Quota Monitoring

### Real-time Quota Display
- Visual quota display grouped by provider-defined quota pools (Gemini, Claude, etc.)
- Pie charts showing remaining quota percentage per pool
- Color-coded warnings when quota runs low (warning/critical thresholds)
- Configuration-driven pool membership keeps shared quotas accurate and allows future provider splits without changing the statistics pipeline
- Model view preserves separate **Gemini Flash** and **Gemini Pro** identities and colors even while they share one pool
- **Customizable Gauge Styles**: Refactored the visualization engine to support multiple rendering strategies. Users can choose between:
  - **Semi-Arc**: A modern, 210-degree industrial precision instrument style (Default).
  - **Classic Donut**: The historical full-circle gauge style.
- Automatic refresh with configurable polling interval (default 90s, minimum 30s)

### Active Pool Detection
- Automatically detects which quota pool is currently in use
- Detection based on quota consumption changes (>0.1% threshold)
- Persists active group state across sessions

### Usage History & Analytics
- Interactive bar charts showing reported quota changes over time; hidden until the first positive change is recorded
- Configurable display range (10-120 minutes)
- 24-hour history tracking with persistent storage
- Color-coded visualization by quota pool

### Usage Prediction
- 🔥 **Usage Rate**: Average consumption speed in percentage points per hour (pp/h) based on recent activity
- ⏱️ **Runway**: Estimated time until quota exhaustion (~Xh, ~Xd, or >7d)
- Displays "Stable" when no consumption detected

### Prompt Credits Display
- Shows available/monthly prompt credits
- Remaining percentage calculation
- Prompt/Flow rows are hidden by default; enable them with `tfa.dashboard.showCreditsCard`

### Token Credits Tracking
- **Prompt Credits**: Used for conversation input and result generation (reasoning)
- **Flow Credits**: Used for search, modification, and command execution (operations)
- Visual progress bars with color-coded status
- Google One AI subscription credit remains visible when Prompt/Flow rows are hidden

### User Info Card
- Display user subscription tier and plan name
- Toggle visibility via `tfa.dashboard.showUserInfoCard` setting
- Shows browser and knowledge base feature status

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
- Option to hide empty folders in tree views (`tfa.cache.hideEmptyFolders`)

---

## 📱 Status Bar Integration

### Quota Display
- Shows remaining quota percentage for active model group with concise labels (e.g., "Pro", "Flash")
- Detailed tooltip on hover showing all active groups with full labels and reset times
- Multiple display styles: percentage, reset time, used, remaining
- Color-coded status: normal (green), warning (yellow), critical (red)
- Configurable thresholds for warning (default 40%) and critical (default 20%)

### Cache Size Display
- Shows total cache size in status bar
- Toggleable via `tfa.status.showCache` setting

---

## ⚙️ Quick Configuration Access

### One-click Shortcuts
- Edit Global Rules (opens the first existing of `~/.gemini/config/AGENTS.md`, legacy `~/.gemini/GEMINI.md`, cross-tool `~/.gemini/AGENTS.md`)
- Configure MCP settings (`~/.gemini/config/mcp_config.json`)
- Manage Browser Allowlist (`~/.gemini/config/browserAllowlist.txt`)
- Open extension settings

In WSL remote sessions the shortcuts follow where Antigravity actually reads each file: Rules and MCP config target the WSL-side `~/.gemini`, while the Browser Allowlist targets the Windows-side profile (the browser runs on the Windows host). If the counterpart side cannot be located, the shortcut falls back to the local path.

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
- `AppViewModel` as unified state coordination and data aggregation layer
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

### Supported Languages (14)
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
- Türkçe (Turkish)
- Polski (Polish)
- Tiếng Việt (Vietnamese)

---

## 🔒 Security

### Content Security Policy
- Strict CSP for Webview security
- External CSS (no `'unsafe-inline'`)
- Nonce-based script loading
- Restricted resource loading (`default-src 'none'`)

---

## 🧪 Testing

### Unit and Local Integration Test Coverage
- 270+ tests across 29 test files
- Unit coverage for pure business logic plus local Antigravity Language Server integration tests
- Full validation is expected to run inside Antigravity IDE with its local Language Server available
- Core modules fully tested:
  - ConfigManager, CacheService, QuotaService, StorageService
  - AppViewModel, QuotaStrategyManager
  - Scheduler, Retry, HttpClient
  - ProcessFinder, PlatformStrategies
  - HtmlBuilder, Format utilities, AutomationService

---

## 🔧 Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `tfa.status.showQuota` | `true` | Show quota in status bar |
| `tfa.status.showCache` | `true` | Show cache size in status bar |
| `tfa.status.warningThreshold` | `40` | Warning threshold (%) |
| `tfa.status.criticalThreshold` | `20` | Critical threshold (%) |
| `tfa.status.scope` | `all` | Show quotas for "all" available model groups or only the "primary" active model |
| `tfa.dashboard.refreshRate` | `90` | Quota refresh interval (seconds, min 30) |
| `tfa.dashboard.gaugeStyle` | `semi-arc` | Gauge style: semi-arc or classic-donut |
| `tfa.dashboard.viewMode` | `groups` | Display mode: groups/models |
| `tfa.dashboard.includeSecondaryModels` | `false` | Show GPT quota (shares pool with Claude) |
| `tfa.dashboard.historyRange` | `90` | Usage chart time range (10-120 min) |
| `tfa.dashboard.showUserInfoCard` | `true` | Show user info card in sidebar |
| `tfa.dashboard.showCreditsCard` | `false` | Show static Prompt/Flow rows; Google One AI remains visible |
| `tfa.cache.scanInterval` | `120` | Cache check interval (seconds, min 30) |
| `tfa.cache.warningSize` | `500` | Cache warning threshold (MB) |
| `tfa.cache.hideEmptyFolders` | `false` | Hide empty folders in tree views |
| `tfa.cache.autoClean` | `false` | Auto-clean cache |
| `tfa.cache.autoCleanKeepCount` | `5` | Number of newest tasks to keep during auto-clean |
| `tfa.system.debugMode` | `false` | Enable debug logging |
| `tfa.system.autoAccept` | `false` | Enable hands-free acceptance of Agent actions |
| `tfa.system.autoAcceptInterval` | `800` | Auto-Accept polling interval in milliseconds |
| `tfa.commitMessageClaude.endpoint` | `http://localhost:11434/api/generate` | Commit message LLM endpoint |
| `tfa.commitMessageClaude.model` | `llama3.2` | Commit message model name |
| `tfa.commitMessageClaude.maxDiffChars` | `80000` | Max staged diff characters sent to the LLM endpoint |
| `tfa.commitMessageClaude.format` | `conventional` | Commit message format |
