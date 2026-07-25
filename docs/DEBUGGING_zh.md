[English](DEBUGGING.md) | 中文文档

# 调试 Antigravity Language Server 与配额连接

本文档说明如何交互式调试扩展，以及如何使用本地工具连接真实的 Antigravity Language Server。

## 1. Extension Host 调试

1. 在 Antigravity IDE 中打开项目目录。
2. 按 `F5`，或在 **Run and Debug** 中选择 **Run Antigravity Panel (Extension Host)**。
3. Extension Development Host 会启动扩展并连接本地 Language Server。

启动配置见 [.vscode/launch.json](../.vscode/launch.json)。

## 2. 本地真实服务器工具

所有工具统一放在 `scripts/debug/`。它们仅用于本地开发，不会进入 VSIX，并且要求 Antigravity IDE 及其 Language Server 正在本机运行。

| 命令 | 用途 |
| --- | --- |
| `npm run debug:processes` | 检查 Language Server 进程及连接参数 |
| `npm run debug:quota` | 独立请求并输出完整真实 `GetUserStatus` 响应 |
| `npm run debug:server` | 验证生产 `ProcessFinder` 与 `QuotaService` 链路 |
| `npm run debug:windows-tree` | 检查原生 Windows 下 IDE、Extension Host 与 Language Server 的进程祖先关系 |

工具成功时退出码为 `0`，检测或连接失败时为 `1`。Windows 专用工具在非原生 Windows 环境运行时退出码为 `2`。

### 2.1 检查 Language Server 进程

```bash
npm run debug:processes
```

该命令列出匹配的进程、PID、父 PID、workspace ID、端口、完整 CSRF token 及相关命令行参数。

### 2.2 独立获取真实配额响应

```bash
npm run debug:quota
```

这个独立 JavaScript 工具会发现真实 Language Server 进程，依次通过 HTTPS 和 HTTP 探测其 localhost 监听端口，并请求：

```text
/exa.language_server_pb.LanguageServerService/GetUserStatus
```

并直接输出实际使用的协议和完整真实响应。在 Linux 上，如果 `ss` 和 `netstat` 不可用或无法识别监听端口所属 PID，端口发现会回退到目标进程的 `/proc` socket 描述符。

### 2.3 验证生产连接链路

```bash
npm run debug:server
```

该命令先通过 `tsconfig.debug.json` 编译 TypeScript 调试入口，再运行扩展实际使用的 `ProcessFinder`、协议回退、`QuotaService`、解析器和 logger，并直接输出完整解析后的 snapshot。修改连接或解析代码后，应优先运行此命令。

需要独立核对原始端点时使用 `debug:quota`；需要验证扩展生产代码链路时使用 `debug:server`。

### 2.4 检查原生 Windows 进程树

请在原生 Windows Node.js 环境运行：

```bash
npm run debug:windows-tree
```

该工具只报告真实的 IDE、Extension Host 与 `language_server_windows_x64.exe` 祖先关系，不再创建模拟进程。它不适用于 WSL 或 Linux Node.js。

## 3. 二进制架构与序列化检查

当服务端字段消失或行为异常时，可以检查 Language Server 二进制文件中的 Go Protobuf 字符串。Linux 环境的典型位置为：

```text
~/.antigravity-ide-server/bin/<version>/extensions/antigravity/bin/language_server_linux_x64
```

示例：

```bash
strings ~/.antigravity-ide-server/bin/*/extensions/antigravity/bin/language_server_linux_x64 | grep -iE 'creditAmount|creditType|minimumCreditAmountForUsage'
```

Protobuf 数值字段可能使用 `omitempty`。零值可能从 JSON 中完全省略，而不是返回 `0`；解析代码应为缺失的可选数值字段提供明确默认值。

## 4. 自动化验证

```bash
npm test
npm run test:server
npm run typecheck
npm run typecheck:debug
npm run lint
npm run check:l10n
npm run build
```

本机服务器可用时，`npm run test:server` 会连接真实服务器；服务器不存在时会跳过 live 检查。四个 `debug:*` 命令是手工诊断入口，不会在 CI 中运行。
