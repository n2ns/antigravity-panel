# 配额数据模型与显示逻辑

## 概述

本文档描述 Antigravity Panel 扩展的配额数据获取、聚合和显示的完整逻辑。

---

## 一、数据来源

### 1.1 服务端接口

配额数据从 Antigravity 本地服务获取，接口路径：

```
/exa.language_server_pb.LanguageServerService/GetUserStatus
```

### 1.2 原始数据结构

服务端返回的原始数据包含两类信息：

**Prompt Credits（账户级别）**
- `monthlyPromptCredits`: 月度总额度
- `availablePromptCredits`: 当前可用额度

**Model Configs（模型级别）**
- `label`: 模型显示名称（如 "Claude Sonnet 4.5"）
- `modelOrAlias.model`: 模型 ID（如 "MODEL_CLAUDE_4_5_SONNET"）
- `quotaInfo.remainingFraction`: 剩余配额比例（0-1）
- `quotaInfo.resetTime`: 配额重置时间（ISO 时间字符串）

---

## 二、数据转换

### 2.1 ModelQuotaInfo（单模型配额）

从原始数据解析后的单个模型配额信息：

| 字段 | 类型 | 说明 |
|------|------|------|
| `label` | string | 模型显示名称 |
| `modelId` | string | 模型 ID |
| `remainingPercentage` | number | 剩余百分比（0-100） |
| `isExhausted` | boolean | 是否耗尽 |
| `resetTime` | Date | 重置时间 |
| `timeUntilReset` | string | 距重置的可读时间（如 "2h 30m"） |

### 2.2 QuotaSnapshot（配额快照）

一次轮询获取的完整配额状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | Date | 快照时间 |
| `promptCredits` | PromptCreditsInfo | 账户级别 Credits（可选） |
| `models` | ModelQuotaInfo[] | 所有模型的配额信息 |

---

## 三、分组策略

### 3.1 分组配置

模型按 `quota_strategy.json` 配置分组：

| 分组 ID | 标签 | 颜色 | 匹配前缀 |
|---------|------|------|----------|
| `gemini` | Gemini | #69F0AE | gemini |
| `claude` | Claude | #FFAB40 | claude |
| `gpt` | GPT | #FF5252 | gpt |

### 3.2 分组匹配逻辑

模型 → 分组的匹配优先级：

1. **精确 ID 匹配**: `modelId` 完全匹配配置中的 `models[].modelName`
2. **精确 Label 匹配**: `label` 完全匹配配置中的 `models[].displayName`
3. **前缀匹配（ID）**: `modelId` 包含分组的 `prefixes[]` 之一（不区分大小写）
4. **前缀匹配（Label）**: `label` 以分组的 `prefixes[]` 之一开头（不区分大小写）
5. **Fallback**: 归入 `other` 分组

### 3.3 当前配额共享情况

**重要**: 当前 Google 的配额策略中，Claude 和 GPT 模型共享同一份配额池。这意味着：

- Claude 模型和 GPT 模型的 `remainingFraction` 值相同
- 使用 Claude 会同时消耗 GPT 的配额，反之亦然
- 在 UI 上显示为两个独立分组，但实际配额是联动的

此策略可能在未来调整。

---

## 四、聚合逻辑

### 4.1 QuotaGroupState（分组配额状态）

每个分组聚合后的配额状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 分组 ID |
| `label` | string | 分组显示名称 |
| `remaining` | number | 剩余百分比（0-100） |
| `resetTime` | string | 距重置时间 |
| `themeColor` | string | 主题颜色 |
| `hasData` | boolean | 是否有数据 |

### 4.2 聚合规则

当一个分组包含多个模型时：

- **剩余百分比**: 取所有模型中的**最小值**（最保守策略）
- **重置时间**: 取剩余百分比最小的模型的重置时间
- **hasData**: 分组内至少有一个模型有配额数据

### 4.3 QuotaViewState（完整视图状态）

缓存的完整 ViewModel 状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `groups` | QuotaGroupState[] | 所有分组状态 |
| `activeGroupId` | string | 当前活跃分组 ID |
| `chart` | UsageChartData | 图表数据 |
| `lastUpdated` | number | 最后更新时间戳 |

---

## 五、活跃分组检测

### 5.1 检测逻辑

活跃分组通过**配额消耗变化**检测：

1. 比较前后两次轮询的分组配额
2. 计算每个分组的配额下降量：`drop = prev.remaining - current.remaining`
3. 选择下降量最大且超过阈值的分组作为活跃分组

### 5.2 阈值

```
ACTIVE_GROUP_THRESHOLD = 0.1  （0.1%）
```

配额下降必须大于 0.1% 才会触发活跃分组切换。

### 5.3 局限性

- 检测依赖轮询周期（默认 120 秒）
- 用户在轮询间隔内切换模型时，活跃分组不会立即更新
- 首次启动时，默认活跃分组为 `gemini`

---

## 六、显示逻辑

### 6.1 状态栏（StatusBar）

显示内容：

```
$(dashboard) {percentage}% | {cacheSize}
```

数据来源：
- `percentage`: 活跃分组的 `remaining`（四舍五入取整）
- `cacheSize`: 缓存管理器提供的总缓存大小

Tooltip 内容：
```
Active: {groupLabel}
Quota:  {percentage}%
Cache:  {cacheSize}
```

### 6.2 侧边栏仪表盘 (Sidebar Gauge)

配额以可视化仪表盘形式显示，支持多种样式切换：

| 样式 ID | 名称 | 特点 |
|---------|------|------|
| `semi-arc` | 半圆弧 (默认) | 210 度开口，工业仪表感，支持多轨道显示，空间利用率高 |
| `classic-donut` | 经典圆环 | 360 度闭合圆环，传统的简约风格 |

数据渲染策略：
- 使用 **Strategy (策略模式)** 实现不同样式的解耦。
- `getGaugeRenderer(style)` 根据配置动态获取对应的渲染函数。
- SVG 路径计算统一使用 `gauge_math.ts` 工具类，确保几何精度。

每个仪表盘使用 `themeColor` 作为核心色，并自动适配 VS Code 的深/浅色主题。

### 6.3 使用量图表（Usage Chart）

基于历史记录计算的使用量可视化：

- X 轴: 时间（最近 N 分钟，由 `historyDisplayMinutes` 配置）
- Y 轴: 配额消耗量
- 分组颜色: 使用 `themeColor`

包含预测信息：
- `usageRate`: 每小时消耗速率
- `runway`: 预计耗尽时间（如 "~2h", "~3d", ">7d", "Stable"）

---

## 七、缓存机制

### 7.1 缓存内容

启动时从 `globalState` 恢复的缓存数据：

| 键 | 内容 |
|-----|------|
| `quotaViewState` | 完整的 QuotaViewState |
| `lastDisplayPercentage` | 最后显示的百分比 |
| `lastPrediction` | 最后的预测信息 |

### 7.2 缓存优先渲染

启动时：
1. 从缓存恢复 QuotaViewState
2. 立即渲染状态栏和饼图
3. 异步获取最新配额数据
4. 获取成功后更新显示

---

## 八、配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `tfa.pollingInterval` | 120 | 轮询间隔（秒） |
| `tfa.historyDisplayMinutes` | 60 | 图表显示的历史时长（分钟） |
| `tfa.showQuota` | true | 是否在状态栏显示配额 |
| `tfa.showCacheSize` | true | 是否在状态栏显示缓存大小 |

---

## 九、已知问题与未来改进

### 9.1 Claude/GPT 配额共享

当前 Claude 和 GPT 共享配额池，但 UI 显示为独立分组。用户可能会困惑为什么两个分组的配额同步变化。

**可能的改进方向**:
- 合并为单个分组显示
- 添加说明文字
- 等待 Google 调整配额策略后重新设计

### 9.2 活跃分组检测延迟

活跃分组检测依赖轮询，存在最多 120 秒的延迟。

**可能的改进方向**:
- 监听 Antigravity 的模型切换事件（如果 API 支持）
- 缩短轮询间隔（会增加资源消耗）
- 用户手动选择活跃分组

