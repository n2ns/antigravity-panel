/**
 * PlatformStrategies: Cross-platform process detection strategies
 */

import type { ProcessInfo, PlatformStrategy } from "../utils/types";
import {
  getPortListCommand,
  parseServerCommandLine,
} from "./detection_utils";

/** Windows process item from PowerShell/WMI output */
interface WinProcessItem {
  ProcessId?: number;
  ParentProcessId?: number;
  CommandLine?: string;
}

/**
 * Windows platform strategy using PowerShell
 * Compatible with PowerShell 5.1 and pwsh 7.x
 * Note: Windows 7 is not supported (requires PowerShell 3.0+)
 */
export class WindowsStrategy implements PlatformStrategy {
  getProcessListCommand(processNames: string[]): string {
    // PowerShell script for Windows 10/11
    // 1. [Console]::OutputEncoding: Ensures UTF-8 output to handle special characters in paths
    // 2. @( ... ): Forces result into an array structure
    // 3. if ($p): Ensures we return '[]' instead of empty string if no process is found
    // Note: Only using Get-CimInstance (no Get-WmiObject fallback) for pwsh 7 compatibility
    // FIX: Use single-quote concatenation to build WQL filter string.
    // Previous approach using double quotes inside the -Command string was stripped by cmd.exe
    // when Node.js exec() passes through the Windows shell, causing PowerShell to misparse.
    // Single quotes avoid cmd.exe interpretation entirely. (fixes #40, #45, #XX)
    // The WQL filter stays inside a PowerShell single-quoted literal, so each
    // embedded quote is doubled.
    const filter = processNames
      .map((name) => `name='${name}'`)
      .join(" or ")
      .replace(/'/g, "''");
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $f = '${filter}';
      $p = Get-CimInstance Win32_Process -Filter $f -ErrorAction SilentlyContinue;
      if ($p) { @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
    `
      .replace(/\n\s+/g, " ")
      .trim();

    return `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`;
  }

  getProcessListByKeywordCommand(keyword: string): string {
    // Fallback strategy: Search all processes for the specific keyword in CommandLine
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $k = '${keyword}';
      $p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $k } -ErrorAction SilentlyContinue;
      if ($p) { @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
    `
      .replace(/\n\s+/g, " ")
      .trim();

    return `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`;
  }

  getFallbackProcessListCommand(): string {
    // Fallback: Use wmic (more robust on older/restricted systems than PowerShell CIM)
    // /format:csv outputs: Node,CommandLine,ParentProcessId,ProcessId
    // Note: We filter by name to reduce output, but 'language_server' might be renamed,
    // so we trust the caller (process_finder) usually invokes this when primary failed.
    // Ideally we list all, but that's heavy. Let's try to filter by commandline buffer if possible?
    // WMIC 'where' clause on CommandLine is tricky.
    // Let's filter by name 'language_server%' OR 'antigravity%' OR 'agy%' to be safe.
    return "wmic process where \"name like '%language_server%' or name like '%antigravity%' or name = 'agy.exe'\" get ProcessId,ParentProcessId,CommandLine /format:csv";
  }

  parseProcessInfo(stdout: string): ProcessInfo[] | null {
    try {
      // 1. Try parsing JSON (PowerShell output)
      // 1. Try parsing JSON (PowerShell output)
      // Robustness: PowerShell profiles might output text before our JSON. Find the start array/object.
      const trimmed = stdout.trim();
      const firstBracket = trimmed.indexOf("[");
      const firstBrace = trimmed.indexOf("{");

      let jsonCandidate = trimmed;
      if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
        jsonCandidate = trimmed.substring(firstBracket);
      } else if (firstBrace !== -1) {
        jsonCandidate = trimmed.substring(firstBrace);
      }

      if (jsonCandidate.startsWith("[") || jsonCandidate.startsWith("{")) {
        const data = JSON.parse(jsonCandidate);
        const processList: WinProcessItem[] = Array.isArray(data)
          ? data
          : [data];
        return this.mapProcessItems(processList);
      }

      // 2. Try parsing CSV (wmic output)
      // Header: Node,CommandLine,ParentProcessId,ProcessId (sorted alphabetically by column name in /format:csv)
      if (stdout.includes("CommandLine") && stdout.includes("ProcessId")) {
        const lines = stdout.trim().split("\n");
        const results: ProcessInfo[] = [];

        for (const line of lines) {
          const row = line.trim();
          if (!row || row.startsWith("Node,")) continue; // Skip header

          // WMIC CSV format: Node, "CommandLine", ParentProcessId, ProcessId
          // But sometimes quotes are missing or different.
          // Crucially, ProcessId is the last number.

          // Extract PPID and PID (last two numbers)
          const idsMatch = row.match(/,(\d+),(\d+)\s*$/);
          if (!idsMatch) continue;

          const ppid = parseInt(idsMatch[1], 10);
          const pid = parseInt(idsMatch[2], 10);
          // We mostly need CLI args from the string
          const parsed = parseServerCommandLine(row);
          if (!parsed) continue;

          results.push({ pid, ppid, ...parsed, extensionPort: parsed.serverPort });
        }
        return results.length > 0 ? results : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private mapProcessItems(processList: WinProcessItem[]): ProcessInfo[] | null {
    const results: ProcessInfo[] = [];

    for (const item of processList) {
      const commandLine = item.CommandLine || "";
      const pid = item.ProcessId;
      const ppid = item.ParentProcessId;

      if (!pid) continue;

      const parsed = parseServerCommandLine(commandLine);
      if (!parsed) continue;

      results.push({ pid, ppid, ...parsed, extensionPort: parsed.serverPort });
    }
    return results.length > 0 ? results : null;
  }

  getPortListCommand(pid: number): string {
    const utf8Header =
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
    // Use Get-NetTCPConnection (Win8+) for faster and cleaner port detection
    return `chcp 65001 >nul && powershell -NoProfile -Command "${utf8Header}$p = Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort; if ($p) { $p | Sort-Object -Unique }"`;
  }

  parseListeningPorts(stdout: string, _pid: number): number[] {
    const ports: number[] = [];
    const lines = stdout.trim().split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      // Only accept pure numbers (ports)
      if (/^\d+$/.test(trimmed)) {
        const port = parseInt(trimmed, 10);
        if (port > 0 && port <= 65535) {
          ports.push(port);
        }
      }
    }
    // Deduplicate and sort
    return [...new Set(ports)].sort((a, b) => a - b);
  }

  /**
   * Get diagnostic command to list all language/antigravity related processes
   * Used when detection fails to help troubleshoot
   */
  getDiagnosticCommand(): string {
    const utf8Header =
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ";
    return `chcp 65001 >nul && powershell -NoProfile -Command "${utf8Header}Get-Process | Where-Object { $_.ProcessName -match 'language|antigravity|agy' } | Select-Object Id,ProcessName,Path | Format-Table -AutoSize"`;
  }

  getProcessCrossCheckCommand(): string {
    // tasklist does not depend on PowerShell or WMI, so it shows whether those are the failing layer
    return "tasklist /FO CSV /NH";
  }

  getProcessQueryProbeCommand(): string {
    // The detection scripts use -ErrorAction SilentlyContinue, which hides CIM failures; surface them here
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      try { $c = @(Get-CimInstance Win32_Process -ErrorAction Stop).Count; 'CIM ok, processes: ' + $c }
      catch { 'CIM error: ' + $_.Exception.Message }
    `
      .replace(/\n\s+/g, " ")
      .trim();

    return `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`;
  }

  /**
   * Get troubleshooting tips for Windows
   */
  getTroubleshootingTips(): string[] {
    return [
      "Ensure Antigravity is running",
      "Check if agy.exe (Antigravity 1.10+) or language_server_windows_x64.exe (older builds) is in Task Manager",
      "Try restarting Antigravity IDE / VS Code",
      "If PowerShell errors occur, try: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned",
      "If WMI errors occur, try: net start winmgmt (run as admin)",
    ];
  }
}

/**
 * Unix (macOS / Linux) platform strategy using ps and lsof
 */
export class UnixStrategy implements PlatformStrategy {
  private availablePortCommand: "lsof" | "ss" | "netstat" | null = null;
  private portCommandChecked: boolean = false;

  constructor(private platform: "darwin" | "linux") { }

  getProcessListCommand(processNames: string[]): string {
    // Use 'ps' to get PID, PPID, and full Arguments.
    // -A: Select all processes
    // -o: Specify output format
    // args: Full command line (more reliable than 'command' on some systems)
    // -ww: Unlimited width output to prevent command truncation
    //
    // Both backend generations are listed: the legacy `language_server_*` and
    // the 1.10+ `agy --hub` binary. The names are anchored to the executable
    // path, because a plain `grep agy` also matches unrelated paths such as
    // "antigravity-panel" appearing in another process command line.
    const pattern = processNames
      .filter((name) => name.length > 0)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (pattern.length === 0) return "ps -A -ww -o pid=,ppid=,args=";
    return `ps -A -ww -o pid=,ppid=,args= | grep -E '(^|/)(${pattern})( |$)'`;
  }

  getProcessListByKeywordCommand(keyword: string): string {
    // Fallback strategy: Search for keyword in full command line
    return `ps -A -ww -o pid,ppid,args | grep "${keyword}" | grep -v grep`;
  }

  parseProcessInfo(stdout: string): ProcessInfo[] | null {
    const lines = stdout.trim().split("\n");
    const results: ProcessInfo[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse columns: PID PPID ARGS...
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);

      if (match) {
        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        const cmd = match[3];

        // Accepts `agy --hub` (--hub-port) and the legacy language server
        // (--extension_server_port); both carry --csrf_token and --app_data_dir.
        const parsed = parseServerCommandLine(cmd);
        if (!parsed) continue;

        results.push({ pid, ppid, ...parsed, extensionPort: parsed.serverPort });
      }
    }

    return results.length > 0 ? results : null;
  }

  getPortListCommand(pid: number): string {
    return getPortListCommand(pid, this.platform, this.availablePortCommand || undefined);
  }

  /**
   * Detect available port detection command on the system
   * Priority: lsof > ss > netstat
   * Call this before getPortListCommand for optimal command selection
   */
  async detectAvailablePortCommand(): Promise<void> {
    if (this.portCommandChecked || this.platform === "darwin") {
      return; // macOS always uses lsof, no need to detect
    }
    this.portCommandChecked = true;

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const commands = ["lsof", "ss", "netstat"] as const;

    for (const cmd of commands) {
      try {
        await execAsync(`which ${cmd}`, { timeout: 3000 });
        this.availablePortCommand = cmd;
        return;
      } catch {
        // Command not available, try next
      }
    }

    // No command available, will use fallback chain in getPortListCommand
  }

  parseListeningPorts(stdout: string, pid: number): number[] {
    const ports: number[] = [];
    const pidStr = String(pid);
    const lines = stdout.split("\n");

    if (this.platform === "darwin") {
      // lsof output format: COMMAND PID USER FD TYPE ... NAME
      // Filter lines by PID (second column) before extracting ports
      // This fixes Issue #21: lsof may return ports from other processes
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // Check if line belongs to target PID (second column)
        if (parts.length >= 2 && parts[1] === pidStr) {
          const portMatch = line.match(
            /(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/i,
          );
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (!ports.includes(port)) {
              ports.push(port);
            }
          }
        }
      }
    } else {
      // Linux: ss output already filters by pid via grep in command
      // But we still apply PID check for lsof fallback
      let match;
      const ssRegex =
        /LISTEN\s+\d+\s+\d+\s+(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+)/gi;
      while ((match = ssRegex.exec(stdout)) !== null) {
        const port = parseInt(match[1], 10);
        if (!ports.includes(port)) {
          ports.push(port);
        }
      }
      if (ports.length === 0) {
        // lsof fallback - apply PID filtering like macOS
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[1] === pidStr) {
            const portMatch = line.match(
              /(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/i,
            );
            if (portMatch) {
              const port = parseInt(portMatch[1], 10);
              if (!ports.includes(port)) {
                ports.push(port);
              }
            }
          }
        }
      }
    }
    return ports.sort((a, b) => a - b);
  }

  /**
   * Get diagnostic command to list all language/antigravity related processes
   * Used when detection fails to help troubleshoot
   */
  getDiagnosticCommand(): string {
    return `ps aux | grep -E 'language_server|(^|/)agy( |$)|antigravity' | grep -v grep`;
  }

  /**
   * Get troubleshooting tips for Unix
   */
  getTroubleshootingTips(): string[] {
    const processName =
      this.platform === "darwin"
        ? "language_server_macos_*"
        : "language_server_linux_x64";

    return [
      "Ensure Antigravity is running",
      `Check that the backend is running: ps aux | grep -E 'agy|language_server' (Antigravity 1.10+ runs "agy --hub", older builds run ${processName})`,
      "Try restarting Antigravity IDE",
      "Check system logs for any process crashes",
    ];
  }
}
