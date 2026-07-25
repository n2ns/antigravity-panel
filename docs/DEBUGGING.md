English | [中文文档](DEBUGGING_zh.md)

# Debugging Antigravity Language Server and Quota Connections

This document covers interactive extension debugging and the local tools that connect to a real Antigravity Language Server.

## 1. Extension Host debugging

1. Open the project folder in Antigravity IDE.
2. Press `F5`, or select **Run Antigravity Panel (Extension Host)** from **Run and Debug**.
3. The Extension Development Host starts the extension and connects to the local Language Server.

See [.vscode/launch.json](../.vscode/launch.json) for the launch configuration.

## 2. Local real-server tools

All tools live under `scripts/debug/`. They are development-only, are excluded from the VSIX, and expect Antigravity IDE and its Language Server to be running locally.

| Command | Purpose |
| --- | --- |
| `npm run debug:processes` | Inspect Language Server processes and connection arguments |
| `npm run debug:quota` | Fetch and print the complete real `GetUserStatus` response |
| `npm run debug:server` | Verify the production `ProcessFinder` and `QuotaService` path |
| `npm run debug:windows-tree` | Inspect native Windows IDE/Extension Host/Language Server ancestry |

Successful tools exit with code `0`. Detection or connection failures exit with code `1`. The Windows-only tool exits with code `2` when run outside native Windows.

### 2.1 Inspect Language Server processes

```bash
npm run debug:processes
```

This lists matching processes, PIDs, parent PIDs, workspace IDs, ports, complete CSRF tokens, and the relevant command-line arguments.

### 2.2 Fetch the raw quota endpoint independently

```bash
npm run debug:quota
```

This standalone JavaScript tool discovers a real Language Server process, probes its localhost ports over HTTPS and then HTTP, requests:

```text
/exa.language_server_pb.LanguageServerService/GetUserStatus
```

and prints the protocol used and the complete real response.

### 2.3 Verify the production connection path

```bash
npm run debug:server
```

This command compiles the TypeScript debug entry with `tsconfig.debug.json`, then exercises the same production `ProcessFinder`, protocol fallback, `QuotaService`, parser, and logger used by the extension and prints the complete parsed snapshot. It is the preferred check after changing connection or parsing code.

Use `debug:quota` when you need an independent raw endpoint check. Use `debug:server` when you need to verify the extension's production code path.

### 2.4 Inspect the native Windows process tree

Run this from native Windows Node.js:

```bash
npm run debug:windows-tree
```

It reports only real IDE, Extension Host, and `language_server_windows_x64.exe` ancestry. It does not create simulated processes. This command is not intended for WSL or Linux Node.js.

## 3. Binary schema and serialization inspection

When server fields disappear or behave unexpectedly, inspect the compiled Go Protobuf strings in the Language Server binary. A typical Linux installation is:

```text
~/.antigravity-ide-server/bin/<version>/extensions/antigravity/bin/language_server_linux_x64
```

Example:

```bash
strings ~/.antigravity-ide-server/bin/*/extensions/antigravity/bin/language_server_linux_x64 | grep -iE 'creditAmount|creditType|minimumCreditAmountForUsage'
```

Numeric Protobuf fields may use `omitempty`. A zero value can therefore be absent from JSON rather than returned as `0`; parsing code should map missing optional numeric fields to an intentional default.

## 4. Automated validation

```bash
npm test
npm run test:server
npm run typecheck
npm run typecheck:debug
npm run lint
npm run check:l10n
npm run build
```

`npm run test:server` connects to the real local server when available and skips its live checks when no server is running. The four `debug:*` commands are manual diagnostics and are not run in CI.
