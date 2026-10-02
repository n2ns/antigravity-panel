# Features

> This document lists all implemented features in Antigravity Panel and is the single reference for its settings. Internal design is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

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
- 14-day history tracking with persistent storage; the latest 24 hours keep raw samples, while older data is downsampled to 5-minute intervals
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
- Display the user email and subscription tier currently reported by Antigravity
- Toggle visibility via `tfa.dashboard.showUserInfoCard` setting

### Connection and Automatic Reconnection
- The local Antigravity Language Server is discovered automatically; the panel reconnects after the connection is lost (two consecutive polls without an answer), after **Restart Agent Service**, and after a failed manual refresh
- A reconnect retries a bounded number of times (7 extra attempts, 5 seconds apart), then keeps retrying in the background with a backoff that starts at 30 seconds and doubles up to 5 minutes
- HTTP 401/403 is reported as an authentication failure; it does not trigger a rescan and polling continues
- Server errors (HTTP 5xx) and unparseable responses are not treated as a lost connection
- While the connection is failed, the status bar shows a warning state instead of stale quota data

### Cache-First Startup
- The sidebar renders immediately from the last stored quota snapshot and cache sizes, then refreshes with live data
- Total, Brain, and conversation cache sizes and the cache tree metadata are restored across panel instances
- Local UI state such as collapsed sections survives refreshes and panel recreation

---

## 🗂️ Cache Management

### Brain Tasks Management
- Browse AI conversation caches with folder tree view
- Display task metadata: size, file count, creation date
- Preview files: images, markdown, and code files
- One-click deletion with confirmation dialog
- **Clean Cache** first builds a dry-run clean plan and deletes exactly that plan only after modal confirmation
- Smart cleanup: keeps the most recently active tasks (default 5, `tfa.cache.autoCleanKeepCount`) to prevent interrupting active work; activity includes the task's files and its conversation `.pb`, `.db`, `.db-wal` and `.db-shm` files
- Conversation `.pb` files are deleted only with their cleaned task or as true orphans (no matching Brain task directory)
- Each task is cleaned independently: a failure is logged and counted, and the remaining entries are still processed
- Auto-clean (`tfa.cache.autoClean`) uses the same selection without a prompt

### Code Tracker Management
- Browse code analysis caches per project
- Folder tree view with expand/collapse
- Delete individual files or entire directories; single-file deletion (also in Brain) asks for modal confirmation
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
- Shows a warning state instead of stale quota data when the Language Server connection fails; cache-only display remains independent

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

## 🤖 Auto-Accept (Hands-free Mode)

### Agent Action Acceptance
- Toggle via the **Auto-Accept** switch in the sidebar footer, the **Toggle Agent Auto-Accept** command, or `tfa.system.autoAccept`
- Accepts AI agent steps and file edits: registered Agent-scoped IDE accept commands first, then a CDP fallback that clicks accept buttons in the Agent panel
- The CDP fallback requires starting the IDE with `--remote-debugging-port=9222` and connects only to workbench targets
- Persistent grants (e.g. "Always allow", "Allow this conversation") are never clicked
- Action cards that look destructive are left for manual review
- Polling interval configurable via `tfa.system.autoAcceptInterval` (default 800ms)
- `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped (user settings, not per workspace)

### Terminal Commands
- Off by default; additionally requires `tfa.system.autoAcceptTerminal`
- Approved only by clicking the **Run** button of a terminal command prompt card in the Agent panel through the CDP fallback; IDE accept commands are never used for terminal commands
- The danger check covers the whole prompt card; Run is not clicked when no command text is visible in the card
- Commands that look destructive (e.g. `rm -rf` on `/` or `~`, `git push --force`, `git reset --hard`, `Remove-Item -Recurse`, `DROP TABLE`) are left for manual review

---

## 💬 Community & Feedback

### Feedback Integration
- Report bugs via the built-in Intelligent Feedback System (pre-fills diagnostics)
- Side-by-side buttons in footer for **Report Issue** (GitHub Issues) and **Project Home**
- Full localization support for all UI elements and feedback instructions

---

## 🌐 Internationalization

### Supported Languages (15)
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
- Bahasa Indonesia (Indonesian)
- CI validates locale keys, placeholders, and protected English UI labels with `npm run check:l10n`

---

## 🔒 Security

### Content Security Policy
- Strict CSP for Webview security
- Styles come from the external CSS bundle; `style-src` additionally allows `'unsafe-inline'` because the gauges render dynamic gradients
- No inline scripts: `script-src` accepts only the per-render nonce
- Restricted resource loading (`default-src 'none'`)

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
| `tfa.dashboard.uiScale` | `1` | Sidebar text and UI scale (0.8-2) |
| `tfa.dashboard.showWeeklyCard` | `true` | Show the 7-day local usage estimate card |
| `tfa.cache.scanInterval` | `120` | Cache check interval (seconds, min 30) |
| `tfa.cache.warningSize` | `500` | Cache warning threshold (MB) |
| `tfa.cache.hideEmptyFolders` | `false` | Hide empty folders in tree views |
| `tfa.cache.autoClean` | `false` | Auto-clean cache |
| `tfa.cache.autoCleanKeepCount` | `5` | Number of most recently active tasks to keep when cleaning (integer, 1-50) |
| `tfa.system.serverHost` | `127.0.0.1` | ⚠️ Advanced: Language Server hostname for quota metrics |
| `tfa.system.apiPath` | `/exa.language_server_pb.LanguageServerService/GetUserStatus` | ⚠️ Advanced: API path for quota metrics |
| `tfa.system.debugMode` | `false` | Enable debug logging |
| `tfa.system.autoAccept` | `false` | Enable hands-free acceptance of Agent steps and file edits (application scope) |
| `tfa.system.autoAcceptTerminal` | `false` | Also approve terminal commands, only via CDP Run clicks (application scope) |
| `tfa.system.autoAcceptInterval` | `800` | Auto-Accept polling interval in milliseconds |
| `tfa.system.notifyOnQuotaReset` | `true` | Notify when a quota reset is detected |
| `tfa.system.notifyOnAbnormalDrain` | `true` | Warn when quota drains while the IDE is closed or the window is unfocused with no editor activity |
| `tfa.commitMessageClaude.endpoint` | `http://localhost:11434/api/generate` | Commit message LLM endpoint |
| `tfa.commitMessageClaude.model` | `llama3.2` | Commit message model name |
| `tfa.commitMessageClaude.maxDiffChars` | `80000` | Max staged diff characters sent to the LLM endpoint |
| `tfa.commitMessageClaude.format` | `conventional` | Commit message format |
