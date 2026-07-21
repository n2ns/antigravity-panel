[English](RULES.md) | 中文文档

# 项目规则

## 规则强度

所有规则均为**强制执行**。违反必须报告并阻止。

## 违规处理

- 发现任何规则违反时，必须先报告用户再继续
- 规则冲突时，必须报告用户并等待决定
- 禁止静默忽略或绕过规则

---

## 文档

### TODO
- 仅含待办任务；完成后移除
- 已完成项 → CHANGELOG 或 FEATURES

### 多语言
- `docs/` 下所有文档需有 EN/ZH 版本
- 文件顶部：语言切换链接

### README
- 底部：链接到 FEATURES、CHANGELOG、TODO

### 设计文档
- 实现完成后删除

### 清理
- 仅管理 git 跟踪的文件
- 禁止自动删除未跟踪文件

## 版本
- `package.json` 是版本号唯一来源
- CHANGELOG 中的版本号仅作历史记录

## 架构
- 核心业务逻辑模块禁止直接 import `vscode` 模块
- 使用依赖注入；通过接口与 VSCode API 交互
- 工具类模块必须尽量减少 `vscode` 依赖

## 安全
- CSP：脚本禁用 `unsafe-inline`
  - 例外：`style-src 'unsafe-inline'` 是动态图表渲染所必需的（conic-gradient、linear-gradient）
- 样式必须放在外部 CSS 文件（如 `dist/webview.css`）

## 国际化（如有）
- Manifest 字符串：保持所有 `package.nls.*.json` 文件一致
- 运行时字符串：保持所有 `l10n/bundle.l10n.*.json` 文件一致
- 新增 key 和占位符必须同时添加到所有语言文件
- 受保护的技术 UI 标签必须保持英文

## 提交前检查
- `npm run lint` - ESLint 必须通过
- `npm run typecheck` - 生产 TypeScript 检查必须通过
- `npm run check:l10n` - 本地化契约检查必须通过
- `npm run build` - 编译必须成功
- `npm test` - 单元测试必须通过
- `npm run test:server` - Antigravity 环境可用时，真实 Language Server 测试必须通过
- `git status` - 审查暂存/未跟踪文件

## Git

### 分支命名
- 格式：`<type>/<short-description>`
- 示例：`feature/quota-prediction`、`fix/statusbar-display`、`docs/update-readme`

### 提交信息 (Conventional Commits)
- 格式：`<type>: <description>`
- 类型：`feat`、`fix`、`refactor`、`docs`、`chore`
