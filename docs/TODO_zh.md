[English](../TODO.md) | 中文文档

# 待办事项清单

> 最后更新: 2026-07-22

> ⚠️ **注意**: 本文档仅包含待办任务。已完成的任务应移除，并记录到 [CHANGELOG.md](../CHANGELOG.md) 或 [FEATURES.md](./FEATURES.md)。

---

## 🟡 中优先级 (P2)

### 测试覆盖

- [ ] **扩展激活生命周期测试**
  - 为 `activate()` 的命令注册增加测试
  - 覆盖初始化失败时的降级行为
  - 验证 `deactivate()` 会清理启动定时器、scheduler 和自动化资源

- [ ] **Webview 运行时测试**
  - 使用 jsdom/happy-dom 或等价方案测试 `sidebar-app`
  - 覆盖状态恢复、`postMessage` 路由、文件夹操作和事件派发

### 配置正确性

- [ ] **统一配置 Schema**
  - 保持 `package.json` contributes、默认值、`TfaConfig` 和校验规则一致
  - 纳入当前独立存在的 `dashboard.showUserInfoCard` 和提交信息配置等设置
  - 除非有明确文档说明，否则避免绕过 `ConfigManager` 直接读取配置
  - 增加契约测试，对比 manifest 配置键及默认值与运行时 schema

---

## 🟢 低优先级 (P3)

### 测试覆盖

- [ ] **CI 覆盖率门禁**
  - 为现有单元测试运行器引入 `c8`、`nyc` 或等价覆盖率工具
  - 在 CI 中输出覆盖率摘要，不强制依赖第三方上传服务
  - 为核心 service、view-model、platform 解析模块设置有针对性的最低覆盖率阈值

---

## 🔵 架构优化 (P4)

### 可维护性

- [ ] **拆分 AppViewModel 职责**
  - 将配额投影逻辑抽到独立的 `QuotaStateProjector`
  - 将缓存树状态抽到独立的 cache/tree view model
  - 将通知策略和自动化协调逻辑从 `AppViewModel` 中拆出

- [ ] **明确领域类型归属**
  - 将 quota/cache 领域类型从 `shared/utils/types.ts` 移出
  - 将平台进程类型放在 `shared/platform`
  - 将配置类型放在 `shared/config`

- [ ] **强类型 Webview 协议**
  - 新增共享的 `webview-protocol.ts`
  - 使用 discriminated union 定义消息和 payload
  - 避免前后端出现同名但语义不同的类型
