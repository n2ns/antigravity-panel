# Quota Data Model and Display Logic

## Overview

This document describes how Antigravity Panel currently fetches quota data, classifies models, aggregates quota pools, records history, and renders the result.

The core principle is to separate "model groups" from "backend quota pools": model names, classification and colors can stay independent, but each backend pool is recorded and counted only once.

---

## 1. Data Sources

### 1.1 Server endpoints

Quota data comes from the local Antigravity Language Server:

```text
/exa.language_server_pb.LanguageServerService/GetUserStatus
/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary
```

`GetUserStatus` provides the credits and the per-model 5-hour quota rows. `RetrieveUserQuotaSummary` provides the per-group weekly and 5-hour limits that the IDE shows in Settings → Models; the panel reads only its weekly buckets. It is requested after every successful `GetUserStatus` and is optional: a server without it, an error, or an unexpected shape only leaves the weekly limits out and never fails the quota fetch.

### 1.2 Raw data

The server mainly returns:

**Account-level credits**

- `monthlyPromptCredits`: monthly Prompt Credits
- `availablePromptCredits`: currently available Prompt Credits
- `availableCredits`: credits available for the user's subscription tier

**Model-level quota rows**

- `label`: model display name
- `modelOrAlias.model`: model ID
- `quotaInfo.remainingFraction`: remaining fraction (0-1)
- `quotaInfo.resetTime`: reset time provided by the server

The Language Server may still return multiple model rows for the same quota pool. The number of model rows does not equal the number of independent quota pools.

**Quota summary buckets** (`response.groups[].buckets[]`)

- `bucketId`: for example `gemini-weekly`, `gemini-5h`, `3p-weekly`, `3p-5h`
- `window`: `weekly` or `5h`
- `remainingFraction`: remaining fraction (0-1); omitted when zero. A bucket may report `remainingAmount` instead, which has no percentage and is skipped.
- `resetTime`: reset time provided by the server

---

## 2. Data Transformation

### 2.1 `ModelQuotaInfo`

Each server model row is converted to:

| Field | Type | Description |
|---|---|---|
| `label` | string | Model display name |
| `modelId` | string | Model ID |
| `remainingPercentage` | number | Remaining percentage (0-100) |
| `isExhausted` | boolean | Whether the quota is exhausted |
| `resetTime` | Date | Absolute reset time |
| `resetTimeIsFallback` | boolean | Optional; true when the server sent an invalid reset time and `resetTime` is a synthetic fallback |
| `timeUntilReset` | string | Human-readable time until reset |

### 2.2 `QuotaSnapshot`

Each poll produces one snapshot:

| Field | Type | Description |
|---|---|---|
| `timestamp` | Date | Snapshot time |
| `models` | `ModelQuotaInfo[]` | All model rows |
| `promptCredits` | `PromptCreditsInfo` | Prompt Credits (optional) |
| `flowCredits` | `FlowCreditsInfo` | Flow Credits (optional) |
| `tokenUsage` | `TokenUsageInfo` | Credits summary (optional) |
| `userInfo` | `UserInfo` | User and subscription information (optional) |
| `weeklyLimits` | `WeeklyLimitInfo[]` | Weekly buckets `{ bucketId, remainingPercentage, resetTime? }` (optional; absent when the summary is unavailable). `resetTime` is absent when the server value was invalid |

---

## 3. Model Groups and Quota Pools

### 3.1 Two configuration layers

`src/shared/config/quota_strategy.json` defines both:

1. `groups`: responsible for model matching, model names and model-view colors.
2. `quotaPools`: responsible for gauges, history, bar charts, rates, notifications and status bar statistics.

Each model group points to a quota pool through `quotaPoolId`. A quota pool names the summary bucket that holds its official weekly limit through `weeklyBucketId`.

### 3.2 Current configuration

| Model group | Model-view color | Current quota pool | Pool display |
|---|---|---|---|
| `gemini-flash` | `#40C4FF` | `gemini` | Gemini (blue) |
| `gemini-pro` | `#69F0AE` | `gemini` | Gemini (blue) |
| `claude` | `#FFAB40` | `non-google` | Claude (orange) |
| `gpt` | `#FF5252` | `non-google` | Claude (orange) |
| `other` | `#FFAB40` | `non-google` | Claude (orange) |

| Quota pool | `weeklyBucketId` |
|---|---|
| `gemini` | `gemini-weekly` |
| `non-google` | `3p-weekly` |

Gemini Flash and Gemini Pro currently share the same Gemini quota pool. The relative consumption cost of Flash and Pro may differ, but usage of either model reduces the remaining quota of the same pool.

Claude and GPT are also currently treated as the same backend pool; the default group view uses the `Claude` label for compatibility with the original UI.

The `other` group has no models or prefixes; it only receives models that nothing else matches, so an unrecognized non-Google model is not counted against the Gemini pool.

### 3.3 Model matching order

Models are matched to `groups` in this order:

1. Exact match on a model ID from the configuration.
2. Exact match on the normalized model ID.
3. Exact, case-insensitive match of the server model ID against `modelName`, with or without a label.
4. `modelName` in the label is matched only as a whole token.
5. When no specific model matches, the longest match on the configured group prefix/keyword wins.
6. Unrecognized models fall back to the `other` group (pool `non-google`); the first group is used only if a configuration has no `other` group.

The exact-match and token-boundary rules prevent server IDs that share a numeric prefix from being mistaken for each other; for example, Gemini 3.6 Flash's `MODEL_PLACEHOLDER_M264/M265/M266` do not match Claude Opus's `MODEL_PLACEHOLDER_M26`.

The broad `gemini` prefix of Gemini Pro does not override models that contain `flash`.

### 3.4 Splitting pools again in the future

If the provider offers independent quotas again, only two steps are needed:

1. Add an independent pool definition to `quotaPools`.
2. Change the `quotaPoolId` of the affected model groups.

The aggregation, history, chart, notification and status bar code does not need to change. History for old pools that no longer exist is not displayed any further; new pools start their statistics from new sample points.

---

## 4. Quota Pool Aggregation

### 4.1 `QuotaGroupState`

This type keeps its historical name, but each entry now represents the state of one quota pool:

| Field | Type | Description |
|---|---|---|
| `id` | string | Quota pool ID |
| `label` | string | Quota pool display name |
| `remaining` | number | Remaining percentage |
| `resetTime` | string | Time until reset |
| `themeColor` | string | Quota pool color |
| `resetDate` | number | Optional absolute reset timestamp in epoch milliseconds; absent when unknown or the server value was invalid |
| `hasData` | boolean | Whether the pool contains any model data |
| `weekly` | `QuotaWeeklyState` | Optional official weekly limit `{ remaining, resetTime, resetDate? }`; present whenever the pool's weekly bucket is, even without model rows |

### 4.2 Aggregation rules

For all models that belong to the same `quotaPoolId`:

- `remaining`: the lowest remaining percentage.
- `resetTime`: the reset time of the model with the lowest remaining percentage.
- `hasData`: at least one model row exists in the pool.
- When the server reports `Ready`, the UI shows 100% in sync.

The minimum strategy avoids overestimating available quota when server model rows are briefly out of sync.

`weekly` is taken from the summary bucket named by the pool's `weeklyBucketId`. Its `resetTime` is recomputed from the absolute reset time on every aggregation, so a restored cached snapshot does not show a stale countdown, and a passed reset shows 100% like the 5-hour quota. Weekly limits are not written to history and do not affect active pool detection, the bar chart or the prediction.

### 4.3 Single-record principle

Each poll writes history only once per quota pool ID, for example:

```json
{
  "gemini": 82,
  "non-google": 64
}
```

`gemini-flash` and `gemini-pro` are never written at the same time, so a single drop of the shared pool is not double-counted by the bar chart or `pp/h`.

---

## 5. Active Quota Pool and Notifications

The active pool is determined from the drop between two consecutive polls:

```text
drop = previous.remaining - current.remaining
```

The pool with the largest drop exceeding `0.1` percentage points becomes the active pool. Prediction, the primary status bar display and low-quota notifications all use this pool.

Because detection happens at the pool level, a simultaneous drop of Flash and Pro produces only one active Gemini pool and one notification cooldown state.

The active pool's weekly limit is checked against the same warning and critical thresholds with its own notification messages and its own cooldown, so a low weekly limit warns even while the 5-hour quota is high.

---

## 6. Display Logic

### 6.1 Group view

With `tfa.dashboard.viewMode = groups`, each quota pool shows one gauge:

- Gemini: uses the original Flash blue `#40C4FF`
- Claude: uses the original Claude orange `#FFAB40`

This avoids presenting a shared quota as multiple independent allowances.

When the pool has a weekly limit, a thin `Weekly` bar under the gauge shows its remaining percentage and a live countdown to its reset; the gauge itself keeps showing the 5-hour quota.

### 6.2 Model view

With `tfa.dashboard.viewMode = models`, the individual models returned by the Language Server are still shown:

- Flash models keep blue.
- Pro models keep green.
- Claude and GPT keep their own model-group colors.
- Models in the same pool share the historical consumption rate computed for that pool.
- Weekly limits are not shown.

### 6.3 Status bar

The status bar can show the current pool or all visible pools. The format includes:

- Quota status emoji
- Short label
- Remaining percentage
- Reset time
- Optional cache size and credits

Status bar data is generated from quota pool state, so the same Gemini quota is not output twice for Flash and Pro.

The text keeps showing the 5-hour value, but the emoji follows the lower of the 5-hour and weekly percentages. The tooltip adds a `<pool> Weekly` row with the weekly percentage and reset time for each pool that has one.

When the quota status bar is enabled and the Language Server connection fails, the status bar switches to a warning state instead of continuing to show the old cached quota. When only the cache display is enabled, it does not depend on the quota connection.

### 6.4 Usage bar chart

The bar chart shows percentage points consumed per time bucket, per quota pool:

- Until a positive quota change has been recorded, the whole bar chart card stays hidden; it appears automatically once the first change enters a history bucket.
- History range: 10-120 minutes, default 90 minutes.
- Time buckets: aggregated from the range and the polling interval, at most about 24 bars.
- Y axis: percentage points consumed within the bucket.
- Legend and colors: from `quotaPools`.

Old history written by model groups before the upgrade is mapped to the current pools. Mirrored records in the same bucket take the maximum drop instead of being summed, which prevents Flash/Pro or Claude/GPT history from doubling.

### 6.5 Prediction

- `usageRate`: pool consumption rate over the selected history range, in `pp/h`.
- `runway`: estimated time to exhaustion based on the current pool's remaining quota and the server reset time.
- Shows `Stable` when there is no consumption.

---

## 7. Cache and Upgrade Compatibility

Main persistence keys:

| Key | Content |
|---|---|
| `tfa.quotaHistory_v2` | Quota history samples |
| `tfa.lastViewState` | Most recent view state |
| `tfa.lastSnapshot` | Most recent server snapshot |

On startup, quota, the active pool and the prediction chart are restored from the full view state and the server snapshot; if the cache still uses old model group IDs but a model snapshot exists, the data is re-aggregated by the current `quotaPoolId`. Old chart series that cannot be mapped to a current pool are ignored.

---

## 8. Related Configuration

| Setting | Default | Description |
|---|---:|---|
| `tfa.dashboard.viewMode` | `groups` | Display by quota pool or by individual model |
| `tfa.dashboard.gaugeStyle` | `semi-arc` | Semi-arc or classic donut |
| `tfa.dashboard.historyRange` | `90` | Chart history range (minutes) |
| `tfa.dashboard.refreshRate` | `90` | Quota refresh interval (seconds) |
| `tfa.dashboard.includeSecondaryModels` | `false` | Whether to show secondary models such as GPT |
| `tfa.dashboard.showCreditsCard` | `false` | Whether to show the static Prompt/Flow rows; Google One AI is always shown |
| `tfa.status.showQuota` | `true` | Whether the status bar shows quota |
| `tfa.status.showCache` | `true` | Whether the status bar shows cache size |
| `tfa.status.scope` | `all` | Whether the status bar shows the primary pool or all pools |
| `tfa.status.warningThreshold` | `40` | Warning threshold |
| `tfa.status.criticalThreshold` | `20` | Critical threshold |

---

## 9. Limitations

- The extension can only use the quota windows the Language Server currently exposes; it cannot derive windows that were not returned. Older servers without `RetrieveUserQuotaSummary` show no weekly limit.
- The 5-hour value comes from the `GetUserStatus` model rows, not from the summary's `5h` buckets; the two can report slightly different reset times.
- Active pool detection depends on polling and may lag by up to one polling cycle.
- Quota pool relationships are provider policy; when they change, `quota_strategy.json` must be updated accordingly. Pools must not be merged automatically just because several models currently show the same value.
