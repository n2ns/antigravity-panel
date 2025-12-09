English | [中文文档](README_zh.md)

# Antigravity Panel

> Monitor your AI quota usage and manage cache with ease

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/visual-studio-marketplace/v/n2ns.antigravity-panel?style=flat&label=version)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Downloads](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat)](https://open-vsx.org/extension/n2ns/antigravity-panel)

**Antigravity Panel** helps you stay on top of your AI model usage in **Google Antigravity IDE**. Get real-time quota monitoring, usage trends, and powerful cache management—all in one beautiful sidebar panel.

## ✨ Why Antigravity Panel?

- 🎯 **Never run out of quota** - Real-time monitoring with visual warnings
- 📊 **Understand your usage** - Interactive charts showing 24-hour trends
- 🧹 **Keep things clean** - Manage AI conversation caches with one click
- 🎨 **Beautiful UI** - Native theme integration
- 🌍 **Speaks your language** - Available in 11 languages

## 📸 Screenshots

![Antigravity Panel Interface](assets/preview.png)

*Real-time quota monitoring, usage trends, and cache management in one place*

## 🚀 Key Features

### 📊 Smart Quota Monitoring

**See your AI usage at a glance**
- Visual quota display grouped by model families (Gemini, Claude, GPT, etc.)
- Status bar shows remaining quota and cache size
- Color-coded warnings when quota runs low
- Automatic connection to local Antigravity Language Server

### 📈 Usage Trends & Analytics

**Understand your consumption patterns**
- Interactive bar charts showing usage over time (10-120 minutes)
- 24-hour history tracking with persistent storage
- Color-coded visualization by model family
- Predict when you'll run out of quota

### 🗂️ Powerful Cache Management

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
3. Search for `Antigravity Panel`
4. Click **Install**

**Or install from web:**
- [Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

## 🎯 Quick Start

### Step 1: Open the Panel

Click the **Antigravity** icon in the sidebar, or:
- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
- Type `Antigravity Panel: Open Panel`
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
| `Antigravity Panel: Open Panel` | Open the sidebar panel |
| `Antigravity Panel: Refresh Quota` | Manually refresh quota data |
| `Antigravity Panel: Show Cache Size` | Show total cache size notification |
| `Antigravity Panel: Clean Cache` | Delete all cache data (use with caution!) |

## ⚙️ Configuration

Open Settings (`Ctrl+,` / `Cmd+,`) in Antigravity IDE and search for `gagp` to customize:

### 📊 Quota Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Polling Interval** | `120s` | How often to refresh quota (min: 60s, recommended: 120s) |
| **Show Quota** | `✓` | Display quota in status bar |
| **Visualization Mode** | `groups` | Show by `groups` (Gemini, Claude, etc.) or `models` (individual) |
| **Warning Threshold** | `30%` | Show warning when quota drops below this |
| **Critical Threshold** | `10%` | Show critical alert when quota drops below this |
| **History Range** | `60 min` | Time range for usage chart (10-120 minutes) |

### 💾 Cache Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Show Cache Size** | `✓` | Display cache size in status bar |

## 🔒 Privacy

**Your data stays yours.**

Antigravity Panel does not collect, transmit, or store any user data. All operations are performed locally on your machine. The extension only communicates with your local Antigravity Language Server—nothing is sent to external servers.

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Report bugs**: [Open an issue](https://github.com/n2ns/antigravity-panel/issues)
2. **Suggest features**: [Start a discussion](https://github.com/n2ns/antigravity-panel/discussions)
3. **Submit code**: Fork, code, test, and [open a PR](https://github.com/n2ns/antigravity-panel/pulls)

For major changes, please open an issue first to discuss your ideas.

## 📄 License

[MIT License](LICENSE) - feel free to use this extension in your projects!

---

<div align="center">

**Made with ❤️ by [n2n studio](https://github.com/n2ns)**

[Report Bug](https://github.com/n2ns/antigravity-panel/issues) · [Request Feature](https://github.com/n2ns/antigravity-panel/issues) · [Documentation](https://github.com/n2ns/antigravity-panel/wiki)

</div>
