[English](RULES.md) | 中文文档

# 项目规则

## 文档

### TODO
- 仅含待办任务；完成后移除
- 已完成 → CHANGELOG 或 FEATURES

### 多语言
- 所有文档需有 EN/ZH 版本
- 文件顶部：语言切换链接

### README
- 底部：链接到 FEATURES、CHANGELOG、TODO

### 设计文档
- 实现完成后删除

### 清理
- 仅管理 git 跟踪的文件
- 忽略未跟踪的 `.md` 文件

## 版本
- `package.json` 是唯一来源
- CHANGELOG 中的版本号是历史记录

## 架构
- 核心模块不依赖 `vscode`
- 使用依赖注入提升可测试性

## 安全
- CSP：禁用 `unsafe-inline`
- 样式放在外部 CSS 文件

## 国际化
- 新功能：更新全部 11 个语言文件 (`package.nls.*.json`)

## 提交前检查
- `npm run lint` - ESLint
- `npm run build` - 编译
- `npm test` - 单元测试

## Git

### 分支命名
```
<type>/<short-description>
```
示例：`feature/quota-prediction`、`fix/statusbar-display`、`docs/update-readme`

### 提交信息 (Conventional Commits)
```
<type>: <description>
```
类型：`feat`、`fix`、`refactor`、`docs`、`chore`

