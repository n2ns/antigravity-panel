[English](TODO.md) | 中文文档

# 待办事项清单

> 最后更新: 2026-06-28

> ⚠️ **注意**: 本文档仅包含待办任务。已完成的任务应移除，并记录到 [CHANGELOG.md](../CHANGELOG.md) 或 [FEATURES.md](./FEATURES.md)。

---

## 🟡 中优先级 (P2)

### 质量门禁

- [ ] **在 CI 中加入生产代码 TypeScript 检查**
  - 新增 `typecheck` 脚本，执行 `tsc -p tsconfig.json --noEmit`
  - 在 CI 的 build/package 前运行
  - 保留 `tsconfig.test.json` 用于测试编译，但不能把它作为唯一类型检查门禁

---

## 🟢 低优先级 (P3)

### 测试覆盖

- [ ] **真实覆盖率报告**
  - 引入 `c8`、`nyc` 或等价覆盖率工具
  - 生成 lcov 报告用于 Codecov
  - 为核心 service、view-model、platform 解析模块设置最低覆盖率阈值

- [ ] **扩展激活测试**
  - 为 `activate()` 的命令注册增加测试
  - 覆盖初始化失败时的降级行为
  - 验证 `deactivate()` 会清理定时器和 scheduler 资源

- [ ] **Webview 运行时测试**
  - 使用 jsdom/happy-dom 或等价方案测试 `sidebar-app`
  - 覆盖状态恢复、`postMessage` 路由、文件夹操作和事件派发
  - 增加 Webview bundle smoke test

- [ ] **Auto-Accept CDP 注入测试**
  - 将 clicker script 抽成可测试单元
  - 验证它只会点击 Antigravity Agent 面板内的安全控件
  - 用 DOM fixture 覆盖 guard、文本匹配和噪声过滤逻辑

### 性能优化

- [ ] **轮询优化**
  - 扩展不可见时暂停轮询
  - 减少网络调用

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

- [ ] **统一配置 Schema**
  - 保持 `package.json` contributes、默认值、`TfaConfig` 和校验规则一致
  - 除非有明确文档说明，否则避免绕过 `ConfigManager` 直接读取配置

- [ ] **强类型 Webview 协议**
  - 新增共享的 `webview-protocol.ts`
  - 使用 discriminated union 定义消息和 payload
  - 避免前后端出现同名但语义不同的类型

---

## 📋 文档

- [ ] **完善 JSDoc 注释**
  - 为所有公共 API 添加 JSDoc
  - 包含参数说明和返回值类型
  - 添加使用示例
