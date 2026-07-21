# 配额数据模型与显示逻辑

## 概述

本文档描述 Antigravity Panel 当前的配额获取、模型分类、配额池聚合、历史统计和显示逻辑。

核心原则是把“模型分组”和“后端配额池”分开：模型名称、分类和颜色可以保持独立，但同一后端池只记录和统计一次。

---

## 一、数据来源

### 1.1 服务端接口

配额数据来自 Antigravity 本地 Language Server：

```text
/exa.language_server_pb.LanguageServerService/GetUserStatus
```

### 1.2 原始数据

服务端主要返回：

**账户级 Credits**

- `monthlyPromptCredits`：月度 Prompt Credits
- `availablePromptCredits`：当前可用 Prompt Credits
- `availableCredits`：用户订阅层级可用额度

**模型级配额行**

- `label`：模型显示名称
- `modelOrAlias.model`：模型 ID
- `quotaInfo.remainingFraction`：剩余比例（0–1）
- `quotaInfo.resetTime`：服务端提供的重置时间

Language Server 仍可能为同一配额池返回多个模型行。模型行数量不等于独立配额池数量。

---

## 二、数据转换

### 2.1 `ModelQuotaInfo`

每个服务端模型行转换为：

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 模型显示名称 |
| `modelId` | string | 模型 ID |
| `remainingPercentage` | number | 剩余百分比（0–100） |
| `isExhausted` | boolean | 是否耗尽 |
| `resetTime` | Date | 绝对重置时间 |
| `timeUntilReset` | string | 距重置的可读时间 |

### 2.2 `QuotaSnapshot`

一次轮询产生一份快照：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | Date | 快照时间 |
| `models` | `ModelQuotaInfo[]` | 全部模型行 |
| `promptCredits` | `PromptCreditsInfo` | Prompt Credits（可选） |
| `tokenUsage` | `TokenUsageInfo` | Credits 汇总（可选） |
| `userInfo` | `UserInfo` | 用户与订阅信息（可选） |

---

## 三、模型分组与配额池

### 3.1 两层配置

`src/shared/config/quota_strategy.json` 同时定义：

1. `groups`：负责模型匹配、模型名称和模型视图颜色。
2. `quotaPools`：负责仪表、历史、柱状图、速率、通知和状态栏统计。

每个模型分组通过 `quotaPoolId` 指向一个配额池。

### 3.2 当前配置

| 模型分组 | 模型视图颜色 | 当前配额池 | 配额池显示 |
|---|---|---|---|
| `gemini-flash` | `#40C4FF` | `gemini` | Gemini（蓝色） |
| `gemini-pro` | `#69F0AE` | `gemini` | Gemini（蓝色） |
| `claude` | `#FFAB40` | `non-google` | Claude（橙色） |
| `gpt` | `#FF5252` | `non-google` | Claude（橙色） |

当前 Gemini Flash 与 Gemini Pro 使用同一个 Gemini 配额池。Flash 与 Pro 的相对消耗成本可能不同，但任一模型的使用都会减少同一池的剩余额度。

Claude 与 GPT 当前也按同一后端池处理；默认分组视图使用兼容原界面的 `Claude` 标签。

### 3.3 模型匹配顺序

模型到 `groups` 的匹配顺序：

1. 配置中的模型 ID 精确匹配。
2. 规范化后的模型 ID 精确匹配。
3. Label 中的 `modelName` 仅按完整词元匹配；服务端模型 ID 与 `modelName` 仅允许精确匹配。
4. 未命中具体模型时，按配置的分组 prefix/keyword 做最长匹配。
5. 未识别模型回退到 `other` 或首个可用分组。

精确和词元边界规则可避免共享数字前缀的服务端 ID 相互误判，例如 Gemini 3.6 Flash 的 `MODEL_PLACEHOLDER_M264/M265/M266` 不会命中 Claude Opus 的 `MODEL_PLACEHOLDER_M26`。

Gemini Pro 的宽泛 `gemini` 前缀不会覆盖包含 `flash` 的模型。

### 3.4 未来重新拆分

如果服务商重新提供独立配额，只需：

1. 在 `quotaPools` 中增加独立池定义。
2. 修改相关模型分组的 `quotaPoolId`。

聚合、历史、图表、通知和状态栏代码不需要修改。旧的、已不存在的池历史不会继续显示；新池从新的采样点开始统计。

---

## 四、配额池聚合

### 4.1 `QuotaGroupState`

该类型保留了历史名称，但当前每一项代表一个配额池状态：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 配额池 ID |
| `label` | string | 配额池显示名称 |
| `remaining` | number | 剩余百分比 |
| `resetTime` | string | 距重置时间 |
| `themeColor` | string | 配额池颜色 |
| `hasData` | boolean | 池内是否存在模型数据 |

### 4.2 聚合规则

对属于同一个 `quotaPoolId` 的所有模型：

- `remaining`：取最低剩余百分比。
- `resetTime`：使用最低剩余模型对应的重置时间。
- `hasData`：池内至少存在一个模型行。
- 服务端返回 `Ready` 时，界面同步显示为 100%。

最低值策略用于避免服务端模型行短暂不同步时高估可用额度。

### 4.3 单次记录原则

每次轮询只按配额池 ID 写入一次历史，例如：

```json
{
  "gemini": 82,
  "non-google": 64
}
```

不会同时写入 `gemini-flash` 与 `gemini-pro`，因此同一次共享池下降不会被柱状图或 `pp/h` 重复计算。

---

## 五、活跃配额池与通知

活跃池通过前后两次轮询的下降量判断：

```text
drop = previous.remaining - current.remaining
```

下降量最大且超过 `0.1` 个百分点的池成为活跃池。预测、主要状态栏显示和低配额通知均使用该池。

因为检测发生在池层，Flash 与 Pro 同步下降时只会产生一个 Gemini 活跃池和一份通知冷却状态。

---

## 六、显示逻辑

### 6.1 分组视图

`tfa.dashboard.viewMode = groups` 时，每个配额池显示一个仪表：

- Gemini：使用原 Flash 蓝 `#40C4FF`
- Claude：使用原 Claude 橙 `#FFAB40`

这避免把共享配额表现成多份独立额度。

### 6.2 模型视图

`tfa.dashboard.viewMode = models` 时，仍显示 Language Server 返回的各个模型：

- Flash 模型保留蓝色。
- Pro 模型保留绿色。
- Claude 和 GPT 保留各自模型分组颜色。
- 同一池内的模型共享该池计算出的历史消耗速率。

### 6.3 状态栏

状态栏可显示当前池或所有可见池，格式包含：

- 配额状态 Emoji
- 短标签
- 剩余百分比
- 重置时间
- 可选缓存大小和 Credits

状态栏数据由配额池状态生成，不会为 Flash 与 Pro 重复输出同一份 Gemini 配额。

启用配额状态栏时，如果 Language Server 连接失败，状态栏会切换为警告状态而不是继续显示缓存中的旧配额。仅启用缓存显示时不依赖配额连接。

### 6.4 使用量柱状图

柱状图按配额池展示每个时间桶内的百分点消耗：

- 尚未记录到正向配额变化时，整个柱状图卡片保持隐藏；第一笔变化进入历史桶后自动显示。
- 历史范围：10–120 分钟，默认 90 分钟。
- 时间桶：根据范围和轮询间隔聚合，最多约 24 根柱。
- Y 轴：该时间桶内消耗的百分点。
- 图例与颜色：来自 `quotaPools`。

升级前由模型分组写入的旧历史会映射到当前池。同一桶内的镜像记录取最大下降量，而不是相加，从而避免 Flash/Pro 或 Claude/GPT 历史翻倍。

### 6.5 预测

- `usageRate`：选定历史范围内的池消耗速率，单位为 `pp/h`。
- `runway`：按当前池剩余额度和服务端重置时间估算的耗尽时间。
- 无消耗时显示 `Stable`。

---

## 七、缓存与升级兼容

主要持久化键：

| 键 | 内容 |
|---|---|
| `tfa.quotaHistory_v2` | 配额历史采样 |
| `tfa.lastViewState` | 最近一次视图状态 |
| `tfa.lastSnapshot` | 最近一次服务端快照 |
| `tfa.lastDisplayPercentage` | 最近显示百分比 |
| `tfa.lastPredictionGroup` | 最近预测池 ID |

启动时优先恢复缓存；如果缓存仍使用旧模型分组 ID，但存在模型快照，则会按照当前 `quotaPoolId` 重新聚合。无法映射到当前池的旧图表序列会被忽略。

---

## 八、相关配置

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `tfa.dashboard.viewMode` | `groups` | 按配额池或单模型显示 |
| `tfa.dashboard.gaugeStyle` | `semi-arc` | 半圆弧或经典圆环 |
| `tfa.dashboard.historyRange` | `90` | 图表历史范围（分钟） |
| `tfa.dashboard.refreshRate` | `90` | 配额刷新间隔（秒） |
| `tfa.dashboard.includeSecondaryModels` | `false` | 是否显示 GPT 等次要模型 |
| `tfa.dashboard.showCreditsCard` | `false` | 是否显示静态 Prompt/Flow 行；Google One AI 始终显示 |
| `tfa.status.showQuota` | `true` | 状态栏是否显示配额 |
| `tfa.status.showCache` | `true` | 状态栏是否显示缓存大小 |
| `tfa.status.scope` | `all` | 状态栏显示主要池或全部池 |
| `tfa.status.warningThreshold` | `40` | 警告阈值 |
| `tfa.status.criticalThreshold` | `20` | 严重阈值 |

---

## 九、边界说明

- 扩展只能使用 Language Server 当前公开的模型配额行；若服务端只暴露一个有效约束窗口，扩展不能推导未返回的其他窗口。
- 活跃池检测依赖轮询，可能存在最多一个轮询周期的延迟。
- 配额池关系属于服务商策略，发生变化时必须同步更新 `quota_strategy.json`，不能仅根据多个模型当前数值相同自动合并。
