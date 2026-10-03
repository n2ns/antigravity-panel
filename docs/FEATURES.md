# Features

> This document lists all implemented features in Antigravity Panel and is the single reference for its settings. Internal design is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 📊 Quota Monitoring

### Real-time Quota Display
- Visual quota display grouped by provider-defined quota pools (Gemini, Claude, etc.)
- Pie charts showing remaining quota percentage per pool
- Color-coded warnings when quota runs low (warning/critical thresholds)
- **Official Weekly Limit**: in the pool view, a `Weekly` bar under each gauge shows the pool's weekly limit and a countdown to its reset, as reported by Antigravity (the same values as the IDE's Settings → Models). The gauge keeps showing the 5-hour quota. Hidden when the Language Server does not provide the weekly limit and in the model view
- Configuration-driven pool membership keeps shared quotas accurate and allows future provider splits without changing the statistics pipeline
- Model view preserves separate **Gemini Flash** and **Gemini Pro** identities and colors even while they share one pool
- Models that match no configured group are shown in an **Other** group and counted in the Claude (non-Google) pool, never in the Gemini pool
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
- Configurable display range (10-120 minutes), adaptively grouped into at most about 24 readable intervals
- 14-day history tracking with persistent storage; the latest 24 hours keep raw samples, while older data is downsampled to 5-minute intervals
- Color-coded visualization by quota pool, with interval and per-pool details on hover

### Usage Prediction
- 🔥 **Usage Rate**: Average consumption speed in percentage points per hour (pp/h) based on recent activity
- ⏱️ **Runway**: Estimated time until quota exhaustion (~Xh, ~Xd, or >7d)
- After a quota reset, the rate covers only the time since the reset
- Displays "Stable" when no consumption detected

### Prompt Credits Display
- Shows available/monthly prompt credits
- Remaining percentage calculation; credits the server omits are shown as 0 available
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
- Changing a setting re-renders the panel from the last snapshot; it does not change the connection state or record quota history
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
- Conversation files (`.pb`, `.db`, `.db-wal`, `.db-shm`) are deleted only with their cleaned or deleted task, or as true orphans (no matching Brain task directory); among orphan conversations the newest ones are kept
- When a conversation `.db` cannot be deleted (for example, locked on Windows), its `.db-wal` and `.db-shm` are kept as well and reported as not deleted
- Only UUID-named Brain directories are tasks; other directories such as the IDE's `tempmediaStorage` are neither listed nor cleaned
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
- Detailed tooltip on hover showing all active groups with full labels and reset times, plus a `Weekly` row per pool with its official weekly limit
- Multiple display styles: percentage, reset time, used, remaining
- Color-coded status: normal (green), warning (yellow), critical (red)
- Shows a loading indicator until the first quota data arrives
- Configurable thresholds for warning (default 40%) and critical (default 20%); a group changes color and the low quota notification appears only when its remaining quota falls below a threshold, and a critical threshold above the warning threshold is lowered to it
- The color follows the lower of the 5-hour and weekly limits, and a weekly limit below a threshold shows its own low quota notification
- Shows a warning state instead of stale quota data when the Language Server connection fails; cache-only display remains independent

### Cache Size Display
- Shows total cache size in status bar
- Toggleable via `tfa.status.showCache` setting

---

## ⚙️ Quick Configuration Access

### One-click Shortcuts
The **Rules**, **MCP**, and **Allowlist** buttons in the sidebar footer open:
- Edit Global Rules (opens the first existing of `~/.gemini/config/AGENTS.md`, legacy `~/.gemini/GEMINI.md`, cross-tool `~/.gemini/AGENTS.md`)
- Configure MCP settings (`~/.gemini/config/mcp_config.json`)
- Manage Browser Allowlist (`~/.gemini/config/browserAllowlist.txt`)
- Open extension settings

In WSL remote sessions the shortcuts follow where Antigravity actually reads each file: Rules and MCP config target the WSL-side `~/.gemini`, while the Browser Allowlist targets the Windows-side profile (the browser runs on the Windows host). If the counterpart side cannot be located, the shortcut falls back to the local path.

---

## 🤖 Auto-Accept (Hands-free Mode)

> [!WARNING]
> Auto-Accept is a trust-the-agent feature. Keep it off for untrusted or prompt-injection-prone tasks.

### Agent Action Acceptance
- Toggle via the **Auto-Accept** switch in the sidebar footer, the **Toggle Agent Auto-Accept** command, or `tfa.system.autoAccept`; the switch always shows the extension's current state
- Accepts AI agent steps and file edits: registered Agent-scoped IDE accept commands first, then a CDP fallback that clicks accept buttons in the Agent panel when a control is unavailable through the extension API (for example, because of webview sandboxing)
- Accept commands are matched at runtime against the commands the running IDE registers (IDs differ between Antigravity 1.x and 2.x), so the command strategy keeps working across IDE upgrades
- The CDP fallback requires starting the IDE with `--remote-debugging-port=9222` and connects only to workbench targets
- Each CDP pass locates and scans the current Agent panel once without leaving page-side observers or timers; a short per-node timestamp prevents immediate repeat clicks
- Persistent grants (e.g. "Always allow", "Allow this conversation") are never clicked
- Action cards that look destructive are left for manual review
- Polling interval configurable via `tfa.system.autoAcceptInterval` (default 800ms)
- `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped (user settings, not per workspace)

### Terminal Commands
- Off by default; additionally requires `tfa.system.autoAcceptTerminal`
- Approved only by clicking the **Run** button of a terminal command prompt card in the Agent panel through the CDP fallback; IDE accept commands are never used for terminal commands
- The danger check covers the whole prompt card; Run is not clicked when no command text is visible in the card
- Commands that look destructive (e.g. `rm -rf` on `/` or `~`, `git push --force`, `git reset --hard`, `Remove-Item -Recurse`, `DROP TABLE`) are left for manual review

### Runtime Status
While Auto-Accept is on, the sidebar footer shows what the automation observes, below the switch (also when the footer is collapsed):
- **CDP**: connected, connected but the Agent panel was not found (for example after an IDE update changes the panel), port open without an Agent panel target, or not available. When the debugging port does not answer, a **Setup** button opens the instructions below
- **IDE accept commands**: how many registered accept commands were found, or that none are registered
- **Last action**: the last button accepted through CDP, or the last one left for manual review with the reason: destructive command, no command text visible, or terminal approval is off (`tfa.system.autoAcceptTerminal`)

Only observed state is shown: a line appears after its first check, and commands executed through the IDE command API are not listed because their effect cannot be observed. An action still on screen is reported once, not on every pass.

### Enabling the CDP Fallback
Terminal command approval always needs the CDP fallback; steps and file edits need it only when the IDE command API is unavailable.

1. Save your work and quit Antigravity completely. If an instance is still running, a new launch reuses it and the flag has no effect.
2. Start Antigravity with the remote debugging port, adjusting the path to your installation:
   - Windows: `"C:\path\to\Antigravity\Antigravity.exe" --remote-debugging-port=9222`
   - macOS: `/Applications/Antigravity.app/Contents/MacOS/Electron --remote-debugging-port=9222`
   - Linux: run the Antigravity executable from your installation with `--remote-debugging-port=9222`

---

## ✍️ Commit Message Generator

A workaround for when the built-in "Generate commit message" feature is unavailable.

### Generating a Commit Message
1. Stage your changes
2. Run **Generate Commit Message (Local & Claude)**
3. The message is written into the Source Control input box

### Choosing a Model
- `tfa.commitMessageClaude.endpoint` selects the request format by its path: Ollama `/api/generate` or `/api/chat` (the default is a local Ollama), Anthropic `/v1/messages`, otherwise an OpenAI-compatible chat endpoint
- `tfa.commitMessageClaude.model` names the model on that endpoint
- Remote endpoints need an API key: run **Set Anthropic API Key** (for Claude, get one from the [Anthropic Console](https://console.anthropic.com/)). The key is kept in the IDE's secret storage, never in settings files; local endpoints need no key
- `tfa.commitMessageClaude.maxDiffChars` limits how much of the staged diff is sent (default 80,000 characters)
- `tfa.commitMessageClaude.format` picks Conventional Commits or a simple style

> ⚠️ **Privacy**: The staged diff is sent to the configured endpoint. Use a local endpoint if you do not want diffs sent to an external provider.

---

## 🔄 Service Recovery

The **Restart**, **Reset**, and **Reload** buttons in the sidebar footer:
- **Restart**: restarts the background Language Server when the Agent is unresponsive (also the **Restart Agent Service** command)
- **Reset**: resets the user status updater to fix stuck quota updates (also the **Reset Status** command)
- **Reload**: reloads the IDE window to resolve UI glitches

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
- Command titles stay in English in every language
- CI validates locale keys, placeholders, and protected English UI labels and command titles with `npm run check:l10n`

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
| `tfa.status.warningThreshold` | `40` | Warning threshold (%, 5-100) |
| `tfa.status.criticalThreshold` | `20` | Critical threshold (%, 1-50, at most the warning threshold) |
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
| `tfa.cache.scanInterval` | `120` | Cache check interval (seconds, 30-600) |
| `tfa.cache.warningSize` | `500` | Cache warning threshold (MB, min 100) |
| `tfa.cache.hideEmptyFolders` | `false` | Hide empty folders in tree views |
| `tfa.cache.autoClean` | `false` | Auto-clean cache |
| `tfa.cache.autoCleanKeepCount` | `5` | Number of most recently active tasks to keep when cleaning (integer, 1-50) |
| `tfa.system.serverHost` | `127.0.0.1` | ⚠️ Advanced: Language Server hostname for quota metrics |
| `tfa.system.apiPath` | `/exa.language_server_pb.LanguageServerService/GetUserStatus` | ⚠️ Advanced: API path for quota metrics |
| `tfa.system.debugMode` | `false` | Enable debug logging |
| `tfa.system.autoAccept` | `false` | Enable hands-free acceptance of Agent steps and file edits (application scope) |
| `tfa.system.autoAcceptTerminal` | `false` | Also approve terminal commands, only via CDP Run clicks (application scope) |
| `tfa.system.autoAcceptInterval` | `800` | Auto-Accept polling interval in milliseconds (200-5000) |
| `tfa.system.notifyOnQuotaReset` | `true` | Notify when a quota reset is detected |
| `tfa.system.notifyOnAbnormalDrain` | `true` | Warn when quota drains while the IDE is closed or the window is unfocused with no editor activity |
| `tfa.commitMessageClaude.endpoint` | `http://localhost:11434/api/generate` | Commit message LLM endpoint; the request format follows the path: Ollama `/api/generate` or `/api/chat`, Anthropic `/v1/messages`, otherwise OpenAI-compatible |
| `tfa.commitMessageClaude.model` | `llama3.2` | Commit message model name |
| `tfa.commitMessageClaude.maxDiffChars` | `80000` | Max staged diff characters sent to the LLM endpoint |
| `tfa.commitMessageClaude.format` | `conventional` | Commit message format |
