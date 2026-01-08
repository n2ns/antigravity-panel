/**
 * PlatformStrategies: Cross-platform process detection strategies
 */

import { ProcessInfo, PlatformStrategy } from "../utils/types";

// Re-export types for backward compatibility
export type { ProcessInfo, PlatformStrategy };

/**
 * Windows platform strategy using PowerShell
 * Compatible with PowerShell 5.1 and pwsh 7.x
 * Note: Windows 7 is not supported (requires PowerShell 3.0+)
 */
export class WindowsStrategy implements PlatformStrategy {
  getProcessListCommand(processName: string): string {
    // PowerShell script for Windows 10/11
    // 1. [Console]::OutputEncoding: Ensures UTF-8 output to handle special characters in paths
    // 2. @( ... ): Forces result into an array structure
    // 3. if ($p): Ensures we return '[]' instead of empty string if no process is found
    // Note: Only using Get-CimInstance (no Get-WmiObject fallback) for pwsh 7 compatibility
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $n = '${processName}';
      $f = "name='$n'";
      $p = Get-CimInstance Win32_Process -Filter $f -ErrorAction SilentlyContinue;
      if ($p) { @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
    `.replace(/\n\s+/g, ' ').trim();

    return `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`;
  }

  getProcessListByKeywordCommand(keyword: string): string {
    // Fallback strategy: Search all processes for the specific keyword in CommandLine
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $k = '${keyword}';
      $p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $k } -ErrorAction SilentlyContinue;
      if ($p) { @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
    `.replace(/\n\s+/g, ' ').trim();

    return `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`;
  }

  parseProcessInfo(stdout: string): ProcessInfo[] | null {
    try {
      const data = JSON.parse(stdout.trim());
      interface WindowsProcessItem {
        ProcessId: number;
        ParentProcessId: number;
        CommandLine: string | null;
      }
      let processList: WindowsProcessItem[] = [];

      if (Array.isArray(data)) {
        processList = data;
      } else {
        processList = [data];
      }

      const results: ProcessInfo[] = [];

      for (const item of processList) {
        const commandLine = item.CommandLine || "";
        const pid = item.ProcessId;
        const ppid = item.ParentProcessId;

        if (!pid) {
          continue;
        }

        const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
        // Match workspace_id and csrf_token (handles optional quotes)
        const tokenMatch = commandLine.match(/--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);
        const wsMatch = commandLine.match(/--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);

        if (tokenMatch?.[1]) {
          // STRICT CHECK: Ensure process belongs to Antigravity
          if (!commandLine.includes('--app_data_dir') || !/app_data_dir\s+["']?antigravity/i.test(commandLine)) {
            continue;
          }

          results.push({
            pid,
            ppid,
            extensionPort: portMatch?.[1] ? parseInt(portMatch[1], 10) : 0,
            csrfToken: tokenMatch[1],
            workspaceId: wsMatch?.[1],
          });
        }
      }

      return results.length > 0 ? results : null;
    } catch {
      return null;
    }
  }

  getPortListCommand(pid: number): string {
    return `chcp 65001 >nul && netstat -ano | findstr "${pid}" | findstr "LISTENING"`;
  }

  parseListeningPorts(stdout: string, _pid: number): number[] {
    // Windows netstat + findstr already filters by PID, so we just parse all matches
    const portRegex = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING/gi;
    const ports: number[] = [];
    let match;
    while ((match = portRegex.exec(stdout)) !== null) {
      const port = parseInt(match[1], 10);
      if (!ports.includes(port)) {
        ports.push(port);
      }
    }
    return ports.sort((a, b) => a - b);
  }

  /**
   * Get diagnostic command to list all language/antigravity related processes
   * Used when detection fails to help troubleshoot
   */
  getDiagnosticCommand(): string {
    const utf8Header = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
    return `chcp 65001 >nul && powershell -NoProfile -Command "${utf8Header}Get-Process | Where-Object { $_.ProcessName -match 'language|antigravity' } | Select-Object Id,ProcessName,Path | Format-Table -AutoSize"`;
  }

  /**
   * Get troubleshooting tips for Windows
   */
  getTroubleshootingTips(): string[] {
    return [
      'Ensure Antigravity IDE is running',
      'Check if language_server_windows_x64.exe is in Task Manager',
      'Try restarting Antigravity IDE / VS Code',
      'If PowerShell errors occur, try: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned',
      'If WMI errors occur, try: net start winmgmt (run as admin)'
    ];
  }
}

/**
 * Unix (macOS / Linux) platform strategy using ps and lsof
 */
export class UnixStrategy implements PlatformStrategy {
  // Dynamic port command detection (learned from competitor: vscode-antigravity-cockpit)
  private availablePortCommand: 'lsof' | 'ss' | 'netstat' | null = null;
  private portCommandChecked: boolean = false;

  constructor(private platform: "darwin" | "linux") { }

  getProcessListCommand(processName: string): string {
    // Use 'ps' to get PID, PPID, and full Arguments.
    // -A: Select all processes
    // -o: Specify output format
    // args: Full command line (more reliable than 'command' on some systems)
    // grep: Filter for our process name (brackets [n] trick prevents grep from matching itself)
    // -ww: Unlimited width output to prevent command truncation
    const grepPattern = processName.length > 0 ? `[${processName[0]}]${processName.slice(1)}` : processName;
    return `ps -A -ww -o pid,ppid,args | grep "${grepPattern}"`;
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

        if (cmd.includes("--extension_server_port")) {
          const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
          // Match workspace_id and csrf_token (handles optional quotes)
          const tokenMatch = cmd.match(/--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);
          const wsMatch = cmd.match(/--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);

          if (tokenMatch?.[1]) {
            // STRICT CHECK: Ensure process belongs to Antigravity
            if (!cmd.includes('--app_data_dir') || !/app_data_dir\s+["']?antigravity/i.test(cmd)) {
              continue;
            }

            results.push({
              pid,
              ppid,
              extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
              csrfToken: tokenMatch[1],
              workspaceId: wsMatch?.[1],
            });
          }
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  getPortListCommand(pid: number): string {
    // macOS: Use -a (AND all conditions) and grep to filter by PID at command level
    // This ensures we only get ports from the target process, not other processes
    // Reference: Learned from competitor analysis (vscode-antigravity-cockpit)
    if (this.platform === "darwin") {
      return `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
    }

    // Linux: Use detected command, fallback to chain if not yet detected
    switch (this.availablePortCommand) {
      case 'lsof':
        return `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
      case 'ss':
        return `ss -tlnp 2>/dev/null | grep "pid=${pid},"`;
      case 'netstat':
        return `netstat -tulpn 2>/dev/null | grep ${pid}`;
      default:
        // Fallback: try multiple commands in order
        return `ss -tlnp 2>/dev/null | grep "pid=${pid}" || lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
    }
  }

  /**
   * Detect available port detection command on the system
   * Priority: lsof > ss > netstat
   * Call this before getPortListCommand for optimal command selection
   */
  async detectAvailablePortCommand(): Promise<void> {
    if (this.portCommandChecked || this.platform === 'darwin') {
      return; // macOS always uses lsof, no need to detect
    }
    this.portCommandChecked = true;

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const commands = ['lsof', 'ss', 'netstat'] as const;

    for (const cmd of commands) {
      try {
        await execAsync(`which ${cmd}`, { timeout: 3000 });
        this.availablePortCommand = cmd;
        // debugLog would be nice here but we don't have access to it in this file
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
    const lines = stdout.split('\n');

    if (this.platform === "darwin") {
      // lsof output format: COMMAND PID USER FD TYPE ... NAME
      // Filter lines by PID (second column) before extracting ports
      // This fixes Issue #21: lsof may return ports from other processes
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // Check if line belongs to target PID (second column)
        if (parts.length >= 2 && parts[1] === pidStr) {
          const portMatch = line.match(/(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/i);
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
      const ssRegex = /LISTEN\s+\d+\s+\d+\s+(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+)/gi;
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
            const portMatch = line.match(/(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/i);
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
    return `ps aux | grep -E 'language|antigravity' | grep -v grep`;
  }

  /**
   * Get troubleshooting tips for Unix
   */
  getTroubleshootingTips(): string[] {
    const processName = this.platform === 'darwin'
      ? 'language_server_macos_*'
      : 'language_server_linux_x64';

    return [
      'Ensure Antigravity IDE is running',
      `Check if ${processName} process is running: ps aux | grep language_server`,
      'Try restarting Antigravity IDE',
      'Check system logs for any process crashes'
    ];
  }
}

