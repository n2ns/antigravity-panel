[English](README.md) | 中文文档

# Antigravity Panel

> 轻松监控 AI 配额使用和管理缓存

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![版本](https://img.shields.io/visual-studio-marketplace/v/n2ns.antigravity-panel?style=flat&label=版本)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![安装量](https://img.shields.io/visual-studio-marketplace/i/n2ns.antigravity-panel?style=flat)](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
[![下载量](https://img.shields.io/open-vsx/dt/n2ns/antigravity-panel?style=flat)](https://open-vsx.org/extension/n2ns/antigravity-panel)

**Antigravity Panel** 帮助你掌控 **Google Antigravity IDE** 中的 AI 模型使用情况。实时配额监控、用量趋势分析、强大的缓存管理——一切尽在一个精美的侧边栏面板中。

## ✨ 为什么选择 Antigravity Panel？

- 🎯 **监控配额** - 实时监控配额，可视化警告提醒
- 📊 **了解用量** - 交互式图表展示使用趋势
- 🧹 **保持整洁** - 一键管理 AI 对话缓存
- 🎨 **界面精美** - 原生主题集成
- 🌍 **多语言支持** - 提供 11 种语言

## 📸 界面预览

![Antigravity Panel 界面](assets/preview.png)

*实时配额监控、用量趋势和缓存管理，一目了然*

## 🚀 核心功能

### 📊 智能配额监控

**一眼掌握 AI 使用情况**
- 按模型家族（Gemini、Claude、GPT 等）分组显示配额
- 状态栏显示剩余配额和缓存大小
- 配额不足时颜色警告
- 自动连接本地 Antigravity Language Server

### 📈 用量趋势分析

**了解你的消费模式**
- 交互式柱状图展示时间段用量（10-120 分钟）
- 24 小时历史记录持久化存储
- 按模型家族颜色编码可视化
- 🔥 **消耗速率**: 实时消耗速度（%/小时）
- ⏱️ **耗尽预测**: 预计配额耗尽时间

### 🗂️ 强大的缓存管理

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
3. 搜索 `Antigravity Panel`
4. 点击 **安装**

**或从网页安装：**
- [扩展市场](https://marketplace.visualstudio.com/items?itemName=n2ns.antigravity-panel)
- [Open VSX Registry](https://open-vsx.org/extension/n2ns/antigravity-panel)

## 🎯 快速开始

### 第一步：打开面板

点击侧边栏的 **Antigravity** 图标，或者：
- 按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）
- 输入 `Antigravity Panel: Open Panel`
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
| `Antigravity Panel: Open Panel` | 打开侧边栏面板 |
| `Antigravity Panel: Refresh Quota` | 手动刷新配额数据 |
| `Antigravity Panel: Show Cache Size` | 显示缓存总大小通知 |
| `Antigravity Panel: Clean Cache` | 删除所有缓存数据（谨慎使用！）|

## ⚙️ 配置选项

在 Antigravity IDE 设置（`Ctrl+,` / `Cmd+,`）中搜索 `gagp` 进行自定义：

### 📊 配额设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **轮询间隔** | `120秒` | 刷新配额的频率（最小 60 秒，推荐 120 秒）|
| **显示配额** | `✓` | 在状态栏显示配额信息 |
| **可视化模式** | `groups` | 按 `groups`（分组）或 `models`（单个模型）显示 |
| **警告阈值** | `30%` | 配额低于此值时显示警告 |
| **严重阈值** | `10%` | 配额低于此值时显示严重警告 |
| **历史范围** | `60 分钟` | 用量图表的时间范围（10-120 分钟）|

### 💾 缓存设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **显示缓存大小** | `✓` | 在状态栏显示缓存大小 |
| **检查间隔** | `120秒` | 检查缓存大小的频率（30-600秒）|
| **警告阈值** | `500 MB` | 缓存超过此大小时显示警告 |
| **隐藏空目录** | `✗` | 在 Brain 和 Code Tracker 树中隐藏空目录 |

## 🔒 隐私声明

**你的数据属于你自己。**

Antigravity Panel 不会收集、传输或存储任何用户数据。所有操作都在你的本地计算机上执行。扩展仅与你本地的 Antigravity Language Server 通信——不会向任何外部服务器发送数据。

## 🤝 参与贡献

欢迎贡献！你可以：

1. **报告问题**：[提交 Issue](https://github.com/n2ns/antigravity-panel/issues)
2. **建议功能**：[发起讨论](https://github.com/n2ns/antigravity-panel/discussions)
3. **提交代码**：Fork、编码、测试，然后[提交 PR](https://github.com/n2ns/antigravity-panel/pulls)

对于重大更改，请先开启 issue 讨论你的想法。

## 📄 许可证

[MIT License](LICENSE) - 欢迎在你的项目中使用本扩展！

---

## 📚 文档

- [功能特性](docs/FEATURES_zh.md) - 完整功能列表
- [更新日志](docs/CHANGELOG_zh.md) - 版本历史
- [待办事项](docs/TODO_zh.md) - 计划中的功能

---

<div align="center">

**用 ❤️ 制作 by [n2n studio](https://github.com/n2ns)**

[报告问题](https://github.com/n2ns/antigravity-panel/issues) · [功能建议](https://github.com/n2ns/antigravity-panel/issues) · [文档](https://github.com/n2ns/antigravity-panel/wiki)

</div>
