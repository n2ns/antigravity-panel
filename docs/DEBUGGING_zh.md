[English](DEBUGGING.md) | 中文文档

# 调试 Antigravity Language Server 与配额连接

本文档说明如何调试、追踪并诊断 **Antigravity Panel** 扩展与本地 **Antigravity Language Server** 之间的连接和配额相关问题。

---

## 🏗️ 1. IDE Extension Host 调试

交互式调试扩展 UI 和后端逻辑的主要方式：

1. 在 **Antigravity IDE** 中打开项目目录。
2. 按 **`F5`**，或进入 **Run and Debug** 视图并选择 `Run Antigravity Panel (Extension Host)`。
3. 这会打开一个隔离的 **Extension Development Host** 窗口。
4. 扩展会自动尝试检测并连接本地运行中的 **Antigravity Language Server** 实例，以便使用真实指标进行调试。

*底层调试配置见 [.vscode/launch.json](../.vscode/launch.json)。*

---

## 🔍 2. 进程诊断

如果面板无法显示指标或出现连接错误，可以使用进程诊断工具确认 Language Server 是否正在运行。

运行诊断脚本：
```bash
node scripts/diagnose_processes.js
```

### 功能说明：
* 扫描系统中正在运行的 `language_server` 进程。
* 提取并打印关键命令行参数：
  * `--port`：本地 API 端口。
  * `--extension_server_port`：IDE 与 Language Server 通信使用的端口。
  * `--csrf_token`：API 请求所需的认证令牌。

---

## 📡 3. 实时配额获取与验证

要验证 Language Server 是否能正确响应 API 请求，并查看服务端返回的原始数据：

运行实时获取脚本：
```bash
node scripts/fetch_real_quota.js
```

### 功能说明：
1. 自动发现活动的 Language Server 进程。
2. 解析活动端口并提取 API CSRF token。
3. 向服务端端点发送真实 `POST` 请求：
   `/exa.language_server_pb.LanguageServerService/GetUserStatus`
4. 打印服务端返回的格式化 JSON 响应。

---

## 🛠️ 4. 二进制架构与序列化检查

当服务端字段消失或表现异常时，例如 JSON 响应中缺少某些属性，可以直接从服务端二进制文件中检查已编译的 Go Protobuf 定义。

### 示例：检查 Credit 相关字段
Language Server 二进制文件通常位于：
`~/.antigravity-ide-server/bin/<version>/extensions/antigravity/bin/language_server_linux_x64`

运行以下命令过滤二进制文件中的字符串：
```bash
strings ~/.antigravity-ide-server/bin/*/extensions/antigravity/bin/language_server_linux_x64 | grep -iE 'creditAmount|creditType|minimumCreditAmountForUsage'
```

### 理解 Protobuf `omitempty` 序列化：
服务端 Protobuf 定义中的许多数值字段，例如 `creditAmount` / `credit_amount`，会带有 `json:"...,omitempty"` 标记。
* **行为：** 当用户配额余额为 `0` 时，Go JSON 编码器会从响应中完全省略该 key，而不是输出 `"creditAmount": 0`。
* **影响：** 客户端扩展会把缺失字段解析为 JavaScript 中的 `undefined`，可能导致 UI 问题，例如状态栏显示 `💳 undefined`。
* **修复策略：** 解析列表数据时始终做防御性类型校验，并把缺失属性映射到安全默认值，例如 `'0'`。

---

## 🧪 5. 运行自动化测试

为确保解析和调试相关代码改动不会破坏现有功能：

* **运行全部测试：**
  ```bash
  npm test
  ```
* **仅运行集成/服务端测试：**
  ```bash
  npm run test:server
  ```
