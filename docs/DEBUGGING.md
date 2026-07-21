English | [中文文档](DEBUGGING_zh.md)

# Debugging Antigravity Language Server & Quota Connections

This document describes how to debug, trace, and diagnose connection and quota-related issues between the **Antigravity Panel** extension and the local **Antigravity Language Server**.

---

## 🏗️ 1. IDE Extension Host Debugging

The primary method for interactive debugging of the extension UI and backend:

1. Open the project folder in **Antigravity IDE**.
2. Press **`F5`** (or go to the **Run and Debug** view and select `Run Antigravity Panel (Extension Host)`).
3. This opens a sandboxed **Extension Development Host** window.
4. The extension automatically attempts to detect and connect to your local running **Antigravity Language Server** instance, allowing you to debug with real-time metrics.

*See [.vscode/launch.json](../.vscode/launch.json) for the underlying debug configuration.*

---

## 🔍 2. Process Diagnostics

If the panel fails to display metrics or shows connection errors, use the process diagnostics tool to verify if the Language Server is running.

Run the diagnostic script:
```bash
node scripts/diagnose_processes.js
```

### What It Does:
* Scans the system for running `language_server` processes.
* Extracts and prints essential command-line arguments:
  * `--port`: The local API port.
  * `--extension_server_port`: The port used for IDE-to-LS communication.
  * `--csrf_token`: The authentication token required for API requests.

---

## 📡 3. Live Quota Retrieval & Verification

To verify that the Language Server is responding correctly to API requests and to inspect the raw payload returned by the server:

Run the real-time fetch script:
```bash
node scripts/fetch_real_quota.js
```

### What It Does:
1. Automatically discovers the active Language Server process.
2. Resolves the active port and extracts the API CSRF token.
3. Sends a real `POST` request to the server's endpoint:
   `/exa.language_server_pb.LanguageServerService/GetUserStatus`
4. Prints the formatted JSON response returned by the server.

---

## 🛠️ 4. Binary Schema & Serialization Inspection

When server fields disappear or behave unexpectedly (e.g., missing properties in the JSON response), you can inspect the compiled Go Protobuf definitions directly from the server binary.

### Example: Inspecting Credit-Related Fields
The Language Server binary is typically located at:
`~/.antigravity-ide-server/bin/<version>/extensions/antigravity/bin/language_server_linux_x64`

Run the following command to filter strings in the binary:
```bash
strings ~/.antigravity-ide-server/bin/*/extensions/antigravity/bin/language_server_linux_x64 | grep -iE 'creditAmount|creditType|minimumCreditAmountForUsage'
```

### Understanding Protobuf `omitempty` Serialization:
Many numeric fields (like `creditAmount` / `credit_amount`) in the server's Protobuf definitions are marked with `json:"...,omitempty"`.
* **Behavior:** When a user's credit balance is `0`, Go's JSON encoder completely omits the key from the response instead of outputting `"creditAmount": 0`.
* **Impact:** The client extension parses this omission as `undefined` in JavaScript, which can cause UI bugs (e.g., displaying `💳 undefined` in the status bar).
* **Fix Strategy:** Always implement defensive type validation when parsing lists, mapping missing properties to their safe defaults (like `'0'`).

---

## 🧪 5. Running Automated Tests

To ensure changes to the parsing and debugging code do not break existing functionality:

* **Run unit tests:**
  ```bash
  npm test
  ```
* **Run integration/server tests only:**
  ```bash
  npm run test:server
  ```
