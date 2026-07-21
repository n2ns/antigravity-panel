[English](TODO.md) | 中文文档

# 待办事项清单

> 最后更新: 2026-07-22

> ⚠️ **注意**: 本文档仅包含待办任务。已完成的任务应移除，并记录到 [CHANGELOG.md](../CHANGELOG.md) 或 [FEATURES.md](./FEATURES.md)。

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

- [ ] **Auto-Accept CDP 注入测试**
  - 将 clicker script 抽成可测试单元

### 性能优化

- [ ] **轮询优化**
  - 扩展不可见时暂停轮询
  - 减少网络调用

### 依赖维护

- [ ] **Mocha `diff` 安全公告**
  - 跟踪仅影响开发环境的低危 `mocha@11.7.6` → `diff@7.0.0` 依赖链公告
  - 在 Mocha 支持已修复的 `diff` 版本后升级
  - 不为消除 `npm audit` 提示而强制使用不兼容的 override

### 死代码后续清理

- [ ] **移除已确认的未使用实现**
  - 删除 `CacheService.getFilesInDirectory` 和 `formatResetTime`
  - 删除未使用的 `callAnthropicApi` 兼容包装与 `deleteApiKey`
- [ ] **缩减多余导出面**
  - 停止从 `commitMessageClaude.ts`、内部配置常量、`BackoffStrategy` 和 `gaugeRenderers` 导出仅供模块内部使用的实现
  - 核对导入点后，删除 `quota.service.ts`、`app.vm.ts` 和过渡类型 barrel 中未使用的兼容性重导出
  - 将仅供测试使用的 `parseClaudeResponse` 别名替换为规范名称 `parseLLMResponse`
- [ ] **明确 Tooltip Manager 所有权**
  - `_tooltipManager` 仅被赋值而从未读取，但构造过程会安装全局监听器并创建 DOM 节点
  - 先增加明确的释放与生命周期处理，再简化这个只写字段

> 调试辅助函数、本地 Server 脚本及其支持代码明确排除在死代码清理范围之外，必须保留。

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
