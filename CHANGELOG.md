# Change Log

## [Unreleased]

### Added

- **Auto-Accept Runtime Status**: While Auto-Accept is on, the sidebar footer shows what the automation can actually reach: whether the CDP debugging port answers, an Agent panel target is connected and the Agent panel is found in it, how many IDE accept commands are registered, and the last action it accepted or left for manual review with the reason (destructive command, no visible command text, or terminal approval turned off). When the debugging port does not answer, a `Setup` button opens the instructions for starting the IDE with `--remote-debugging-port=9222`. Only observed state is shown; nothing appears for a check that has not run yet.

### Fixed

- **Auto-Accept CDP Fallback Found No Agent Panel**: Current Antigravity IDE builds render the Agent panel as `.antigravity-agent-side-panel` in the workbench page, which none of the panel selectors matched, so the CDP fallback scanned nothing: terminal commands were never approved and panel-only actions were never accepted. The selector is now included.

## [2.7.6] - 2026-10-03

### Added

- **Official Weekly Limit** ([#203](https://github.com/n2ns/antigravity-panel/issues/203)): The panel now reads the weekly limit of the Gemini and Claude/GPT pools from the Language Server (the values the IDE shows in Settings → Models). In the pool view, a `Weekly` bar under each gauge shows the remaining percentage and a countdown to the weekly reset; the gauge keeps showing the 5-hour quota. The status bar tooltip adds a `Weekly` row per pool, the status color follows the lower of the 5-hour and weekly limits, and a weekly limit below the warning or critical threshold shows its own notification. On IDE versions that do not provide the weekly limit, nothing changes.

## [2.7.5] - 2026-10-03

### Changed

- **Detection Failure Reports**: When the Language Server cannot be found, the diagnostic report now lists the exit code and stderr of each process scan command and of the diagnostic command. On Windows it also runs a CIM probe that shows CIM query errors the detection scripts suppress, and, when the PowerShell process listing is empty, a `tasklist` cross-check of Antigravity-related processes.
- **About Command**: `Antigravity Panel: About` now always opens the English `docs/DISCLAIMER.md`; the Chinese disclaimer copy is no longer shipped.
- **Documentation Reorganization**: Project documentation is English only. Added `AGENTS.md` (rules and document index for AI coding agents, replacing `docs/RULES.md`) with a `CLAUDE.md` that imports it, `docs/ARCHITECTURE.md` (layers, lifecycle, connection, tests), and `docs/QUOTA_DATA_MODEL.md` (English translation of the former `quota-data-model.md`). Removed the `*_zh.md` copies and `docs/KNOWLEDGE_GRAPH.md`. `docs/FEATURES.md` is now the single settings reference and `README.md` links to it instead of repeating the table; `CONTRIBUTING.md` and `docs/DEBUGGING.md` link to `docs/ARCHITECTURE.md` and `AGENTS.md` instead of repeating the architecture and command lists.

### Fixed

- **Quota Polling Stall**: A quota request whose connection dropped after the response headers but before the body finished never completed, which blocked every later scheduled refresh until the window was reloaded. The request now fails as soon as the response is aborted. Responses are also decoded as UTF-8 across network chunks, so names with non-ASCII characters are no longer corrupted.
- **Settings Ranges**: Numeric settings are clamped to the ranges declared in the settings schema (`historyRange`, `warningThreshold`, `criticalThreshold`, `scanInterval`, `warningSize`, `autoAcceptInterval`), and invalid values fall back to the defaults. The fallback for `tfa.dashboard.refreshRate` now matches its declared default of 90 seconds. Polling intervals longer than about 24.8 days no longer turn into a 1 ms loop, and changing an unrelated setting no longer restarts the quota and cache timers.
- **Exhausted Credits**: When the server omits the available Prompt or Flow credits (it omits zero values), the panel now shows 0 available instead of hiding the credits.
- **Unknown Models**: Model rows that match no configured group now go to a new `Other` group in the Claude (non-Google) pool instead of the Gemini pool, so an unrecognized model can no longer drag the Gemini gauge, history and reset time down. Models identified only by their server ID, without a label, now resolve to their configured name and group.
- **False Parsing Error Notification**: A quota fetch that failed once and succeeded on retry no longer leaves a stale error that later showed a "Server data parsing error" notification. An error thrown while applying a fetched snapshot no longer counts the fetch as failed.
- **Cache Scan Robustness**: A task directory or file that disappears during a cache scan is skipped instead of emptying the task list or reporting the directory size as 0.
- **Settings Changes Rewriting Quota Data**: Changing a setting re-renders the panel from the last snapshot without touching quota data. It no longer marks a failed connection as connected, records the old snapshot as a new history sample, suppresses the next "drained while the IDE was closed" warning, repeats threshold notifications, or discards a quota fetch that was in progress. The cache is rescanned only when a `tfa.cache.*` setting changes.
- **Expanded Cache Folders**: A cache folder that is expanded keeps its file list after the cache view refreshes, for example after deleting a file.
- **Reset Refresh Loop**: A quota reset more than about 24.8 days away no longer causes continuous quota requests.
- **Idle Drain Warning**: The "quota dropped with no editor activity" warning now counts only drops that happened entirely while the window had been unfocused for at least 10 minutes, so switching away just before a poll no longer reports your own usage. Output panel updates, including this extension's own log, no longer count as editor activity.
- **Usage Rate After a Reset**: The usage rate is computed over the time since the latest reset instead of the whole chart range, so the runway estimate right after a reset is no longer understated as "Stable".
- **Status Bar While Detecting**: Before any quota data arrives, the status bar shows the loading indicator instead of `🔴 N/A 0% N/A`.
- **Status Bar Thresholds**: A remaining quota exactly at a threshold keeps the higher color and shows no low quota notification for that threshold, matching the setting descriptions ("falls below") and the notification text ("is below"). A `tfa.status.criticalThreshold` above `tfa.status.warningThreshold` is lowered to the warning threshold, so the warning color can still appear.
- **Conversation Database Cleaning**: Since Antigravity IDE 2.0 stores conversations as `.db` files (with `.db-wal` / `.db-shm`), deleting a task and cleaning the cache left them behind and orphan conversations were never found. Task deletion and cache cleaning now remove all of a conversation's `.pb`, `.db`, `.db-wal` and `.db-shm` files, and orphan conversations are kept or removed as a whole. When a `.db` cannot be deleted, its `.db-wal` and `.db-shm` are kept so no unsaved conversation data is lost.
- **Brain Task List**: Only UUID-named Brain directories are listed as tasks, so the IDE's `tempmediaStorage` directory no longer appears as a task, takes a keep slot, or gets deleted by cleaning.
- **Status Bar After Cached Startup**: The status bar renders the cached quota and cache size right at startup instead of staying empty until the first live update.
- **Sidebar**: The clicked file in the cache tree is highlighted, and multi-line tooltips on the usage charts and credit bars show one item per line. Tooltips near the top of the sidebar open below their element instead of being cut off, and the 7-day usage card labels each bar with the extension host's date, so they are no longer one day off when the Webview runs in another time zone (Remote-SSH, containers, WSL).
- **Commit Message Generator**:
  - Claude requests no longer send `temperature`, which current Claude models reject, and allow up to 4096 output tokens; a response cut off at the token limit is reported as an error instead of a partial message.
  - The request format is chosen from the endpoint path: Ollama `/api/generate` and `/api/chat`, Anthropic `/v1/messages`, and OpenAI-compatible endpoints such as Ollama's `/v1/chat/completions`.
  - Staged diffs larger than 10 MB are truncated instead of failing.
  - In a multi-root workspace, the message is written into the repository the diff was taken from.
- **Command Titles in English**: Command titles are now English in every language, as the localization rules require, and `npm run check:l10n` enforces it.

## [2.7.4] - 2026-10-02

### Added

- **Terminal Command Auto-Accept Opt-In**: The new `tfa.system.autoAcceptTerminal` setting (off by default) lets Auto-Accept also approve AI agent terminal commands. They are approved only by clicking Run on a terminal-command prompt card in the Agent panel through the CDP fallback, which requires starting the IDE with `--remote-debugging-port=9222`; IDE accept commands are never used for terminal commands. Run is clicked only when it shares one action group with Reject in a single prompt, the command text is visible in the card, and the whole card passes the danger check; otherwise the command is left for manual review.
- **Cache Clean Confirmation**: `tfa.cleanCache` now computes a dry-run plan first and asks for modal confirmation showing how many tasks and conversation files will be deleted, their total size, and how many recently active tasks are kept. Only the confirmed plan is deleted, and the result reports deleted tasks, deleted conversation files, freed space, and any items that could not be deleted. Deleting a single file from the cache tree also asks for modal confirmation. Scheduled auto-clean still runs without a prompt and uses the same selection.
- **Automatic Language Server Reconnection**: Two consecutive quota polls without a server answer now start a reconnect that rescans for the language server. Only one reconnect runs at a time, with bounded retries (7 extra attempts, 5s apart); once they are exhausted, background retries continue with a backoff that starts at 30s and doubles up to 5 minutes. A failed manual refresh starts a full reconnect (replacing a background probe in progress), `tfa.restartLanguageServer` reconnects after giving the server time to restart, and a server found by the diagnostics command is used directly. HTTP 401/403 responses are not treated as a lost connection: they neither trigger a rescan nor count toward the reconnect threshold, polling continues, and repeated rejections keep the authentication-failed status. Server errors (HTTP 5xx, invalid or unparseable responses) likewise never trigger a rescan. Notifications left open after a failed connection or a parsing error do not hold up background retries or quota polling, and a refresh that throws is reported through the error log.

### Changed

- **IDE Diagnostic Identity**: Activation logs and diagnostic reports now include the host name, product identity, Antigravity product version, and remote environment.
- **Terminal Commands Need a Separate Opt-In**: Enabling `tfa.system.autoAccept` alone no longer approves terminal commands. Previously Auto-Accept also invoked the IDE terminal accept commands and clicked Run / Always run buttons. IDE accept commands are now never used for terminal commands: the command path only invokes `antigravity.prioritized.agentAcceptAllInFile`, and commands that can also approve a pending terminal command (`antigravity.terminalCommand.accept`, `antigravity.command.accept`, `antigravity.terminal.accept`, `antigravity.agent.acceptAgentStep`, `antigravity.agent.acceptAllAgentSteps`) are no longer invoked; other Agent steps are accepted through the CDP fallback's button clicks. To keep auto-approving terminal commands, enable `tfa.system.autoAcceptTerminal` and start the IDE with `--remote-debugging-port=9222`. The setting description and the Hands-free Mode tooltip now state this.
- **Auto-Accept Safety Boundaries**: `tfa.system.autoAccept` and `tfa.system.autoAcceptTerminal` are application-scoped, so workspace settings cannot enable them. CDP scans only workbench pages and webviews whose debugger socket is on loopback. Persistent grants ("Always allow", "Always run", "Allow this conversation") are never clicked, and elements nested inside a button are not clicked separately.
- **Auto-Accept Danger Check**: An action is checked against its own text and each ancestor text up to four levels instead of a single truncated context, and a Run click is checked against the whole terminal-command prompt card. The danger patterns now also cover `rm` with `-r`/`-f` flags in any order or long form (`--recursive`, `--force`) on a path under `/`, `~`, `$HOME` or a drive root, `cd ~ && rm -rf *` chains, `find … -delete` under `/`, `~` or `$HOME`, `git push` with a `+refspec` or a combined `-f` flag, `git reset --hard` and `git clean -f` (also after global options such as `-C <dir>`), PowerShell `Remove-Item -Recurse` and `rm`/`ri`/`rd` with `-Recurse` on a drive path, and cmd `del`/`erase`/`rmdir`/`rd` with `/s`.
- **Cache Cleaning Selection**: Cleaning now keeps the `tfa.cache.autoCleanKeepCount` most recently active tasks instead of the most recently created ones. Activity is the newest modification time among the task's files and its conversation `.pb`, `.db`, `.db-wal` and `.db-shm` files, so an active Antigravity 2.0 conversation is not ranked as stale. Only true orphan `.pb` files (without a task directory) are deleted, the newest orphans up to the keep count are retained, and the `.pb` of a kept task is never deleted. Each deletion is isolated: a failure is logged and counted while the remaining entries are still processed, and an invalid plan entry is reported as a failure. Directories with invalid names are excluded from the plan and never take a keep slot, and a task directory that disappeared after confirmation does not prevent its planned `.pb` file from being deleted.
- **Delete Button Label**: The Delete button in cache deletion confirmations stays in English in every language, and `check_l10n` protects it.

### Fixed

- **Test Reliability**: Corrected HTTP failure and live-response assertions, verified retained cache task identities and scheduler interval changes, exercised model ID normalization, and checked SVG arc flags precisely. Isolated status-bar fixtures, restored mocked time after storage test failures, and removed Linux distribution-name assumptions from platform tests.
- **Configuration Change Handling**: Changes to `tfa.system.autoAccept`, `tfa.system.autoAcceptTerminal` and the auto-accept interval now take effect before the configuration handler refreshes quota and cache data, and a failing refresh no longer skips them. Errors while handling a configuration change are logged instead of being left as unhandled rejections.
- **Auto-Accept Footer Toggle**: The footer checkbox now always follows the Auto-Accept state reported by the extension host instead of flipping locally on click.
- **Cache Keep Count Validation**: `tfa.cache.autoCleanKeepCount` is declared and read as an integer clamped to 1–50.

## [2.7.3] - 2026-07-25

### Added

- **Quota Reset Countdown & Notification**: The sidebar countdown now ticks live between polls, driven by the absolute reset timestamp already provided by the server. When a pool's quota rebounds past a reset threshold (5pp), a notification announces the reset (toggle: `tfa.system.notifyOnQuotaReset`, cooldown-protected against server jitter). A one-shot timer aimed at the earliest upcoming reset triggers an immediate refresh, so resets surface within seconds instead of waiting for the next polling cycle. Invalid server reset times are now flagged and rendered as N/A instead of a synthetic 24-hour countdown.
- **Abnormal Consumption Alerts**: Optional warnings now flag quota drops of at least 5pp while the IDE was closed, or while its window stayed unfocused with no editor activity. Reset-aware checks and per-pool cooldowns reduce false positives (toggle: `tfa.system.notifyOnAbnormalDrain`).
- **Weekly Usage Local Estimate**: The sidebar can now show seven daily consumption bars, the current 7-day total, and the preceding 7-day total for comparison (toggle: `tfa.dashboard.showWeeklyCard`). Unsampled periods remain visibly distinct from zero consumption, and the card explicitly identifies the metric as a local short-term-pool estimate rather than Google's official weekly limit.

### Changed

- **Dependency Updates**: Updated mocha to 11.7.6, eslint to 10.8.0, lint-staged to 17.2.0, and refreshed the remaining development dependencies within their declared ranges. Added mocha-scoped npm overrides (diff, glob, minimatch, brace-expansion) to clear all five `npm audit` findings (four high, one low — all DoS-class issues confined to the development toolchain; the production dependency tree was already clean).
- **Usage History Survives Quota Resets**: A detected reset no longer deletes the group's quota history; it now writes a reset marker onto the recorded point. Consumption rate (pp/h) and runway prediction still restart at the marker — deltas never span a reset — while 14 days of history support the current-versus-previous 7-day comparison. History points older than 24 hours are downsampled to 5-minute granularity (markers preserved) to bound storage size. The stored `tfa.quotaHistory_v2` format is unchanged apart from the additive `resets` field.
- **Runtime and Payload Cleanup**: Removed obsolete cache, storage, automation, scheduler, status-bar, quota, and Webview DTO fields and helpers after verifying their production call paths. The usage chart now derives its scale directly from the rendered buckets, while per-item colors continue to preserve the existing chart appearance.
- **Language Server Debug Tools**: Consolidated real-server diagnostics under `scripts/debug` with explicit npm commands and documentation. The quota tool prints the complete real response and can resolve Linux listening ports through the target process's `/proc` socket descriptors when socket tools are unavailable.

### Fixed

- **Language Server Fallback Isolation** (#192): Ambient fallback discovery now requires the same explicit Antigravity app-data marker allowlist as the primary platform strategies before probing a candidate process. Listening-port discovery now parses Linux `ss` output correctly and verifies exact PIDs across Windows `netstat`, macOS/Linux `lsof`, Linux `ss`, and Linux `netstat`, preventing prefix-colliding processes from contributing ports.
- **Cache-First Size Breakdown**: Cache refreshes now persist the Brain and conversation size breakdown alongside the total, so a recreated panel restores all three values immediately instead of briefly showing `0 B` until the next asynchronous scan.
- **Cache-First Tree Metadata**: Task and context entries now persist and restore their raw byte sizes and modification timestamps, preserving the initial size display and sort order after an IDE restart.
- **Quota Failure Logging**: Restored the production error callback registration so failed quota requests are recorded in the extension log instead of being silently discarded.
- **Footer Collapse Persistence**: Backend Webview updates now preserve local UI state stored beside the payload, so the collapsed footer remains collapsed after quota/cache refreshes and subsequent panel recreation.

## [2.7.2] - 2026-07-22

### Fixed

- **Gemini 3.6 Flash Misclassified as Claude**: The IDE 2.1.1 server reports Gemini 3.6 Flash as `MODEL_PLACEHOLDER_M264/M265/M266`, which the loose substring ID match routed to Claude Opus (`MODEL_PLACEHOLDER_M26`). This dragged the Claude pool gauge down whenever Gemini quota was consumed and rewrote those rows' display names to "Claude Opus 4.6 (Thinking)". Configured model IDs now match exactly, and modelName-in-label matching requires token boundaries, so numeric-suffixed server IDs can no longer match their prefixes.
- **Status Bar Connection Failure State**: When quota monitoring is enabled and the Language Server connection fails, the status bar now switches to its warning state instead of continuing to render stale quota data. Cache-only status bar mode remains available independently.

### Changed

- **CI Type Safety and Node 24 Actions**: Added a dedicated production TypeScript typecheck gate to CI and release builds, upgraded all JavaScript-based workflow actions to their Node 24-native major versions, and removed the temporary runtime-forcing environment flag.
- **Dead Code and Test Cleanup**: Removed unreachable Webview styles/components, unused barrel files, compatibility exports, and orphaned cache, view-model, scheduler, logger, formatting, and commit-message helpers. Production diff truncation now uses the same helper covered by tests, Tooltip Manager resources are explicitly disposed, tests that only exercised unreachable APIs were removed, unit tests remain separate from the dedicated Language Server integration runner, and the placeholder cache-deletion test was replaced with a real behavior assertion.
- **CI and Packaging Cleanup**: Removed the empty Codecov upload job, eliminated duplicate pre-package builds, dropped redundant TypeScript ESLint declarations and the `package:sync` alias, and kept unit and server integration suites as separate CI gates.
- **Localization Alignment**: Added Indonesian and aligned every active notification and diagnostic message across all 15 supported languages. CI now checks manifest/runtime key sets, placeholders, and protected English UI labels, and the existing `Docs` label is wired into the Webview translation payload.
- **Documentation and Roadmap Sync**: Moved the English TODO to the repository root, reduced the bilingual roadmap to seven source-verified tasks, and synchronized contributor, feature, localization, quota-model, knowledge-graph, and Webview typography documentation with the current runtime and CI behavior.
- **Single Release Artifact**: The release workflow now builds, tests, and packages the extension once, then publishes that exact VSIX artifact to the Visual Studio Marketplace, Open VSX, and GitHub Releases instead of rebuilding independently in each publishing job.
- **Publishing Toolchain Cleanup**: Added `ovsx` as a tracked development dependency, aligned Sinon types with Sinon 22, removed the unused `canvas` dependency and obsolete icon-generation script, and refreshed the dependency lockfile.
- **Open VSX Verification Documentation**: Documented that `n2ns` is already a verified Open VSX namespace; no additional publisher-verification request is required for `n2ns.antigravity-panel`.

## [2.7.1] - 2026-07-20

### Fixed

- **Auto-Accept Command IDs on Antigravity 2.x**: The command-API strategy previously hard-coded `antigravity.agent.acceptAgentStep` and `antigravity.terminal.accept`, which are absent from the 2.x command table (the 2.1.1 server bundle registers `antigravity.terminalCommand.accept` / `antigravity.command.accept` / `antigravity.prioritized.agentAcceptAllInFile` instead), so the primary strategy silently no-opped on 2.x. Accept commands are now discovered at runtime via `vscode.commands.getCommands()` against a candidate list covering both 1.x and 2.x IDs (refreshed every 60s), and only registered commands are invoked.
- **Usage History Chart Restored**: Restored the bar chart import and render node that were inadvertently removed in v2.6.0 while preserving the existing quota-history data path.

### Changed

- **CDP Fallback: Stateless Panel Scans**: Each configured polling pass locates the current Agent Panel, scans accessible iframe and shadow-root content once, and exits without leaving page-side observers, heartbeat leases, timers, or a global action-history registry. A short timestamp remains on clicked DOM nodes to suppress immediate repeats, and interaction remains limited to the located panel.
- **Stop Semantics**: Auto-Accept runs now carry a generation token. Toggling the feature off or disposing the extension prevents in-flight work from dispatching another accept action and closes tracked CDP connections. An IDE command or CDP evaluation that was already dispatched cannot be recalled.
- **Readable Usage History for Coarse Quota Updates**: The chart now aggregates the selected history range into at most about 24 time buckets instead of implying per-poll precision. Empty periods render as a baseline, small changes retain useful precision, legends use product-facing group names, and bar tooltips include the interval time and per-group percentage-point change.
- **Usage Chart Appears on First Data**: A fresh session no longer shows an empty Usage History card. The chart appears automatically after the first positive quota-change sample is available.
- **Configuration-Driven Quota Pools**: Gemini Flash and Pro now render and record as one Gemini quota pool, matching Antigravity's current shared-quota policy. Model view still preserves individual model names and the existing Flash blue / Pro green colors. Pool membership, labels, and colors live in `quota_strategy.json`, so a future provider split can be handled by configuration instead of rewriting history, chart, notification, or status-bar logic. Legacy duplicated group history is collapsed once per pool when charted.
- **Static Credit Rows Hidden by Default**: Prompt and Flow values currently remain static in Antigravity's Language Server response, so those two rows now default to hidden. Google One AI subscription credit remains visible and users can restore Prompt/Flow with `tfa.dashboard.showCreditsCard`.

### Added

- **Auto-Accept Destructive-Action Check (CDP click path)**: Before interacting with a run/accept control, the fallback evaluates the nearest action card and leaves destructive-looking filesystem, disk, Git, or database operations for manual review. The check stops at the Agent Panel boundary so unrelated cards do not affect one another. This is best-effort hardening rather than a security boundary: the command-API path cannot inspect pending command text, and hidden or truncated card content may not be available to the check.

## [2.7.0] - 2026-07-20

### Added

- **Antigravity Product Version in Auto-Reports**: Diagnostic issue reports now include the actual Antigravity release ("IDE Product Version", read from the IDE's `product.json` `ideVersion` field, e.g. `2.1.1`) alongside the VS Code base version, which alone cannot identify the product release.

### Changed

- **Extension Runs on the Workspace Side in Remote Windows**: `extensionKind` changed from `["ui", "workspace"]` to `["workspace", "ui"]`. In remote windows (WSL, SSH, Dev Containers) the extension host now runs on the workspace side — where the Antigravity agent backend lives — so the task/context lists, process detection, and config paths all read the environment the agent actually runs in, instead of the local UI machine.

### Fixed

- **Literal `%3F` in Auto-Report Issue Bodies**: VS Code's external-URL chain re-parses the report URL (percent-decoding the query) and rebuilds it via minimal re-encoding plus `encodeURI`, double-encoding ASCII `?` / `#` so they reached GitHub as literal `%3F` / `%23` (a raw `&` would even split the body parameter). Report titles and bodies now substitute these characters with full-width lookalikes (`？＃＆＋`), which survive the round trip intact — verified by reproducing the full chain against `vscode-uri`.
- **WSL-aware Config Shortcuts**: The sidebar Rules / MCP / Allowlist buttons now open the file Antigravity actually reads in WSL sessions instead of always targeting the local home directory. With the extension now running inside WSL (see Changed above), Rules and MCP config naturally resolve to the WSL-side `~/.gemini`, while the Browser Allowlist resolves to the Windows-side profile through the drive automount since the browser runs on the Windows host — honoring custom `/etc/wsl.conf` automount roots and non-C system drives. If the extension is forced onto the Windows UI host via a `remote.extensionKind` override, Rules and MCP config are instead resolved through the distro's UNC share (`\\wsl.localhost`, falling back to the legacy `\\wsl$` share on older Windows 10 WSL). Any probe failure safely falls back to the previous local-path behavior.
- **Antigravity 2.x Global Rules Location**: The Rules button now prefers the Antigravity 2.x global rules file `~/.gemini/config/AGENTS.md` (the "Global Customizations Root"), then the legacy `~/.gemini/GEMINI.md`, then the v1.20.3 cross-tool `~/.gemini/AGENTS.md` — opening the first one that exists.
- **Workspace Matching for Paths with Consecutive Special Characters**: The Language Server collapses runs of special characters in a folder path into a single underscore (verified against a live server: `/home/deploy/_projects/antigravity-panel` is announced as `file_home_deploy_projects_antigravity_panel`), while the extension previously generated one underscore per character and therefore failed the strict workspace ID match for such paths. ID normalization now replicates the server's collapsing exactly, restoring the strict Strong Match without accepting any alternative spellings.

## [2.6.3] - 2026-06-28

### Added

- **Language Server Debugging Guide**: Created [DEBUGGING.md](docs/DEBUGGING.md) detailing various methods for local Language Server connection diagnostics, Extension Host debugging, and Protobuf schema / `omitempty` serialization inspection.

### Changed

- **TODO Roadmap Refresh**: Updated [TODO.md](TODO.md) and `TODO_zh.md` to remove completed reliability work and record the remaining P2/P3/P4 code quality tasks from the project review.
- **README / Contributing Split**: Moved contributor workflow details into [CONTRIBUTING.md](CONTRIBUTING.md), kept the contributor list visible in the README files, and clarified that development, debugging, and live Language Server testing target Antigravity IDE.
- **Documentation Accuracy Refresh**: Updated features, disclaimer, localization rules, knowledge graph, and README documentation links to match current thresholds, paths, supported languages, privacy behavior, and test strategy.

### Fixed

- **Omitted Credit Amount Bug**: Implemented robust type validation for user credits. When the Language Server omits the `creditAmount` field (which occurs when the balance is `0` due to Go's `omitempty` behavior), the client now defaults it to `'0'` instead of displaying as `undefined` in the status bar and webview.
- **Runtime Reliability Fixes**: Hardened cache context deletion to avoid prefix-based file removal, serialized quota refresh application to prevent stale responses from overwriting newer state, clamped invalid quota percentages from the Language Server, added reverse protocol fallback for cached HTTP/HTTPS connections, ensured Webview message errors are caught, and added timeouts for CDP auto-accept WebSocket connections.

## [2.6.2] - 2026-06-05

### Added

- **HttpClient & StatusBarManager Tests**: Implemented comprehensive test suites checking local connectivity to the Antigravity Language Server (HttpClient) and checking state/threshold display rendering under various settings configurations (StatusBarManager), increasing total test count to 263.
- **Contributing Guide**: Created `CONTRIBUTING.md` defining project architecture, environment setup, testing requirements, and styling code standards.

### Changed

- **Renamed back to Antigravity Panel**: Reverted display name from "Toolkit for Antigravity" (used since v1.2.0) back to the original **"Antigravity Panel"** for better search discoverability — the extension ID `n2ns.antigravity-panel` and all existing installs are unaffected. Updated Output Channel name, status bar tooltip, and all documentation accordingly.
- **Keywords**: Replaced internal abbreviations (`tfa`, `agp`) with user-facing search terms; added `Antigravity Panel`, `Antigravity IDE`, `Claude`, `GPT`, `Auto Accept`.
- **Icon Redesign**: Replaced the activity bar icon with a new A·P design (red dot between letters) matching the Antigravity Panel rename.

### Fixed

- **CI Runtime**: Pinned GitHub Actions workflows to Node.js 24 to silence deprecation warnings ahead of GitHub's June 16 enforcement deadline.
- **README Accuracy**: Corrected command names throughout documentation to match actual NLS titles (`About`, `Restart Agent Service`, `Reset Status`, `Connectivity Diagnostics`, `Toggle Agent Auto-Accept`); fixed configuration defaults (`warningThreshold` 30%→40%, `criticalThreshold` 10%→20%, polling minimum 60s→30s); removed non-existent `Status Bar Style` setting row.

## [2.6.1] - 2026-06-04

### Added

- **Docs Link in Sidebar**: Added a `📖 Docs` button to the sidebar footer that opens the full README documentation on GitHub. Localized in all 13 supported languages.

### Improved

- **Extension Discoverability**: Added `categories` (`Other`, `Visualization`) and `extensionKind` to `package.json` for better marketplace indexing. Added `bugs` and `qna` fields pointing to GitHub Issues and Discussions.
- **Keywords**: Refined keywords — added `tfa`, `agp`, `AI Usage`, `Usage Monitor`, `Cache Manager`; removed inaccurate `DeepMind` entry.
- **Gallery Banner**: Added dark `galleryBanner` for better visual identity on the marketplace.
- **README**: Improved description in `package.nls.json` for richer full-text search coverage. Updated README intro paragraph with key product terms.
- **Chinese README**: Synced `docs/README_zh.md` intro paragraph with English version; fixed chapter structure (Auto-Accept and Commit Generator sections were misplaced inside the Installation section).
- **FEATURES docs**: Updated test count from 165 to 243 in both `FEATURES.md` and `FEATURES_zh.md`.

## [2.6.0] - 2026-05-23

### Added

- **Instant Startup Connection**: Bypassed startup delay (reduced delay from 30s to 50ms) to display local quota metrics instantly on reload/startup, combined with an expanded background retry cycle (up to 7 retries / 35s window) to gracefully tolerate slow cold boots.
- **Dedicated Integration Test Runner**: Added a new runner script `src/test/runServerTests.ts` to restore functionality to the `npm run test:server` script, allowing developer isolation.

### Fixed

- **Command Stability Architecture**: Refactored `activate()` in `src/extension.ts` to register all contributed commands synchronously in Phase 1 before service initialization in Phase 2. This completely resolves the recurring `command 'tfa.openSettings' not found` and other command-not-found errors during slow boots or handshake failures.
- **vsce Packaging Error**: Aligned devDependency `@types/vscode` version to `^1.104.0` in `package.json` to match `engines.vscode` configuration, satisfying vsce packaging requirements.
- **Italian Localization Audit**: Checked and fully completed Italian NLS files (`package.nls.it.json` and `l10n/bundle.l10n.it.json`). Fixed minor typos in UI translations and corrected refresh rate constraint mismatches.

### Improved

- **Developer Documentation**: Added a comprehensive `## 🏗️ Development & Testing` section to `README.md` outlining developer environment setups, production/watch compilations, unit/integration testing, and `.vsix` packaging.

## [2.5.13] - 2026-03-30

### Fixed

- **Gemini Flash vs Pro Grouping** (#127): Corrected model classification so that Flash models (by ID or label) are never misrouted into the Gemini Pro group. Prefix matching now uses a longest-match-wins strategy with an explicit Flash exclusion guard on the broad `gemini` prefix.
- **Sidebar Title**: Activity bar container title updated to "Antigravity Toolkit".
- **Quota Reset Window** (#128): Replaced the fixed 5-hour prediction window with a dynamic value derived from each model group's actual `resetTime` field. Falls back to 24 h when the API value is unusable.
- **Time Format Extension** (#128): Status-bar and chart runway now format multi-week durations (e.g. `2w 3d`, `~3w`) instead of capping at days.
- **Claude + GPT Shared Pool** (#129): Claude and GPT rows share one backend quota pool. Remaining percentage, reset time, and chart prediction now use the minimum across both groups rather than double-counting.

## [2.5.12] - 2026-02-23

### Added

- **CDP Auto-Accept Fallback**: Added Chrome DevTools Protocol (CDP) injection as a fallback strategy for the auto-accept feature when the command API is unavailable due to webview sandboxing. The command API remains the primary channel.
- **Agent Panel Scope Check**: CDP scripts now require the Antigravity panel container before they can interact with page controls.

### Fixed

- **Usage Chart Overflow** (#99): Fixed usage history graph bars overflowing the container boundary. The height calculation now scales correctly against the actual max value, and the container enforces `overflow: hidden`.
- **CDP Port Standardized**: Changed the debug port from a range scan (8995–9005) to the standard Chromium port `9222`.

### Improved

- **Auto-Accept Safety**: Tightened button matching logic with additional noise filters (`.py` files) and `role="button"` detection. Simplified event bubbling to a single parent level.


## [2.5.11] - 2026-02-01

### Added

- **Absolute Reset Timestamp**: Added a new display format option `resetTimestamp` for the status bar and dashboard, allowing users to see the exact clock time when their quota will reset (e.g., `02/14 14:30`).
- **Collapsible Action Panel**: Added ability to toggle the sidebar footer button panel. Users can now click the "Auto-Accept" row to collapse/expand the toolbar to save vertical space.
- **Full Localization**: Added comprehensive translations for all new features across all 13 supported languages.

### Fixed

- **Windows Process Detection**: Fixed robust parsing for local server discovery on Windows systems. Improved "no_process" error diagnostics by modernizing port detection logic to use `Get-NetTCPConnection`.
- **UI Layout Adaptation**: Fixed an issue where "Feedback" and "Star" buttons would overflow in narrow sidebar views; they now wrap correctly.
- **TypeScript Strictness**: Refactored core UI components (`SidebarApp`, `QuotaPie`, `SidebarFooter`) to ensure 100% type safety.
- **Quick Links Fix**: Resolved a path error that prevented the "Disclaimer" (Info) command from opening correctly.


## [2.5.10] - 2026-01-24
 
### Improved
 
- **Detection Logic**: Enhanced language server discovery with multi-layered detection and shared utilities for higher reliability.

### Fixed
 
- **Multi-root LS Detection**: Resolved an issue where Language Server detection failed in unsaved multi-root workspaces by trusting the Parent Process ID (PPID) relationship for direct child and sibling processes.
- **Activation Stability**: Fixed "server info not available" warnings by removing premature quota refresh calls during extension activation.
- **Quota Data Reliability**: Added a robust NaN check for `resetTime`, ensuring a 24-hour fallback if the server returns an invalid date format.
 
### Improved
 
- **API Performance**: Increased HTTP timeout to 12 seconds to prevent premature failures on slow local network responses.
- **Quota Display**: Enhanced the reset timer to display days (e.g., `5d 13h`) for durations exceeding 24 hours.
- **Default Thresholds**: Updated default quota warning threshold to 40% and critical threshold to 20%.
- **Quota Logs**: Output now includes the user's email address for easier identification.


## [2.5.9] - 2026-01-19

### Fixed

- **WSL2 Mirrored Mode Connectivity**: Fixed a significant connection delay (up to 50s) in WSL2 Mirrored Networking Mode by filtering out the DNS resolver address (`10.255.255.254`), which was incorrectly probed as a host IP.

### Improved

- **Connection Efficiency**: Optimized the language server detection process by tracking verified PIDs. This prevents redundant connection attempts to the same process through different discovery paths.
- **Startup Stability**: Increased initial connection delay to 30 seconds to accommodate slow Language Server initialization (often caused by external Unleash feature flag timeouts).
- **Debug Logging**: Changed `tfa.system.debugMode` default to enabled for better issue diagnostics and troubleshooting.
- **Connection Diagnostics**: Added warning log output when quota refresh fails due to missing server info. The message now appears in the Output Channel with actionable guidance ("Try restarting the IDE or running diagnostics"), helping users diagnose silent refresh failures.

## [2.5.8] - 2026-01-16

### Fixed

- **Usage Chart Data Leakage**: Fixed an issue where the Usage History chart would incorrectly include data from disabled secondary models (e.g., GPT), causing red bars to appear even when `tfa.dashboard.includeSecondaryModels` was set to false.
- **Chart Scaling Optimization**: Improved the scaling logic for the usage chart. The Y-axis scaling is now capped at 25% to ensure that low-usage bars (5-15%) remain visible and are not compressed by historical high-usage peaks. Additionally, a 6px visual headroom is now reserved to prevent bars from hitting the container ceiling.
- **Active Model Detection**: Fixed a logic flaw where disabled models (like GPT) could be incorrectly identified as the "Active" model if their quota consumption rate was higher than the currently used model.

## [2.5.7] - 2026-01-16

### Added

- **Debug Quota Logging**: When `tfa.system.debugMode` is enabled, quota data is now output to the Output Channel on every refresh. Includes user info, credits, and model quota status with raw model IDs for debugging.
- **Quota Parse Error Logging**: When JSON parsing fails or response structure is invalid, the raw response data is logged to help diagnose API changes.

### Changed

- **Refresh Rate Minimum**: Reduced minimum `tfa.dashboard.refreshRate` from 60 seconds to 30 seconds, allowing more responsive quota updates.

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
