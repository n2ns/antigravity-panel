# Features

> This document lists all implemented features in Antigravity Panel and is the single reference for its settings. Internal design is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 📊 Quota Monitoring

### Real-time Quota Display
- Visual quota display grouped by provider-defined quota pools (Gemini, Claude, etc.)
- Pie charts showing remaining quota percentage per pool
- Color-coded warnings when quota runs low (warning/critical thresholds)
- **Official Weekly Limit**: in the pool view, a `Weekly` bar under each gauge shows the pool's weekly limit and a countdown to its reset, as reported by Antigravity (the same values as the IDE's Settings → Models). The gauge keeps showing the 5-hour quota. Hidden when the Language Server does not provide the weekly limit and in the model view
- Models that share a quota pool are counted together, so each gauge shows the quota its models actually share
- Model view preserves separate **Gemini Flash** and **Gemini Pro** identities and colors even while they share one pool
- Models that match no configured group are shown in an **Other** group and counted in the Claude (non-Google) pool, never in the Gemini pool
- **Gauge Styles** (`tfa.dashboard.gaugeStyle`):
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
- Usage history is kept for 14 days; data older than a day is kept at a lower resolution
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
- The local Antigravity Language Server is found automatically
- When the connection is lost, after **Restart Agent Service**, or after a failed manual refresh, the panel reconnects by itself: a few quick retries first, then retries in the background at growing intervals
- If the server rejects the request because you are not signed in, the panel tells you so instead of reconnecting
- A temporary server error does not count as a lost connection
- While the connection is failed, the status bar shows a warning state instead of outdated quota data

### Conversation Context Window
- A `Context` card under the gauges shows the context window of the current conversation: tokens used in the latest model call and the model's limit (for example `37.2K / 256K (15%)`), with the conversation title and model
- The values are the Language Server's own estimate, the same figure that decides when the IDE compresses, and are never lower than the tokens actually sent; the current conversation is the most recently active one in this window
- The bar turns yellow at `tfa.context.warningThreshold` (default 80%) and red at 95%
- The IDE does not compress a conversation early: it lets the context fill up to the limit, then compresses it, which can drop most earlier details. When usage crosses the threshold, a warning suggests starting a new conversation; it is shown once per crossing, and not for a conversation that was already above the threshold when the panel first saw it
- When a compression is observed, a notification says so and the card shows `Compressed at <time>`
- The card updates about every 10 seconds and is hidden when there is no conversation or the server does not provide the data. After a window reload it reappears with the next message in a conversation

### Cache-First Startup
- The sidebar shows the last known quota and cache sizes immediately, then refreshes with live data
- Cache sizes and the Brain and Code Tracker lists are remembered when the panel is reopened
- Changing a setting redraws the panel at once without waiting for the server
- Local UI state such as collapsed sections survives refreshes and panel recreation

---

## 🗂️ Cache Management

### Brain Tasks Management
- Browse AI conversation caches with folder tree view
- Display task metadata: size, file count, creation date
- Preview files: images, markdown, and code files
- One-click deletion with confirmation dialog
- **Clean Cache** first shows exactly what it will delete, and deletes only that after you confirm
- Smart cleanup: keeps the most recently active tasks (default 5, `tfa.cache.autoCleanKeepCount`) so active work is not interrupted; a task counts as active when its files or its conversation were recently used
- A task's conversation history is deleted together with the task; conversation history that belongs to no task is cleaned as well, keeping the newest
- Files that are in use (for example, locked on Windows) are left in place and reported as not deleted
- Folders the IDE uses for other purposes are neither listed nor cleaned
- A task that cannot be deleted does not stop the others; the result reports how many failed
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
- Accepts AI agent steps and file edits: through the IDE's own accept commands first, and, for buttons the IDE does not expose to extensions, through the CDP fallback that clicks them in the Agent panel
- Works with the accept commands of the installed IDE version, so it keeps working across IDE upgrades
- The CDP fallback requires starting the IDE with `--remote-debugging-port=9222` and only touches the IDE's own windows
- A button that was just clicked is not clicked again for a few seconds
- Persistent grants (e.g. "Always allow", "Allow this conversation") are never clicked
- Action cards that look destructive are left for manual review
- Polling interval configurable via `tfa.system.autoAcceptInterval` (default 800ms)
- `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped (user settings, not per workspace)

### Terminal Commands
- Off by default; additionally requires `tfa.system.autoAcceptTerminal`
- Approved only by clicking the **Run** button of a terminal command prompt in the Agent panel through the CDP fallback, so the command text is always checked first
- The danger check covers the whole prompt card; Run is not clicked when no command text is visible in the card
- Commands that look destructive (e.g. `rm -rf` on `/` or `~`, `git push --force`, `git reset --hard`, `Remove-Item -Recurse`, `DROP TABLE`) are left for manual review

### Runtime Status
While Auto-Accept is on, the sidebar footer shows what the automation observes, below the switch (also when the footer is collapsed):
- **CDP**: connected, connected but the Agent panel was not found (for example after an IDE update changes the panel), port open without an Agent panel target, or not available. When the debugging port does not answer, a **Setup** button opens the instructions below
- **IDE accept commands**: how many registered accept commands were found, or that none are registered
- **Last action**: the last button accepted through CDP, or the last one left for manual review with the reason: destructive command, no command text visible, or terminal approval is off (`tfa.system.autoAcceptTerminal`)

Only observed state is shown: a line appears after its first check, and accepts made through the IDE's accept commands are not listed because the panel cannot see their effect. An action still on screen is reported once, not repeatedly.

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

In a multi-root workspace the repository is taken from the folder of the active editor; without an active editor in a workspace folder, the first folder is used.

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
- The sidebar footer links to **Docs** (this feature reference), **Feedback** (GitHub Issues), and **Star** (the project page)
- When the Language Server cannot be found or its data cannot be read, the notification offers **Feedback**, which opens a new GitHub issue with the extension, IDE, and operating system versions and the connection diagnostics filled in, and **Run Diagnostics**
- Feedback instructions are localized like the rest of the UI

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
- Command titles and core labels such as `Auto-Accept` stay in English in every language, so they match documentation and community discussions

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
| `tfa.context.warningThreshold` | `80` | Context window usage (%, 50-99) at which a conversation triggers a warning |
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
