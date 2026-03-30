English | [中文文档](docs/README_zh.md)

# Toolkit for Antigravity

> Monitor your AI quota usage and manage cache with ease

[![Antigravity IDE](https://img.shields.io/badge/Antigravity-IDE-4285F4?style=flat)](https://antigravity.google)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/n2ns/antigravity-panel?style=flat&logo=github&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/stargazers)

[![Version](https://img.shields.io/github/v/release/n2ns/antigravity-panel?style=flat&label=version&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/releases)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&label=downloads&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![Last Commit](https://img.shields.io/github/last-commit/n2ns/antigravity-panel?style=flat&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/commits/main)

> 🚀 **Featured in Google AI Blog:** [Where we're going, we don't need chatbots: introducing the Antigravity IDE](https://dev.to/googleai/where-were-going-we-dont-need-chatbots-introducing-the-antigravity-ide-2c3k)


**Toolkit for Antigravity** (formerly *Antigravity Panel*) helps you stay on top of your AI model usage in **Google Antigravity IDE**. Get real-time quota monitoring, usage trends, and cache management—all within an integrated sidebar panel.

## ✨ Features at a Glance

- 🎯 **Quota Monitoring** - Real-time status with visual thresholds
- 📊 **Usage Analytics** - Interactive charts and history tracking
- 🧹 **Cache Management** - Manage AI conversation history and files
- 🎨 **Native Integration** - UI components adapted to IDE themes
- 🌍 **Localization** - Support for 13 languages including runtime notifications
- 🛠️ **Diagnostics** - Built-in connection check and error reporting
- 🤖 **Hands-free Mode** - Auto-accept agent commands for heavy workflows
- ✍️ **AI Commit** - Generate commit messages via Local LLM or Claude
- ⚙️ **Quick Config Access** - One-click editing for Rules, MCP, and Allowlist
- 🔄 **Service Recovery** - Restart, Reset, and Reload tools for Antigravity IDE stability

## 📸 Screenshots

| | |
|:---:|:---:|
| ![Quota Dashboard](assets/preview1.png) | ![Usage Analytics](assets/preview2.png) |\r\n| ![Cache Management](assets/preview3.png) | ![Settings & Config](assets/preview4.png) |

*Real-time quota monitoring, usage trends, and cache management in one place*

## 🚀 Key Features

### 📊 Smart Quota Monitoring

**See your AI usage at a glance**
- Visual quota display grouped by AI model groups (Gemini, Claude, GPT, etc.)
- Status bar shows remaining quota with emoji indicators (🟢🟡🔴) and cache size
- Hover tooltip showing all model quotas and reset times
- Configurable warning (≤30%) and critical (≤10%) thresholds

### 📈 Usage Trends & Analytics

**Understand your consumption patterns**
- Interactive bar charts showing usage over time (10-120 minutes)
- 24-hour history tracking with persistent storage
- Color-coded visualization by AI model group
- 🔥 **Usage Rate**: Real-time consumption speed (%/hour)
- ⏱️ **Runway Prediction**: Estimated time until quota exhaustion

### 💳 Token Credits Tracking

**Monitor your AI usage credits**
- Prompt Credits: Used for conversation input and result generation (reasoning)
- Flow Credits: Used for search, modification, and command execution (operations)
- User info card visibility can be toggled in settings

### 🗂️ Cache Management

**Keep your workspace clean**
- **Brain Tasks**: Browse and delete AI conversation caches
  - See task size, file count, and creation date
  - Preview images, markdown, and code files
  - One-click deletion with automatic cleanup
- **Code Context**: Manage code analysis caches per project
- **Smart Cleanup**: Automatically closes related editor tabs

### 🤖 Auto-Accept (Hands-free Mode)

**Streamline your workflow**
- Automatically accepts Agent-suggested terminal commands and file edits
- Dual strategy: command API (primary) + CDP injection (fallback for sandboxed webviews)
- Toggle on/off via the sidebar "Rocket" switch

> [!IMPORTANT]
> **CDP Fallback Setup:** For the CDP fallback to work, Antigravity must be launched with `--remote-debugging-port=9222`. This is only needed when the command API is unavailable due to webview sandboxing.

**Recommended Setup (Dedicated Launcher):**
Create a script to cleanly kill background instances before launching.

**Windows (Save as `Launch_Antigravity.bat`):**
```bat
@echo off
taskkill /F /IM Antigravity.exe /T 2>nul
start "" "D:\Develop\Antigravity\Antigravity.exe" --remote-debugging-port=9222
```

**macOS/Linux (Save as `launch_antigravity.sh`):**
```bash
#!/bin/bash
pkill -f "Antigravity"
/Applications/Antigravity.app/Contents/MacOS/Electron --remote-debugging-port=9222 &
```

### ✨ Commit Message Generator (Claude)

**Generate conventional commit messages using Claude AI**

A workaround for when the built-in "Generate commit message" feature is unavailable.

**Setup:**
1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Run `Antigravity Toolkit: Set Anthropic API Key`
3. Enter your API key (stored securely, never in plaintext)

**Usage:**
1. Stage your changes with `git add`
2. Run `Antigravity Toolkit: Generate Commit Message (Claude)`
3. The commit message auto-populates in the SCM input box

**Configuration:**
- **Model**: Choose between Claude Sonnet 4, 3.5 Sonnet, or Opus
- **Max Diff Size**: Limit characters sent (default: 80,000)
- **Format**: Conventional commits or simple style

> ⚠️ **Privacy**: Your staged diff is sent to Anthropic's API to generate the message.

### 🔄 Service Recovery Tools

**Built-in troubleshooting**
- **Restart**: Reboots the background Language Server if the Agent is unresponsive
- **Reset**: Clears user status cache to fix stuck quota updates
- **Reload**: Refreshes the VS Code window to resolve UI glitches

### ⚙️ Quick Configuration Access

**One-click shortcuts to important settings**
- Edit Global Rules
- Configure MCP settings
- Manage Browser Allowlist

### 🌐 Works Everywhere

**Cross-platform support**
- ✅ Windows
- ✅ macOS
- ✅ Linux

**Multi-language UI**
- English, 简体中文, 繁體中文, 日本語, Français, Deutsch, Español, Português (Brasil), Italiano, 한국어, Русский, Polski, Türkçe

## 📦 Installation

### Install from Extension Marketplace

1. Open **Antigravity IDE**
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS) to open Extensions
3. Search for `Toolkit for Antigravity`
4. Click **Install**

**Or install from web:**
- [Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

### Manual Install from GitHub Releases

If the marketplace is unavailable or you need a specific version:

1. Download the `.vsix` file from [GitHub Releases](https://github.com/n2ns/antigravity-panel/releases)
2. Open Antigravity IDE → Extensions panel
3. Click `⋯` (More Actions) → `Install from VSIX...`
4. Select the downloaded `.vsix` file

## 🎯 Quick Start

### Step 1: Open the Panel

Click the **Antigravity** icon in the sidebar, or:
- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
- Type `Antigravity Toolkit: Open Panel`
- Press Enter

### Step 2: Monitor Your Quota

- **Pie charts** show quota by model family
- **Hover** over charts to see detailed limits
- **Status bar** displays active model quota and cache size
- **Usage chart** shows consumption trends

### Step 3: Manage Cache

- Expand **Brain** or **Code Tracker** sections
- Click 🗑️ to delete tasks or caches
- Related editor tabs close automatically

> ⚠️ **Note**: Deleting tasks removes conversation history and artifacts permanently.

## 🛠️ Available Commands

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | What it does |
|---------|-------------|
| `Antigravity Toolkit: Open Panel` | Open the sidebar panel |
| `Antigravity Toolkit: Refresh Quota` | Manually refresh quota data |
| `Antigravity Toolkit: Show Cache Size` | Show total cache size notification |
| `Antigravity Toolkit: Clean Cache` | Delete all cache data (use with caution!) |
| `Antigravity Toolkit: Open Settings` | Open extension settings |
| `Antigravity Toolkit: Show Disclaimer` | View privacy and safety disclaimer |
| `Antigravity Toolkit: Restart Language Server` | Restart Antigravity Agent Service |
| `Antigravity Toolkit: Reset User Status` | Reset the status updater |
| `Antigravity Toolkit: Run Diagnostics` | Run connectivity diagnostics |
| `Antigravity Toolkit: Reload Window` | Refresh the webview to resolve UI glitches |
| `Antigravity Toolkit: Toggle Auto-Accept` | Enable/Disable automatic command acceptance |
| `Antigravity Toolkit: Generate Commit Message` | Generate commit message using Local LLM or Claude |
| `Antigravity Toolkit: Set Anthropic API Key` | Configure Anthropic API Key |

## ⚙️ Configuration

Open Settings (`Ctrl+,` / `Cmd+,`) in Antigravity IDE and search for `tfa` to customize:

### 📊 Quota Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Polling Interval** | `90s` | How often to refresh quota (min: 60s) |
| **Show Quota** | `✓` | Display quota in status bar |
| **Status Bar Style** | `percentage` | Display mode: percentage, resetTime, used, or remaining |
| **Quota Style** | `semi-arc` | Visualization style: `semi-arc` or `classic-donut` |
| **Visualization Mode** | `groups` | Show dashboard by `groups` or `models` |
| **UI Scale** | `1.0` | Global scale factor for panel elements (0.8 to 2.0) |
| **Show GPT Quota** | `✗` | Whether to display GPT family models in the panel |
| **History Range** | `90 min` | Time range for usage chart (10-120 minutes) |
| **Warning Threshold** | `30%` | Status bar turns warning color at this level |
| **Critical Threshold** | `10%` | Status bar turns critical color at this level |

### 💾 Cache Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Show Cache Size** | `✓` | Display cache size in status bar |
| **Check Interval** | `120s` | How often to check cache size (30-600s) |
| **Warning Threshold** | `500 MB` | Status bar color warning when exceeded |
| **Hide Empty Folders** | `✗` | Hide empty folders in Brain and Code Tracker trees |
| **Auto Clean** | `✗` | Automatically clean cache when exceeded |
| **Auto Clean Keep Count** | `5` | Number of newest tasks to keep during auto-clean (1-50) |

### 🔧 Advanced Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Server Host** | `127.0.0.1` | Address of Antigravity Language Server |
| **API Path** | `/exa...` | gRPC-Web path for User Status |
| **Debug Mode** | `✗` | Enable verbose logging in Output panel |



### 🤖 Commit Message Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Endpoint** | `http://localhost...` | API URL (Ollama, Anthropic, OpenAI compatible) |
| **Model** | `llama3.2` | Model name (e.g. `llama3.2`, `claude-3-haiku`) |
| **Max Diff Size** | `80000` | Max characters of diff to send to LLM |
| **Format** | `conventional` | Message format (`conventional` or `simple`) |

## 🔒 Privacy & Safety Disclaimer

**Your data stays yours.**

Toolkit for Antigravity does not collect, transmit, or store any user data. All operations are performed locally on your machine. The extension only communicates with local components—nothing is sent to external servers.

**Experimental Feature Notice:**
The *Smart Quota Monitoring* feature relies on internal metrics exposed by the local Antigravity environment. This functionality is experimental and provided "as-is" to help users better understand their personal usage. It is not an official Google product and may be subject to changes in future IDE updates.

## 🤝 Contributing

We welcome contributions! If you find this toolkit helpful, please give us a **Star** 🌟 on GitHub! It's the best way to support our work and help others discover it.

Here's how you can help:

1. **Report bugs**: [Open an issue](https://github.com/n2ns/antigravity-panel/issues)
2. **Suggest features**: [Start a discussion](https://github.com/n2ns/antigravity-panel/discussions)
3. **Submit code**: Fork, code, test, and [open a PR](https://github.com/n2ns/antigravity-panel/pulls)

For major changes, please open an issue first to discuss your ideas.

## 🤝 Contributors

Special thanks to our community contributors:

*   [**@iskisraell**](https://github.com/iskisraell) - Windows platform stability fixes (v2.5.6).
*   [**@simbaTmotsi**](https://github.com/simbaTmotsi) - Local LLM Commit Message Generator.
*   [**@A-vrice**](https://github.com/A-vrice) - Japanese localization.
*   [**@restinnotes**](https://github.com/restinnotes) - CDP Auto-Accept implementation.
*   [**@AMDphreak**](https://github.com/AMDphreak) - Sidebar title fix, Gemini Flash/Pro grouping, quota reset window alignment with API cycles, and Claude+GPT shared pool display.

## 🌐 Localization Policy

To ensure technical consistency and professional standard across all 13 supported languages:
- **UI Labels & Technical Terms**: Remain in **English** (e.g., `Rules`, `MCP`, `Auto-Accept`, `Reset Status`).
- **Tooltips & Descriptions**: Fully **localized** to provide detailed explanations in the user's native language.

For more details, see [LOCALIZATION_RULES.md](docs/LOCALIZATION_RULES.md).

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).


---

<div align="center">

**Developed by [datafrog.io](https://datafrog.io)**



*For Antigravity. By Antigravity.*

</div>
