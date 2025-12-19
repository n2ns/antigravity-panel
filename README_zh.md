[English](README.md) | 中文文档

## 🔥 已支持 Google 最新版 Gemini 3 Flash！欢迎反馈！

# Toolkit for Antigravity

> 轻松监控 AI 配额使用和管理缓存

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat&cacheSeconds=10800)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.104.0-007ACC?logo=visual-studio-code&style=flat&cacheSeconds=10800)](https://code.visualstudio.com/)

[![版本](https://img.shields.io/visual-studio-marketplace/v/n2ns.antigravity-panel?style=flat&label=版本&cacheSeconds=10800)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![安装量](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat&cacheSeconds=10800)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![Open VSX 版本](https://img.shields.io/open-vsx/v/n2ns/antigravity-panel?style=flat&label=Open%20VSX&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![下载量](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat&cacheSeconds=10800)](https://open-vsx.org/extension/n2ns/antigravity-panel)
[![最后更新](https://img.shields.io/github/last-commit/n2ns/antigravity-panel?style=flat&label=最后更新&cacheSeconds=10800)](https://github.com/n2ns/antigravity-panel/commits/main)

**Toolkit for Antigravity**（原名 *Antigravity Panel*）帮助你掌控 **Google Antigravity IDE** 中的 AI 模型使用情况。实时配额监控、用量趋势分析、缓存管理——一切均可在一个集成的侧边栏面板中完成。

> **📢 注意：** 我们已从 "Antigravity Panel" 更名为 "**Toolkit for Antigravity**"，以更好地反映我们构建全面生态系统工具套件的愿景。同样强大的功能，更精准的定位！

## ✨ 为什么选择 Toolkit for Antigravity？

- 🎯 **监控配额** - 实时监控配额，可视化警告提醒
- 📊 **了解用量** - 交互式图表展示使用趋势
- 🧹 **保持整洁** - 一键管理 AI 对话缓存
- 🎨 **界面精美** - 原生主题集成，经过优化的 UI 组件
- 🌍 **全面国际化** - 提供 11 种语言支持，运行时的弹窗消息现已实现 100% 对齐
- 🛠️ **智能诊断反馈** - 内置故障诊断系统，提供自动化错误报告和“搜索优先”反馈机制

## 📸 界面预览

![Toolkit 界面](assets/preview.png)

*实时配额监控、用量趋势和缓存管理，一目了然*

## 🚀 核心功能

### 📊 智能配额监控

**一眼掌握 AI 使用情况**
- 按模型家族（Gemini、Claude、GPT 等）分组显示配额
- 状态栏显示剩余配额和缓存大小
- 配额不足时颜色警告

### 📈 用量趋势分析

**了解你的消费模式**
- 交互式柱状图展示时间段用量（10-120 分钟）
- 24 小时历史记录持久化存储
- 按模型家族颜色编码可视化
- 🔥 **消耗速率**: 实时消耗速度（%/小时）
- ⏱️ **耗尽预测**: 预计配额耗尽时间

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
- English, 简体中文, 繁體中文, 日本語, Français, Deutsch, Español, Português (Brasil), Italiano, 한국어, Русский

## 📦 安装

### 从扩展市场安装

1. 打开 **Antigravity IDE**
2. 按 `Ctrl+Shift+X`（Windows/Linux）或 `Cmd+Shift+X`（macOS）打开扩展面板
3. 搜索 `Toolkit for Antigravity`
4. 点击 **安装**

**或从网页安装：**
- [扩展市场](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

## 🎯 快速开始

### 第一步：打开面板

点击侧边栏的 **Antigravity** 图标，或者：
- 按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
- 输入 `Antigravity 工具箱: Open Panel`
- 按回车

### 第二步：监控配额

- **饼图** 显示各模型家族的配额
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
| `Antigravity 工具箱: Open Panel` | 打开侧边栏面板 |
| `Antigravity 工具箱: Refresh Quota` | 手动刷新配额数据 |
| `Antigravity 工具箱: Show Cache Size` | 显示缓存总大小通知 |
| `Antigravity 工具箱: Clean Cache` | 删除所有缓存数据（谨慎使用！）|

## ⚙️ 配置选项

在 Antigravity IDE 设置（`Ctrl+,` / `Cmd+,`）中搜索 `tfa` 进行自定义：

### 📊 配额设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **轮询间隔** | `120秒` | 刷新配额的频率（最小 60 秒） |
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
| **自动清理** | `✗` | 是否在缓存过大时执行静默清理（仅保留最新 5 个任务） |

### 🔧 高级设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **服务器主机** | `127.0.0.1` | Antigravity 语言服务器的地址 |
| **API 路径** | `/exa...` | 获取用户状态的 gRPC-Web 路径 |
| **调试模式** | `✗` | 开启后在输出面板显示详细的调试日志 |

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

## 📄 许可证

本项目采用 [GNU General Public License v3.0](LICENSE) 开源许可证。

**个人及教学用途**：100% 免费使用。
**企业级及商业集成**：如需将本扩展的技术集成至商业闭源产品，请联系 Datafrog LLC 获取商业授权。

---

<div align="center">

**由 [Datafrog LLC](https://datafrog.io) 开发并维护**

[官方网站](https://datafrog.io) · [反馈与支持](https://github.com/n2ns/antigravity-panel/issues) · [商业咨询](mailto:support@datafrog.io)

</div>
