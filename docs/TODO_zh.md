[English](../TODO.md) | 中文文档

# 待办事项清单

> 最后更新: 2026-09-21

> ⚠️ **注意**: 本文档仅包含待办任务。已完成的任务应移除，并记录到 [CHANGELOG.md](../CHANGELOG.md) 或 [FEATURES.md](./FEATURES.md)。

---

## 🟡 中优先级 (P2)

### 生命周期验证

- [ ] **Antigravity 扩展激活生命周期**
  - 验证服务初始化失败时，命令仍然完成注册
  - 验证初始化失败提示及命令降级行为
  - 验证 `deactivate()` 对启动定时器和 scheduler 的清理，以及宿主通过 `context.subscriptions` 释放资源的行为
  - 涉及宿主的行为在 Antigravity IDE Extension Development Host 中验证

### 配置正确性

- [ ] **核对配置默认值与约束一致性**
  - 对照 `package.json` 声明的默认值、约束与运行时配置读取逻辑
  - 确认 `dashboard.refreshRate` 的 manifest 默认值 90 秒与 `ConfigManager` fallback 120 秒是否为有意差异
  - 修正非预期差异，并按需补充已有配置测试

---

## 🔵 可选改进 (P4)

- [ ] **强类型 Webview 消息**
  - 在扩展宿主与 Webview 之间共享消息类型
  - 使用 discriminated union 关联消息名称与对应的必填参数
  - 完整状态 payload 与局部更新语义不同时，保留各自的类型
