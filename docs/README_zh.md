[English](../README.md) | 中文文档

# Toolkit for Antigravity

> 轻松监控 AI 配额使用和管理缓存

[![Antigravity IDE](https://img.shields.io/badge/Antigravity-IDE-4285F4?style=flat)](https://antigravity.google)
[![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.104.0-007ACC?logo=visual-studio-code&style=flat&cacheSeconds=10800)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../LICENSE)
[![Stars](https://img.shields.io/github/stars/n2ns/antigravity-panel?style=flat&logo=github&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/stargazers)

[![GitHub 版本](https://img.shields.io/github/v/release/n2ns/antigravity-panel?style=flat&label=%E7%89%88%E6%9C%AC&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/releases)
[![Open VSX 版本](https://img.shields.io/open-vsx/v/n2ns/antigravity-panel?style=flat&label=Open%20VSX&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![Open VSX 下载量](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&label=%E4%B8%8B%E8%BD%BD%E9%87%8F&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![VS 市场安装量](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat&label=VS%20%E5%B8%82%E5%9C%BA&cacheSeconds=10800)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![最后更新](https://img.shields.io/github/last-commit/n2ns/antigravity-panel?style=flat&label=%E6%9C%80%E5%90%8E%E6%9B%B4%E6%96%B0&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/commits/main)


**Toolkit for Antigravity**（原名 *Antigravity Panel*）帮助你掌控 **Google Antigravity IDE** 中的 AI 模型使用情况。实时配额监控、用量趋势分析、缓存管理——一切均可在一个集成的侧边栏面板中完成。

## ✨ 功能概览

- 🎯 **配额监控** - 实时展示配额状态与阈值警告
- 📊 **用量统计** - 可视化展示使用趋势与历史记录
- 🧹 **缓存管理** - 快速清理 AI 对话历史与缓存文件
- 🎨 **原生集成** - 适配 IDE 主题的 UI 组件设计
- 🌍 **多语言支持** - 支持 13 种语言，包括界面和运行时通知
- 🛠️ **连接诊断** - 内置连接检查和错误报告工具
- 🤖 **无人值守模式** - 自动接受 Agent 命令，加速繁重的工作流
- ✍️ **智能提交** - 使用本地 LLM 或 Claude 自动生成提交信息系统

## 📸 界面预览

| | |
|:---:|:---:|
| ![配额仪表盘](../assets/preview1.png) | ![用量分析](../assets/preview2.png) |\r\n| ![缓存管理](../assets/preview3.png) | ![设置与配置](../assets/preview4.png) |

*实时配额监控、用量趋势和缓存管理，一目了然*

## 🚀 核心功能

### 📊 智能配额监控

**一眼掌握 AI 使用情况**
- 按模型分组（Gemini、Claude、GPT 等）显示配额
- 状态栏显示剩余配额，带 Emoji 状态指示器（🟢🟡🔴）和缓存大小
- 悬停提示显示所有模型配额和重置时间
- 可配置的警告阈值（≤30%）和危险阈值（≤10%）

### 📈 用量趋势分析

**了解你的消费模式**
- 交互式柱状图展示时间段用量（10-120 分钟）
- 24 小时历史记录持久化存储
- 按模型分组颜色编码可视化
- 🔥 **消耗速率**: 实时消耗速度（%/小时）
- ⏱️ **耗尽预测**: 预计配额耗尽时间

### 💳 Token 积分追踪

**监控你的 AI 使用积分**
- Prompt 积分：用于对话输入和结果生成（推理）
- Flow 积分：用于搜索、修改和命令执行（操作）
- 可在设置中隐藏用户信息卡片

### 🗂️ 缓存管理

**保持工作区整洁**
- **Brain 任务**: 浏览和删除 AI 对话缓存
  - 查看任务大小、文件数和创建日期
  - 预览图片、Markdown 和代码文件
  - 一键删除并自动清理
- **代码上下文**: 按项目管理代码分析缓存
- **智能清理**: 自动关闭相关编辑器标签页

### ⚙️ 快速配置访问

**一键访问重要设置**
- 编辑全局规则
- 配置 MCP 设置
- 管理浏览器白名单

### 🌐 全平台支持

**跨平台兼容**
- ✅ Windows
- ✅ macOS
- ✅ Linux

**多语言界面**
- English, 简体中文, 繁體中文, 日本語, Français, Deutsch, Español, Português (Brasil), Italiano, 한국어, Русский, Polski, Türkçe

## 📦 安装

### 从扩展市场安装

1. 打开 **Antigravity IDE**
2. 按 `Ctrl+Shift+X`（Windows/Linux）或 `Cmd+Shift+X`（macOS）打开扩展面板
3. 搜索 `Toolkit for Antigravity`
4. 点击 **安装**

**或从网页安装：**
- [扩展市场](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)
### 🤖 自动接受 (Hands-free Mode)

**简化你的工作流程**
- 自动接受 Agent 建议的终端命令和文件修改
- 通过侧边栏 "小火箭" 开关或命令开启/关闭
- 适合当你信任 Agent 输出时的快速原型开发

### ✨ 提交信息生成器 (Commit Message Generator)

**使用本地 LLM 或 Claude 生成约定式提交信息**

这是当内置 "Generate commit message" 功能不可用时的一个有力补充。

**配置步骤：**
1. 从 [Anthropic Console](https://console.anthropic.com/) 获取 API Key（如使用 Claude）
2. 运行命令 `Antigravity Toolkit: Set Anthropic API Key`
3. 输入你的 API Key (安全存储)

**使用方法：**
1. 使用 `git add` 暂存更改
2. 运行命令 `Antigravity Toolkit: Generate Commit Message`
3. 提交信息将自动填充到源代码管理输入框中

**配置选项：**
- **模型**: 选择 Claude Sonnet 4, 3.5 Sonnet, 或 Opus (或本地 Ollama 模型)
- **最大 Diff 大小**: 限制发送的字符数 (默认: 80,000)
- **格式**: Conventional commits (约定式) 或 Simple (简单) 风格

> ⚠️ **隐私提示**: 你的暂存 Diff 将被发送到配置的 LLM API 以生成摘要。
### 从 GitHub Releases 手动安装

如果扩展市场无法访问，或需要安装特定版本：

1. 从 [GitHub Releases](https://github.com/n2ns/antigravity-panel/releases) 下载 `.vsix` 文件
2. 打开 Antigravity IDE → 扩展面板
3. 点击 `⋯`（更多操作）→ `从 VSIX 安装...`
4. 选择下载的 `.vsix` 文件

## 🎯 快速开始

### 第一步：打开面板

点击侧边栏的 **Antigravity** 图标，或者：
- 按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
- 输入 `Antigravity Toolkit: Open Panel`
- 按回车

### 第二步：监控配额

- **饼图** 显示各模型分组的配额
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
| `Antigravity Toolkit: Open Panel` | 打开侧边栏面板 |
| `Antigravity Toolkit: Refresh Quota` | 手动刷新配额数据 |
| `Antigravity Toolkit: Show Cache Size` | 显示缓存总大小通知 |
| `Antigravity Toolkit: Clean Cache` | 删除所有缓存数据（谨慎使用！）|
| `Antigravity Toolkit: Open Settings` | 打开扩展设置 |
| `Antigravity Toolkit: Show Disclaimer` | 查看隐私与安全免责声明 |
| `Antigravity Toolkit: Restart Language Server` | 重启 Antigravity 代理服务 |
| `Antigravity Toolkit: Reset User Status` | 重置状态更新器 |
| `Antigravity Toolkit: Run Diagnostics` | 运行连接诊断 |
| `Antigravity Toolkit: Toggle Auto-Accept` | 开启/关闭自动接受命令模式 |
| `Antigravity Toolkit: Generate Commit Message` | 使用本地 LLM 或 Claude 生成提交信息 |
| `Antigravity Toolkit: Set Anthropic API Key` | 设置 Anthropic API 密钥 |

## ⚙️ 配置选项

在 Antigravity IDE 设置（`Ctrl+,` / `Cmd+,`）中搜索 `tfa` 进行自定义：

### 📊 配额设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **轮询间隔** | `90秒` | 刷新配额的频率（最小 60 秒） |
| **显示配额** | `✓` | 在状态栏显示配额信息 |
| **状态栏样式** | `percentage` | 状态栏显示：百分比、时间、已用量或剩余量 |
| **仪表盘样式** | `semi-arc` | 模型配额呈现样式：`semi-arc`（半圆弧）或 `classic-donut`（经典圆环） |
| **可视化模式** | `groups` | 仪表盘按 `groups`（分组）或 `models`（单个模型）显示 |
| **显示 GPT 配额** | `✗` | 是否在面板中显示 GPT 系列模型的配额 |
| **历史范围** | `90 分钟` | 用量图表的时间范围（10-120 分钟） |
| **警告阈值** | `30%` | 配额低于此值时，状态栏变色提醒（警告） |
| **严重阈值** | `10%` | 配额低于此值时，状态栏变色提醒（严重错误） |

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
| **调试模式** | `✗` | 开启后在输出面板显示详细的调试日志 |



### 🤖 提交信息设置 (Commit Message)

| 配置项 (`ID`) | 默认值 | 说明 |
| :--- | :--- | :--- |
| **API 端点** | `http://localhost...` | API 端点 URL。支持 Ollama, Anthropic 或 OpenAI 兼容地址。 |
| **模型名称** | `llama3.2` | 使用的模型名称 (如 `llama3.2`, `claude-3-haiku`)。 |
| **最大 Diff 大小**| `80000` | 发送给 LLM 的 Diff 最大字符数限制。 |
| **提交格式** | `conventional` | 提交信息格式 (`conventional` 或 `simple`)。 |

## 🔒 隐私与安全免责声明

**你的数据属于你自己。**

Toolkit for Antigravity 不会收集、传输或存储任何用户数据。所有操作都在你的本地计算机上执行。扩展仅与本地组件通信——不会向任何外部服务器发送数据。

**实验性功能提示：**
本扩展的“智能配额监控”功能依赖于本地 Antigravity 环境所暴露的内部指标。该功能属于实验性质，仅按“原样”提供，旨在帮助用户更好地了解个人资源使用情况。它不是 Google 的官方产品，并且在未来的 IDE 更新中可能会发生变化。

## 🤝 参与贡献

欢迎贡献！如果你觉得这个工具有所帮助，请在 GitHub 上给我们一个 **Star** 🌟！这是对我们最大的支持和鼓励。

你可以：

1. **报告问题**：[提交 Issue](https://github.com/n2ns/antigravity-panel/issues)
2. **建议功能**：[发起讨论](https://github.com/n2ns/antigravity-panel/discussions)
3. **提交代码**：Fork、编码、测试，然后[提交 PR](https://github.com/n2ns/antigravity-panel/pulls)

对于重大更改，请先开启 issue 讨论你的想法。

## 🌐 本地化策略 (Localization Policy)

为了确保技术术语的一致性和跨语言使用的专业度，本项目遵循以下原则：
- **UI 标签与技术术语**：在所有语言版本中均保持为**英文**（如 `Rules`, `MCP`, `Auto-Accept`, `Reset Status`）。
- **工具提示与详细说明**：全量**本地化**翻译，以在用户悬停或阅读设置时提供清晰的本国语言描述。

更多细节请参考 [LOCALIZATION_RULES.md](LOCALIZATION_RULES.md)。

## 📄 许可证

本项目采用 [Apache License, Version 2.0](../LICENSE) 开源许可证。


---

<div align="center">

**由 [datafrog.io](https://datafrog.io) 开发并维护**



*For Antigravity. By Antigravity.*

</div>
