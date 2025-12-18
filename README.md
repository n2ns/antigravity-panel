English | [中文文档](README_zh.md)

## 🔥 Now supporting Google's latest Gemini 3 Flash! Feedback welcome!

# Toolkit for Antigravity

> Monitor your AI quota usage and manage cache with ease

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat&cacheSeconds=10800)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.104.0-007ACC?logo=visual-studio-code&style=flat&cacheSeconds=10800)](https://code.visualstudio.com/)

[![Version](https://img.shields.io/visual-studio-marketplace/v/n2ns.antigravity-panel?style=flat&label=version&cacheSeconds=10800)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat&cacheSeconds=10800)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Open VSX Version](https://img.shields.io/open-vsx/v/n2ns/antigravity-panel?style=flat&label=open%20vsx&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![Downloads](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![Last Commit](https://img.shields.io/github/last-commit/n2ns/antigravity-panel?style=flat&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/commits/main)

**Toolkit for Antigravity** (formerly *Antigravity Panel*) helps you stay on top of your AI model usage in **Google Antigravity IDE**. Get real-time quota monitoring, usage trends, and cache management—all within an integrated sidebar panel.

> **📢 Notice:** We have renamed from "Antigravity Panel" to "**Toolkit for Antigravity**" to better reflect our vision of building a comprehensive utility suite for the ecosystem. Same great features, just a more accurate name!

## ✨ Why Toolkit for Antigravity?

- 🎯 **Track your quota** - Real-time monitoring with visual warnings
- 📊 **Understand your usage** - Interactive charts showing usage trends
- 🧹 **Keep things clean** - Manage AI conversation caches with one click
- 🎨 **Elegant Interface** - Native theme integration with refined UI components
- 🌍 **Full Localization** - Support for 11 languages with runtime i18n notifications
- 🛠️ **Intelligent Diagnostics** - Built-in feedback system with automatic error reporting

## 📸 Screenshots

![Toolkit Interface](assets/preview.png)

*Real-time quota monitoring, usage trends, and cache management in one place*

## 🚀 Key Features

### 📊 Smart Quota Monitoring

**See your AI usage at a glance**
- Visual quota display grouped by model families (Gemini, Claude, GPT, etc.)
- Status bar shows remaining quota and cache size
- Color-coded warnings when quota runs low

### 📈 Usage Trends & Analytics

**Understand your consumption patterns**
- Interactive bar charts showing usage over time (10-120 minutes)
- 24-hour history tracking with persistent storage
- Color-coded visualization by model family
- 🔥 **Usage Rate**: Real-time consumption speed (%/hour)
- ⏱️ **Runway Prediction**: Estimated time until quota exhaustion

### 🗂️ Cache Management

**Keep your workspace clean**
- **Brain Tasks**: Browse and delete AI conversation caches
  - See task size, file count, and creation date
  - Preview images, markdown, and code files
  - One-click deletion with automatic cleanup
- **Code Context**: Manage code analysis caches per project
- **Smart Cleanup**: Automatically closes related editor tabs

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
- English, 简体中文, 繁體中文, 日本語, Français, Deutsch, Español, Português (Brasil), Italiano, 한국어, Русский

## 📦 Installation

### Install from Extension Marketplace

1. Open **Antigravity IDE**
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS) to open Extensions
3. Search for `Toolkit for Antigravity`
4. Click **Install**

**Or install from web:**
- [Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

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

## ⚙️ Configuration

Open Settings (`Ctrl+,` / `Cmd+,`) in Antigravity IDE and search for `gagp` to customize:

### 📊 Quota Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Polling Interval** | `120s` | How often to refresh quota (min: 60s) |
| **Show Quota** | `✓` | Display quota in status bar |
| **Status Bar Style** | `percentage` | Display mode: percentage, resetTime, used, or remaining |
| **Visualization Mode** | `groups` | Show dashboard by `groups` or `models` |
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
| **Auto Clean** | `✗` | Automatically clean cache when exceeded (keeps newest 5) |

### 🔧 Advanced Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Server Host** | `127.0.0.1` | Address of Antigravity Language Server |
| **API Path** | `/exa...` | gRPC-Web path for User Status |
| **Debug Mode** | `✗` | Enable verbose logging in Output panel |

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

## 📄 License

[MIT License](LICENSE) - feel free to use this extension in your projects!

---

## 📚 Documentation

- [Features](docs/FEATURES.md) - Complete feature list
- [Changelog](CHANGELOG.md) - Version history
- [TODO](docs/TODO.md) - Planned features

---

<div align="center">

**Made with ❤️ by [n2n studio](https://github.com/n2ns)**

[Feedback & Support](https://github.com/n2ns/antigravity-panel/issues) · [Documentation](https://github.com/n2ns/antigravity-panel/wiki)

</div>
