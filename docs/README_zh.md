[English](../README.md) | 中文文档

<p align="center">
  <img src="../assets/icon.png" width="128" alt="Antigravity Panel">
</p>

# Antigravity Panel

> 实时 AI 配额监控和缓存管理工具，专为 **Google Antigravity IDE** 设计 — 追踪 Gemini、Claude 和 GPT 使用情况，可视化消费趋势，并在一个集成侧边栏面板中管理对话缓存。

[![Antigravity IDE](https://img.shields.io/badge/Antigravity-IDE-4285F4?style=flat)](https://antigravity.google)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../LICENSE)
[![Stars](https://img.shields.io/github/stars/n2ns/antigravity-panel?style=flat&logo=github&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/stargazers)

[![GitHub 版本](https://img.shields.io/github/v/release/n2ns/antigravity-panel?style=flat&label=%E7%89%88%E6%9C%AC&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/releases)
[![Open VSX 下载量](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&label=%E4%B8%8B%E8%BD%BD%E9%87%8F&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![最后更新](https://img.shields.io/github/last-commit/n2ns/antigravity-panel?style=flat&label=%E6%9C%80%E5%90%8E%E6%9B%B4%E6%96%B0&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/commits/main)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/n2ns?label=Sponsor&logo=githubsponsors&color=ea4aaa&style=flat)](https://github.com/sponsors/n2ns)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-bugstan-FF5E5B?logo=kofi&logoColor=white&style=flat)](https://ko-fi.com/bugstan)

> 🚀 **获 Google AI 官方博客推荐:** [Where we're going, we don't need chatbots: introducing the Antigravity IDE](https://dev.to/googleai/where-were-going-we-dont-need-chatbots-introducing-the-antigravity-ide-2c3k)


**Antigravity Panel** 帮助你掌控 **Google Antigravity IDE** 中的 AI 模型使用情况。实时配额监控、用量趋势分析、缓存管理——一切均可在一个集成的侧边栏面板中完成。

## ✨ 功能概览

- 🎯 **配额监控** - 实时展示配额状态与阈值警告
- 📊 **用量统计** - 可视化展示使用趋势与历史记录
- 🧹 **缓存管理** - 快速清理 AI 对话历史与缓存文件
- 🎨 **原生集成** - 适配 IDE 主题的 UI 组件设计
- 🌍 **多语言支持** - 支持 15 种语言，包括界面和运行时通知
- 🛠️ **连接诊断** - 内置连接检查和错误报告工具
- 🤖 **无人值守模式** - 自动接受 Agent 命令，加速繁重的工作流
- ✍️ **智能提交** - 使用本地 LLM 或 Claude 自动生成提交信息
- ⚙️ **配置快捷访问** - 一键编辑 Rules、MCP 和浏览器白名单
- 🔄 **服务恢复** - 内置重启、重置与刷新工具，确保 Antigravity IDE 稳定运行

## 📸 界面预览

| | |
|:---:|:---:|
| ![配额仪表盘](../assets/preview1.png) | ![用量分析](../assets/preview2.png) |
| ![缓存管理](../assets/preview3.png) | ![设置与配置](../assets/preview4.png) |

*实时配额监控、用量趋势和缓存管理，一目了然*

## 🚀 核心功能

### 📊 智能配额监控

**一眼掌握 AI 使用情况**
- 默认按服务商定义的配额池显示；模型视图仍保留单模型身份
- 状态栏显示剩余配额、Emoji 状态指示器（🟢🟡🔴）和缓存大小，并在配额连接失败时切换为警告状态
- 悬停提示显示所有模型配额和重置时间
- 可配置的警告阈值（≤40%）和严重阈值（≤20%）

### 📈 用量趋势分析

**了解你的消费模式**
- 交互式柱状图展示服务器上报的时间段配额变化（10-120 分钟），并自适应聚合为最多约 24 个易读时间区间；记录到第一笔正向变化前卡片保持隐藏
- 24 小时历史记录持久化存储
- 按配额池进行颜色编码，悬停可查看时间与各池变化明细
- 🔥 **消耗速率**: 每小时平均消耗的配额百分点（pp/h）
- ⏱️ **耗尽预测**: 预计配额耗尽时间

### 💳 Token 积分追踪

**监控你的 AI 使用积分**
- Prompt 积分：用于对话输入和结果生成（推理）
- Flow 积分：用于搜索、修改和命令执行（操作）
- 静态的 Prompt/Flow 行默认隐藏；Google One AI 订阅额度始终显示，可通过 `tfa.dashboard.showCreditsCard` 恢复前两行

### 🗂️ 缓存管理

**保持工作区整洁**
- **Brain 任务**: 浏览和删除 AI 对话缓存
  - 查看任务大小、文件数和创建日期
  - 预览图片、Markdown 和代码文件
  - 一键删除并自动清理
- **代码上下文**: 按项目管理代码分析缓存
- **智能清理**: 自动关闭相关编辑器标签页

### 🤖 自动接受 (Hands-free Mode)

**简化你的工作流程**
- 自动接受 Agent 建议的终端命令和文件修改
- 优先使用 IDE 已注册命令；扩展 API 无法触及的面板控件则由限定作用域的 CDP 路径处理
- 运行时命令发现：根据当前 IDE 实际注册的命令匹配 Antigravity 1.x/2.x 的不同命令 ID，IDE 升级后仍能使用命令策略
- 按配置的间隔执行检查；每轮 CDP 都重新定位并扫描当前 Agent Panel 一次，不在页面中保留观察器或定时器，仅以短期 DOM 节点时间戳避免立即重复点击
- CDP 交互会把疑似破坏性操作留给用户手动检查。**限制：**命令 API 无法读取待执行命令文本，因此不受此检查保护。Auto-Accept 仍是信任 Agent 的功能；处理不可信或可能遭受 prompt injection 的任务时应保持关闭
- 通过侧边栏 "小火箭" 开关开启/关闭

> [!IMPORTANT]
> **CDP 回退设置：** 当命令 API 因 Webview 沙箱化不可用时，需要使用 `--remote-debugging-port=9222` 启动 Antigravity。

**推荐设置（专用启动器）：**
创建脚本以在启动前清理后台实例。

**Windows（保存为 `Launch_Antigravity.bat`）：**
```bat
@echo off
taskkill /F /IM Antigravity.exe /T 2>nul
start "" "D:\Develop\Antigravity\Antigravity.exe" --remote-debugging-port=9222
```

**macOS/Linux（保存为 `launch_antigravity.sh`）：**
```bash
#!/bin/bash
pkill -f "Antigravity"
/Applications/Antigravity.app/Contents/MacOS/Electron --remote-debugging-port=9222 &
```

### ✨ 提交信息生成器 (Commit Message Generator)

**使用本地 LLM 或 Claude 生成约定式提交信息**

这是当内置 "Generate commit message" 功能不可用时的一个有力补充。

**配置步骤：**
1. 如使用 Claude，从 [Anthropic Console](https://console.anthropic.com/) 获取 API Key
2. 运行命令 `Antigravity Panel: Set Anthropic API Key`
3. 输入你的 API Key (安全存储)

**使用方法：**
1. 使用 `git add` 暂存更改
2. 运行命令 `Antigravity Panel: Generate Commit Message (Local & Claude)`
3. 提交信息将自动填充到源代码管理输入框中

**配置选项：**
- **模型**: 选择本地 Ollama 模型，或 Claude/OpenAI 兼容模型
- **最大 Diff 大小**: 限制发送的字符数 (默认: 80,000)
- **格式**: Conventional commits (约定式) 或 Simple (简单) 风格

> ⚠️ **隐私提示**: 你的暂存 Diff 会发送到你配置的 LLM 端点。如果不希望 Diff 发送给外部服务，请使用本地端点。

### ⚙️ 快速配置访问

**一键访问重要设置**
- 编辑全局规则
- 配置 MCP 设置
- 管理浏览器白名单

### 🔄 服务恢复工具

**内置故障排除功能**
- **Restart**: 当 Agent 无响应时，重启后台语言服务（解决分析进度卡住）
- **Reset**: 清除状态缓存，修复配额显示不更新的问题
- **Reload**: 刷新 Antigravity IDE 窗口，解决界面显示异常或无响应


### 🌐 全平台支持

**跨平台兼容**
- ✅ Windows
- ✅ macOS
- ✅ Linux

**多语言界面**
- English, 简体中文, 繁體中文, 日本語, Français, Deutsch, Español, Português (Brasil), Italiano, 한국어, Русский, Polski, Türkçe, Tiếng Việt

## 📦 安装

### 从扩展市场安装

1. 打开 **Antigravity IDE**
2. 按 `Ctrl+Shift+X`（Windows/Linux）或 `Cmd+Shift+X`（macOS）打开扩展面板
3. 搜索 `Antigravity Panel`
4. 点击 **安装**

**或从网页安装：**
- [扩展市场](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

### 从 GitHub Releases 手动安装

如果扩展市场无法访问，或需要安装特定版本：

1. 从 [GitHub Releases](https://github.com/n2ns/antigravity-panel/releases) 下载 `.vsix` 文件
2. 打开 Antigravity IDE → 扩展面板
3. 点击 `⋯`（更多操作）→ `从 VSIX 安装...`
4. 选择下载的 `.vsix` 文件

版本历史和发布说明请参阅[更新日志](CHANGELOG_zh.md)。

## 🎯 快速开始

### 第一步：打开面板

点击侧边栏的 **Antigravity** 图标，或者：
- 按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
- 输入 `Antigravity Panel: Open Panel`
- 按回车

### 第二步：监控配额

- **饼图** 对每个共享配额池只显示一次；模型视图仍保留单模型
- **悬停** 在图表上查看详细限制
- **状态栏** 显示活跃模型配额和缓存大小
- **用量图表** 展示消费趋势

### 第三步：管理缓存

- 展开 **Brain** 或 **Code Tracker** 部分
- 点击 🗑️ 删除任务或缓存
- 相关编辑器标签页自动关闭

> ⚠️ **注意**：删除任务将永久移除对话历史和相关文件。

## 🛠️ 可用命令

打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）并搜索：

| 命令 | 功能 |
|------|------|
| `Antigravity Panel: Open Panel` | 打开侧边栏面板 |
| `Antigravity Panel: Refresh Quota` | 手动刷新配额数据 |
| `Antigravity Panel: Show Cache Size` | 显示缓存总大小通知 |
| `Antigravity Panel: Clean Cache` | 删除所有缓存数据（谨慎使用！）|
| `Antigravity Panel: Open Settings` | 打开扩展设置 |
| `Antigravity Panel: About` | 查看隐私与安全免责声明 |
| `Antigravity Panel: Restart Agent Service` | 重启 Antigravity 代理服务 |
| `Antigravity Panel: Reset Status` | 重置状态更新器 |
| `Antigravity Panel: Connectivity Diagnostics` | 运行连接诊断 |
| `Antigravity Panel: Show Logs` | 打开输出面板日志 |
| `Antigravity Panel: Toggle Agent Auto-Accept` | 开启/关闭自动接受命令模式 |
| `Antigravity Panel: Generate Commit Message (Local & Claude)` | 使用本地 LLM 或 Claude 生成提交信息 |
| `Antigravity Panel: Set Anthropic API Key` | 设置 Anthropic API 密钥 |

## ⚙️ 配置选项

在 Antigravity IDE 设置（`Ctrl+,` / `Cmd+,`）中搜索 `tfa` 进行自定义：

### 📊 配额设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **轮询间隔** | `90秒` | 刷新配额的频率（最小 30 秒） |
| **显示配额** | `✓` | 在状态栏显示配额信息 |
| **仪表盘样式** | `semi-arc` | 模型配额呈现样式：`semi-arc`（半圆弧）或 `classic-donut`（经典圆环） |
| **可视化模式** | `groups` | 仪表盘按 `groups`（分组）或 `models`（单个模型）显示 |
| **UI 缩放** | `1.0` | 面板元素的全局缩放比例（0.8 到 2.0） |
| **显示用户信息卡片** | `✓` | 在侧边栏显示用户邮箱和订阅等级 |
| **显示 Prompt/Flow Credits** | `✗` | 显示静态的 Prompt/Flow 行；Google One AI 始终显示 |
| **显示 GPT 配额** | `✗` | 是否在面板中显示 GPT 系列模型的配额 |
| **历史范围** | `90 分钟` | 用量图表的时间范围（10-120 分钟） |
| **警告阈值** | `40%` | 配额低于此值时，状态栏变色提醒（警告） |
| **严重阈值** | `20%` | 配额低于此值时，状态栏变色提醒（严重错误） |

### 💾 缓存设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **显示缓存大小** | `✓` | 在状态栏显示缓存大小 |
| **检查间隔** | `120秒` | 检查缓存大小的频率（30-600秒） |
| **警告阈值** | `500 MB` | 缓存超过此大小时状态栏显示警告颜色 |
| **隐藏空目录** | `✗` | 在 Brain 和 Code Tracker 树中隐藏空目录 |
| **自动清理** | `✗` | 是否在缓存过大时执行静默清理 |
| **保留任务数** | `5` | 自动清理时保留最新任务的数量（1-50） |

### 🔧 高级设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **服务器主机** | `127.0.0.1` | Antigravity 语言服务器的地址 |
| **API 路径** | `/exa...` | 获取用户状态的 gRPC-Web 路径 |
| **Auto-Accept** | `✗` | 开启无人值守的 Agent 操作自动接受 |
| **Auto-Accept 间隔** | `800ms` | Auto-Accept 轮询间隔（200-5000ms） |
| **调试模式** | `✗` | 开启后在输出面板显示详细的调试日志 |



### 🤖 提交信息设置 (Commit Message)

| 配置项 (`ID`) | 默认值 | 说明 |
| :--- | :--- | :--- |
| **API 端点** | `http://localhost...` | API 端点 URL。支持 Ollama, Anthropic 或 OpenAI 兼容地址。 |
| **模型名称** | `llama3.2` | 使用的模型名称 (如 `llama3.2`, `claude-3-haiku`)。 |
| **最大 Diff 大小**| `80000` | 发送给 LLM 的 Diff 最大字符数限制。 |
| **提交格式** | `conventional` | 提交信息格式 (`conventional` 或 `simple`)。 |

## 🔒 隐私与安全免责声明

**你的数据由你掌控。**

Antigravity Panel 不会收集或存储分析数据。配额、缓存、诊断和核心面板功能均与本机 Antigravity IDE 组件通信。可选的提交信息生成器只会把暂存 Diff 发送到你配置的 LLM 端点，该端点可以是本地服务，也可以是外部服务。

**实验性功能提示：**
本扩展的“智能配额监控”功能依赖于本地 Antigravity 环境所暴露的内部指标。该功能属于实验性质，仅按“原样”提供，旨在帮助用户更好地了解个人资源使用情况。它不是 Google 的官方产品，并且在未来的 IDE 更新中可能会发生变化。

## 🤝 参与贡献

欢迎贡献。开发、调试和测试必须在 **Antigravity IDE** 中进行，并确保本地 Antigravity Language Server 可用。推荐使用 Node.js 24+ 和 npm 进行本地构建。

开发环境、Extension Host 调试、测试命令、代码规范、本地化规则、打包和 PR 流程请参考 [CONTRIBUTING.md](../CONTRIBUTING.md)。

如果你觉得这个工具有所帮助，请在 GitHub 上给我们一个 **Star** 🌟！这是对我们最大的支持和鼓励。

你可以：

1. **报告问题**：[提交 Issue](https://github.com/n2ns/antigravity-panel/issues)
2. **建议功能**：[发起讨论](https://github.com/n2ns/antigravity-panel/discussions)
3. **提交代码**：Fork、编码、测试，然后[提交 PR](https://github.com/n2ns/antigravity-panel/pulls)

对于重大更改，请先开启 issue 讨论你的想法。

## 🤝 贡献者

特别感谢我们的社区贡献者：

*   [**@iskisraell**](https://github.com/iskisraell) - Windows 平台稳定性修复 (v2.5.6)。
*   [**@simbaTmotsi**](https://github.com/simbaTmotsi) - 本地 LLM 提交信息生成器。
*   [**@A-vrice**](https://github.com/A-vrice) - 日语本地化。
*   [**@restinnotes**](https://github.com/restinnotes) - CDP Auto-Accept 实现。
*   [**@AMDphreak**](https://github.com/AMDphreak) - 侧边栏标题修复、Gemini Flash/Pro 分组、配额重置窗口与 API 周期对齐，以及 Claude+GPT 共享池显示。
*   [**@chonkydonkers**](https://github.com/chonkydonkers) - 在状态栏和侧边栏中展示用户订阅层级的可用额度。
*   [**@vincenzofabiano92**](https://github.com/vincenzofabiano92) - 同步命令注册、连接稳定性优化、意大利语本地化补全，并新增服务器集成测试运行器 (v2.6.0)。

## 🌐 本地化策略 (Localization Policy)

为了确保技术术语的一致性和跨语言使用的专业度，本项目遵循以下原则：
- **UI 标签与技术术语**：在所有语言版本中均保持为**英文**（如 `Rules`, `MCP`, `Auto-Accept`, `Reset Status`）。
- **工具提示与详细说明**：全量**本地化**翻译，以在用户悬停或阅读设置时提供清晰的本国语言描述。

更多细节请参考 [LOCALIZATION_RULES.md](LOCALIZATION_RULES.md)。

## 📚 项目文档

- [功能特性](FEATURES_zh.md)
- [更新日志](CHANGELOG_zh.md)
- [TODO](TODO_zh.md)

## 📄 许可证

本项目采用 [Apache License, Version 2.0](../LICENSE) 开源许可证。

*曾以 **Toolkit for Antigravity** 名称发布。*

## ⭐ Star 增长曲线

<a href="https://star-history.com/#n2ns/antigravity-panel&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=n2ns/antigravity-panel&type=Date&theme=dark">
    <img src="https://api.star-history.com/svg?repos=n2ns/antigravity-panel&type=Date" alt="Star History Chart">
  </picture>
</a>

## ❤️ 支持项目

如果 Antigravity Panel 为你节省了时间，欢迎赞助以支持持续开发：

<a href="https://ko-fi.com/bugstan"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" width="160" alt="Ko-fi"></a>

---

<div align="center">

**由 [datafrog.io](https://datafrog.io) 开发并维护**



*For Antigravity. By Antigravity.*

</div>
