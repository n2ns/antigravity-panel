[English](FEATURES.md) | 中文文档

# 功能特性

> 本文档列出 Antigravity Panel 已实现的所有功能。

---

## 📊 配额监控

### 实时配额显示
- 按模型系列分组显示配额（Gemini、Claude、GPT 等）
- 饼图显示各分组剩余配额百分比
- 配额不足时颜色警告（警告/严重阈值）
- 独立追踪并显示 **Gemini 3 Flash**、Pro 与 Ultra 分组
- 可配置轮询间隔自动刷新（最小 60 秒）

### 活跃分组检测
- 自动检测当前使用的模型分组
- 基于配额消耗变化检测（>0.1% 阈值）
- 跨会话持久化活跃分组状态

### 使用历史与分析
- 交互式柱状图显示使用趋势
- 可配置显示范围（10-120 分钟）
- 24 小时历史记录持久存储
- 按模型系列颜色区分

### 消耗预测
- 🔥 **消耗速率**: 基于近期活动的实时消耗速度（%/小时）
- ⏱️ **耗尽时间**: 预计配额耗尽时间（~Xh、~Xd 或 >7d）
- 无消耗时显示 "Stable"

### Prompt Credits 显示
- 显示可用/每月 prompt credits
- 剩余百分比计算

---

## 🗂️ 缓存管理

### Brain 任务管理
- 文件夹树形视图浏览 AI 对话缓存
- 显示任务元数据：大小、文件数、创建日期
- 预览文件：图片、Markdown、代码文件
- 一键删除，带确认对话框
- 智能清理：保留最新 5 个任务，避免中断正在进行的工作

### Code Tracker 管理
- 按项目浏览代码分析缓存
- 文件夹树形视图，支持展开/折叠
- 删除单个文件或整个目录
- 删除已打开的文件时自动关闭标签页

### 缓存通知
- 缓存超过阈值时显示警告通知（可配置，默认 500MB）
- 24 小时冷却，防止通知刷屏
- 独立的缓存检查间隔（可配置，默认 120 秒）

### 隐藏空文件夹
- 选项：在树形视图中隐藏空文件夹（`gagp.cacheHideEmptyFolders`）

---

## 📱 状态栏集成

### 配额显示
- 显示活跃模型分组的剩余配额百分比，使用精简标签（如 "Pro", "Flash"）
- 增强型悬停提示，列出所有活跃分组的详细配额及重置时间
- 多种显示样式：百分比、重置时间、已用、剩余
- 颜色状态：正常（绿）、警告（黄）、严重（红）
- 可配置警告阈值（默认 30%）和严重阈值（默认 10%）

### 缓存大小显示
- 状态栏显示总缓存大小
- 可通过 `gagp.statusBarShowCache` 开关

---

## ⚙️ 快速配置访问

### 一键快捷入口
- 编辑全局规则（`~/.gemini/GEMINI.md`）
- 配置 MCP 设置（`~/.gemini/antigravity/mcp_config.json`）
- 管理浏览器白名单（`~/.gemini/antigravity/browserAllowlist.txt`）
- 打开扩展设置

---

## 💬 社区与反馈

### 反馈集成
- 通过内置的“智能反馈系统”报告 Bug（自动填充诊断信息）
- 侧边栏底部新增并排的“**反馈问题**”(GitHub Issues) 与“**项目主页**”按钮
- 所有的 UI 元素和反馈环境均支持完整的多语言对齐

---

## 🏗️ 架构与性能

### 缓存优先启动
- UI 立即从缓存数据渲染
- 异步刷新获取最新数据
- Webview 状态持久化（`vscode.setState()`/`getState()`）

### MVVM 架构
- `QuotaViewModel` 作为统一数据聚合层
- UI 与业务逻辑清晰分离
- 依赖注入提升可测试性

### 重试机制
- 可配置多种退避策略：
  - Fixed：固定延迟
  - Linear：线性增长延迟
  - Exponential：指数增长延迟
- 自定义重试条件和回调

### HTTP 客户端
- 自动 HTTPS → HTTP 降级
- 协议缓存用于后续请求
- 可配置超时

### 任务调度器
- 注册多个独立轮询任务
- 动态更新间隔
- 单独或批量启动/停止任务

### 进程检测
- 跨平台 Antigravity Language Server 检测
- Windows：PowerShell + netstat
- macOS/Linux：pgrep + lsof/ss

---

## 🌐 国际化

### 支持语言（11 种）
- English（英语）
- 简体中文
- 繁體中文
- 日本語（日语）
- Français（法语）
- Deutsch（德语）
- Español（西班牙语）
- Português (Brasil)（葡萄牙语）
- Italiano（意大利语）
- 한국어（韩语）
- Русский（俄语）

---

## 🔒 安全性

### 内容安全策略
- Webview 严格 CSP
- 外部 CSS（无 `'unsafe-inline'`）
- 基于 nonce 的脚本加载
- 限制资源加载（`default-src 'none'`）

---

## 🧪 测试

### 单元测试覆盖
- 15 个测试文件，152 个测试用例通过
- 纯 Node.js 环境（无需 VS Code 运行时）
- 核心模块全覆盖：
  - ConfigManager、CacheManager、QuotaManager
  - QuotaViewModel、QuotaStrategyManager
  - Scheduler、Retry、HttpClient
  - ProcessFinder、PlatformStrategies
  - HtmlBuilder、Format 工具函数

---

## 🔧 配置选项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `gagp.statusBarShowQuota` | `true` | 状态栏显示配额 |
| `gagp.statusBarShowCache` | `true` | 状态栏显示缓存大小 |
| `gagp.statusBarStyle` | `percentage` | 显示样式：percentage/resetTime/used/remaining |
| `gagp.statusBarThresholdWarning` | `30` | 警告阈值（%） |
| `gagp.statusBarThresholdCritical` | `10` | 严重阈值（%） |
| `gagp.pollingInterval` | `120` | 配额刷新间隔（秒，最小 60） |
| `gagp.visualizationMode` | `groups` | 显示模式：groups/models |
| `gagp.showGptQuota` | `false` | 显示 GPT 配额（与 Claude 共享） |
| `gagp.historyDisplayMinutes` | `60` | 使用图表时间范围（10-120 分钟） |
| `gagp.cacheCheckInterval` | `120` | 缓存检查间隔（秒，最小 30） |
| `gagp.cacheWarningThreshold` | `500` | 缓存警告阈值（MB） |
| `gagp.cacheHideEmptyFolders` | `false` | 树形视图隐藏空文件夹 |
| `gagp.autoCleanCache` | `false` | 自动清理缓存 |
| `gagp.debugMode` | `false` | 启用调试日志 |

