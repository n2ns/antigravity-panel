/**
 * PlatformStrategies: Cross-platform process detection strategies
 */

import { ProcessInfo, PlatformStrategy } from "../utils/types";

// Re-export types for backward compatibility
export type { ProcessInfo, PlatformStrategy };

/**
 * Windows platform strategy using PowerShell and WMIC
 */
export class WindowsStrategy implements PlatformStrategy {
  private isAntigravityProcess(commandLine: string): boolean {
    const lowerCmd = commandLine.toLowerCase();
    if (/--app_data_dir\s+antigravity\b/i.test(commandLine)) {
      return true;
    }
    return lowerCmd.includes("\\antigravity\\") || lowerCmd.includes("/antigravity/");
  }

  getProcessListCommand(processName: string): string {
    return `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${processName}'\\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json"`;
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
        if (!item.CommandLine || !this.isAntigravityProcess(item.CommandLine)) {
          continue;
        }

        const commandLine = item.CommandLine || "";
        const pid = item.ProcessId;
        const ppid = item.ParentProcessId;

        if (!pid) {
          continue;
        }

        const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
        const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/);

        if (tokenMatch?.[1]) {
          results.push({
            pid,
            ppid,
            extensionPort: portMatch?.[1] ? parseInt(portMatch[1], 10) : 0,
            csrfToken: tokenMatch[1],
          });
        }
      }

      return results.length > 0 ? results : null;
    } catch {
      return null;
    }
  }

  getPortListCommand(pid: number): string {
    return `netstat -ano | findstr "${pid}" | findstr "LISTENING"`;
  }

  parseListeningPorts(stdout: string): number[] {
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
}

/**
 * Unix (macOS / Linux) platform strategy using ps and lsof
 */
export class UnixStrategy implements PlatformStrategy {
  constructor(private platform: "darwin" | "linux") { }

  getProcessListCommand(processName: string): string {
    // Use 'ps' to get PID, PPID, and Command Line.
    // -A: Select all processes
    // -o: Specify output format
    // grep: Filter for our process name (brackets [n] trick prevents grep from matching itself)
    // -ww: (macOS) Unlimited width output to prevent command truncation
    const grepPattern = processName.length > 0 ? `[${processName[0]}]${processName.slice(1)}` : processName;
    return `ps -A -ww -o pid,ppid,command | grep "${grepPattern}"`;
  }

  parseProcessInfo(stdout: string): ProcessInfo[] | null {
    const lines = stdout.trim().split("\n");
    const results: ProcessInfo[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse columns: PID PPID COMMAND...
      // Regex handles leading spaces and splits by whitespace
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);

      if (match) {
        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        const cmd = match[3];

        if (cmd.includes("--extension_server_port")) {
          const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
          const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/);

          results.push({
            pid,
            ppid, // Now allows ancestry checking on Unix
            extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
            csrfToken: tokenMatch ? tokenMatch[1] : "",
          });
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  getPortListCommand(pid: number): string {
    return this.platform === "darwin"
      ? `lsof -iTCP -sTCP:LISTEN -n -P -p ${pid}`
      : `ss -tlnp 2>/dev/null | grep "pid=${pid}" || lsof -iTCP -sTCP:LISTEN -n -P -p ${pid} 2>/dev/null`;
  }

  parseListeningPorts(stdout: string): number[] {
    const ports: number[] = [];
    let match;

    if (this.platform === "darwin") {
      const lsofRegex = /(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/gi;
      while ((match = lsofRegex.exec(stdout)) !== null) {
        const port = parseInt(match[1], 10);
        if (!ports.includes(port)) {
          ports.push(port);
        }
      }
    } else {
      const ssRegex = /LISTEN\s+\d+\s+\d+\s+(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+)/gi;
      while ((match = ssRegex.exec(stdout)) !== null) {
        const port = parseInt(match[1], 10);
        if (!ports.includes(port)) {
          ports.push(port);
        }
      }
      if (ports.length === 0) {
        const lsofRegex = /(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/gi;
        while ((match = lsofRegex.exec(stdout)) !== null) {
          const port = parseInt(match[1], 10);
          if (!ports.includes(port)) {
            ports.push(port);
          }
        }
      }
    }
    return ports.sort((a, b) => a - b);
  }
}

