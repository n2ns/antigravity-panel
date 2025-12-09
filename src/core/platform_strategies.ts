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
    return `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${processName}'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;
  }

  parseProcessInfo(stdout: string): ProcessInfo | null {
    try {
      let data = JSON.parse(stdout.trim());
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return null;
        }
        const antigravityProcesses = data.filter(
          (item: { CommandLine?: string }) =>
            item.CommandLine && this.isAntigravityProcess(item.CommandLine)
        );
        if (antigravityProcesses.length === 0) {
          return null;
        }
        data = antigravityProcesses[0];
      } else {
        if (!data.CommandLine || !this.isAntigravityProcess(data.CommandLine)) {
          return null;
        }
      }

      const commandLine = data.CommandLine || "";
      const pid = data.ProcessId;
      if (!pid) {
        return null;
      }

      const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
      const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/);
      if (!tokenMatch?.[1]) {
        return null;
      }

      return {
        pid,
        extensionPort: portMatch?.[1] ? parseInt(portMatch[1], 10) : 0,
        csrfToken: tokenMatch[1],
      };
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
  constructor(private platform: "darwin" | "linux") {}

  getProcessListCommand(processName: string): string {
    return this.platform === "darwin"
      ? `pgrep -fl ${processName}`
      : `pgrep -af ${processName}`;
  }

  parseProcessInfo(stdout: string): ProcessInfo | null {
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (line.includes("--extension_server_port")) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[0], 10);
        const cmd = line.substring(parts[0].length).trim();

        const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
        const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/);

        return {
          pid,
          extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
          csrfToken: tokenMatch ? tokenMatch[1] : "",
        };
      }
    }
    return null;
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

