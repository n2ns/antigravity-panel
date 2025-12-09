English | [中文文档](README_zh.md)

# Antigravity Panel

> Cache and Quota Management Extension for Google Antigravity IDE

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/n2ns.antigravity-panel?style=flat&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Open VSX Version](https://img.shields.io/open-vsx/v/n2ns/antigravity-panel?style=flat&logo=open-vsx)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&logo=open-vsx)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.104.0-blue)](https://code.visualstudio.com/)

**Antigravity Panel** is a VS Code extension that integrates with the local Antigravity Language Server. It provides real-time visualization of AI model quota usage and management tools for file system caches generated during AI sessions.

## Features

### Quota Monitoring
- **Grouped Visualization**: Displays quota usage by model families (Gemini, Claude, GPT) using configurable grouping strategies
- **Real-time Updates**: Automatically detects and connects to the local Antigravity Language Server
- **Status Bar Integration**: Shows active model's remaining quota and total cache size in the IDE status bar
- **Configurable Thresholds**: Visual warnings when quota drops below customizable thresholds

### Usage History & Trends
- **Interactive Bar Chart**: Visualizes quota consumption over configurable time ranges (10-120 minutes)
- **24-Hour History**: Tracks and persists quota usage data for trend analysis
- **Color-Coded Groups**: Differentiates model families using theme colors from `quota_strategy.json`
- **Stacked Visualization**: Shows multi-group usage in a single chart

### Cache & Task Management
- **Brain Task Explorer**: Browse and manage AI conversation tasks stored in `~/.gemini/antigravity/brain/`
  - View task metadata (size, file count, creation date)
  - Expand tasks to see contained files (images, markdown, code)
  - Delete individual tasks with automatic cleanup
- **Code Context Cache**: Manage code analysis caches in `~/.gemini/antigravity/code_tracker/active/`
  - View cache size per project
  - Delete specific project caches
- **Smart Cleanup**: Automatically closes related editor tabs and preview windows when deleting tasks or files

### Configuration Shortcuts
- Quick access to **Global Rules** (`~/.gemini/GEMINI.md`)
- Quick access to **MCP Configuration** (`~/.gemini/mcp.json`)
- Quick access to **Browser Allowlist** (`~/.gemini/browser_allowlist.json`)

### Cross-Platform Support
- Windows (PowerShell/WMIC-based process detection)
- macOS (ps/lsof-based process detection)
- Linux (ps/lsof-based process detection)

### Multi-language Support
- **Full Localization**: Configuration UI and commands available in 11 languages:
  - English, Simplified Chinese, Traditional Chinese, Japanese, French, German
  - Spanish, Portuguese (Brazil), Italian, Korean, Russian

## Interface

![Interface Preview](assets/preview.png)

## Installation

### Installation

**Visual Studio Marketplace** & **Open VSX Registry**
Search for `Antigravity Panel` in your IDE's Extensions view (`Ctrl+Shift+X`) to install.

Alternatively, you can install from the web:
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

### From Source
```bash
git clone https://github.com/n2ns/antigravity-panel.git
cd antigravity-panel
npm install
npm run build
```

## Usage

1.  **Open Panel**: Click the Antigravity icon in the sidebar or execute `Antigravity Panel: Open Panel`.
2.  **View Quota**: Hover over pie charts to see specific model limits.
3.  **Manage Cache**:
    *   Expand **Brain** or **Code Tracker** sections to view items.
    *   Click the trash icon 🗑️ to delete tasks or context caches.
    *   *Deletion removes associated conversation history and artifacts.*

### Commands
| Command | Description |
|---------|-------------|
| `Antigravity Panel: Open Panel` | Opens the sidebar webview. |
| `Antigravity Panel: Clean Cache` | Removes all cache data (Brain + Contexts). |
| `Antigravity Panel: Refresh Quota` | Triggers a data fetch for quota and cache. |
| `Antigravity Panel: Show Cache Size` | Displays current total cache size via notification. |

## Configuration

Settings can be modified in VS Code Settings (`Ctrl+,` or `Cmd+,`) under the `gagp` prefix.

### Quota Settings

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `gagp.pollingInterval` | `120` | 60-∞ | Auto-refresh interval in seconds (minimum: 60s, recommended: 120s to reduce server load) |
| `gagp.showQuota` | `true` | - | Show quota information in the status bar |
| `gagp.visualizationMode` | `groups` | - | Sidebar display mode: `groups` (grouped by category) or `models` (individual models) |
| `gagp.quotaWarningThreshold` | `30` | 5-100 | Show warning color when quota falls below this percentage |
| `gagp.quotaCriticalThreshold` | `10` | 1-50 | Show critical color when quota falls below this percentage |
| `gagp.historyDisplayMinutes` | `60` | 10-120 | Time range for usage history chart in minutes |

### Cache Settings

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `gagp.showCacheSize` | `true` | - | Display Antigravity IDE cache size in the status bar |

**Removed Settings** (not implemented):
- `gagp.quotaDisplayStyle` — Status bar always displays percentage format
- `gagp.autoCleanCache` — Automatic cleanup feature not implemented
- `gagp.cacheWarningThreshold` — Cache warning feature not implemented

### Debug Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gagp.debugMode` | `false` | Enable debug mode: show raw model IDs in UI and output detailed logs to 'Antigravity Panel' channel (View > Output) |

**How to enable debug logs:**
1. Open VS Code Settings → Search for `gagp.debugMode`
2. Enable the checkbox
3. Open Output panel: `View` → `Output` (or `Ctrl+Shift+U` / `Cmd+Shift+U`)
4. Select `Antigravity Panel` from the dropdown
5. View detailed debug logs including HTTP requests, server responses, and quota aggregation

## Technical Architecture

### Core Components
- **Process Detection**: Cross-platform strategy pattern for detecting Antigravity Language Server processes
- **HTTP Client**: Automatic HTTPS→HTTP fallback with protocol caching for self-signed certificates
- **Quota Manager**: Factory-based initialization with retry logic and error handling
- **Scheduler**: Unified task scheduling system for polling and data refresh
- **History Manager**: 24-hour quota usage tracking with persistent storage (VS Code GlobalState)

### UI Layer
- **Framework**: LitElement 3.3 (Web Components) with MVVM architecture
- **Components**: Modular components (quota-pie, usage-chart, folder-tree, etc.)
- **Styling**: VS Code native CSS variables for theme compatibility
- **Communication**: Message passing between Extension Host and Webview

### Configuration
- **Strategy-Driven**: Model grouping defined in `src/config/quota_strategy.json`
- **Extensible**: Easy to add new model families or customize grouping rules

## Directory Structure

| Directory | Content |
|-----------|---------|
| `~/.gemini/antigravity/brain/` | Task artifacts and conversation history. |
| `~/.gemini/antigravity/conversations/` | Protobuf conversation logs. |
| `~/.gemini/antigravity/code_tracker/active/` | Code context analysis cache. |
| `~/.gemini/GEMINI.md` | Global Rules configuration. |

## Development

### Project Structure
```
src/
├── core/           # Business logic (QuotaManager, CacheManager, Scheduler, etc.)
├── ui/             # Webview provider and HTML builder
│   └── webview/    # LitElement components
├── utils/          # Utilities (HTTP client, retry, formatting, etc.)
└── config/         # Configuration files (quota_strategy.json)
```

### Build from Source
```bash
git clone https://github.com/n2ns/antigravity-panel.git
cd antigravity-panel
npm install
npm run build        # Build extension and webview
npm run watch        # Watch mode for development
npm test             # Run all unit tests
```

### Testing

The project has **113 unit tests** covering ~50% of the codebase. All tests run in pure Node.js environment without requiring VS Code Extension Host, making them fast (~5 seconds) and suitable for CI/CD.

All tests use Mock objects and don't require a running Antigravity IDE instance.

See `docs/TODO.md` for planned improvements and known issues.

## Contributing

Contributions are welcome! Please feel free to submit Pull Requests.

For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT License](LICENSE)
