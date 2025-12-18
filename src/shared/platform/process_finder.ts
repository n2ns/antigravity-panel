/**
 * ProcessFinder: Detects Antigravity Language Server process across different platforms
 *
 * Supports automatic HTTPS → HTTP fallback
 */

import { exec } from "child_process";
import { promisify } from "util";
import {
  PlatformStrategy,
  WindowsStrategy,
  UnixStrategy,
} from "./platform_strategies";
import { retry } from "../utils/retry";
import { testPort as httpTestPort } from "../utils/http_client";
import { debugLog } from "../utils/logger";
import { LanguageServerInfo, DetectOptions } from "../utils/types";

const execAsync = promisify(exec);

// Re-export types for backward compatibility
export type { LanguageServerInfo, DetectOptions };

export class ProcessFinder {
  private strategy: PlatformStrategy;
  private processName: string;

  // Stores the reason for the last detection failure
  public failureReason: 'no_process' | 'ambiguous' | 'no_port' | 'auth_failed' | null = null;
  // Number of candidate processes found
  public candidateCount: number = 0;

  constructor() {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32") {
      this.strategy = new WindowsStrategy();
      this.processName = "language_server_windows_x64.exe";
    } else if (platform === "darwin") {
      this.strategy = new UnixStrategy("darwin");
      this.processName = `language_server_macos${arch === "arm64" ? "_arm" : ""}`;
    } else {
      this.strategy = new UnixStrategy("linux");
      this.processName = `language_server_linux${arch === "arm64" ? "_arm" : "_x64"}`;
    }
  }

  /**
   * Detect Antigravity Language Server process with automatic retry
   *
   * Uses exponential backoff: waits 1.5s after first failure, 3s after second, 6s after third...
   */
  async detect(options: DetectOptions = {}): Promise<LanguageServerInfo | null> {
    const {
      attempts = 3,
      baseDelay = 1500,
      verbose = false,
    } = options;

    return retry(() => this.tryDetect(), {
      attempts,
      baseDelay,
      backoff: "exponential",
      maxDelay: 10000,
      onRetry: verbose
        ? (attempt, delay) => {
          debugLog(`ProcessFinder: Attempt ${attempt} failed, retrying in ${delay}ms...`);
        }
        : undefined,
    });
  }

  /**
   * Single detection attempt without retry
   */
  protected async tryDetect(): Promise<LanguageServerInfo | null> {
    this.failureReason = null; // Reset failure reason
    this.candidateCount = 0;   // Reset candidate count
    try {
      const cmd = this.strategy.getProcessListCommand(this.processName);
      const { stdout } = await this.execute(cmd);

      // Now returns an array or null
      let infos = this.strategy.parseProcessInfo(stdout);

      if (!infos) {
        // Silent fail (Case 1)
        this.failureReason = 'no_process';
        return null;
      }

      // If single item returned by legacy strategy or only one found (normalize to array)
      if (!Array.isArray(infos)) {
        infos = [infos];
      }

      this.candidateCount = infos.length;

      if (infos.length === 0) {
        // Silent fail (Case 1)
        this.failureReason = 'no_process';
        return null;
      }

      let bestInfo: typeof infos[0] | null = null;

      if (infos.length === 1) {
        // Case 2: Only one server found, use it directly
        debugLog(`ProcessFinder: Single server found (PID: ${infos[0].pid}), using it.`);
        bestInfo = infos[0];
      } else {
        // Case 3: Multiple candidates, filter by process ancestry
        const myPpid = process.ppid;

        // Try to match sibling (same PPID) first
        const sibling = infos.find((i) => i.ppid === myPpid);
        if (sibling) {
          debugLog(`ProcessFinder: Found sibling process (PID: ${sibling.pid})`);
          bestInfo = sibling;
        } else {
          // Try to match grandparent (Server's GrandParent === My Parent)
          try {
            const myMainProcessId = myPpid;

            for (const info of infos) {
              if (info.ppid) {
                const candidateGrandparent = await this.getParentPid(info.ppid);
                if (candidateGrandparent === myMainProcessId) {
                  debugLog(
                    `ProcessFinder: Found nephew process (PID: ${info.pid}) - Server's GrandParent matches My Parent (${myMainProcessId})`
                  );
                  bestInfo = info;
                  break;
                }
              }
            }
          } catch (e) {
            debugLog("ProcessFinder: Error tracing ancestry", e);
          }
        }

        if (!bestInfo) {
          // Case 3b: Multiple servers but NO MATCH found
          debugLog("ProcessFinder: Multiple servers found but none matched ancestry.");
          this.failureReason = 'ambiguous';
          return null;
        }
      }

      const ports = await this.getListeningPorts(bestInfo.pid);
      if (ports.length === 0) {
        this.failureReason = 'no_port';
        return null;
      }

      const workingPort = await this.findWorkingPort(ports, bestInfo.csrfToken);
      if (!workingPort) {
        this.failureReason = 'auth_failed';
        return null;
      }

      return {
        port: workingPort,
        csrfToken: bestInfo.csrfToken,
      };
    } catch {
      return null;
    }
  }

  private async getParentPid(pid: number): Promise<number | null> {
    try {
      if (process.platform === "win32") {
        const cmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").ParentProcessId"`;
        const { stdout } = await this.execute(cmd);
        const ppid = parseInt(stdout.trim(), 10);
        return isNaN(ppid) ? null : ppid;
      } else {
        // Unix (macOS / Linux)
        // -o ppid=: Output PPID column only, no header
        const cmd = `ps -o ppid= -p ${pid}`;
        const { stdout } = await this.execute(cmd);
        const ppid = parseInt(stdout.trim(), 10);
        return isNaN(ppid) ? null : ppid;
      }
    } catch {
      return null;
    }
  }

  private async getListeningPorts(pid: number): Promise<number[]> {
    try {
      const cmd = this.strategy.getPortListCommand(pid);
      const { stdout } = await this.execute(cmd);
      return this.strategy.parseListeningPorts(stdout);
    } catch {
      return [];
    }
  }

  private async findWorkingPort(
    ports: number[],
    csrfToken: string
  ): Promise<number | null> {
    for (const port of ports) {
      if (await this.testPort(port, csrfToken)) {
        return port;
      }
    }
    return null;
  }

  /**
   * Execute system command (Protected for testing)
   */
  protected async execute(
    command: string
  ): Promise<{ stdout: string; stderr: string }> {
    return execAsync(command, { timeout: 3000 });
  }

  /**
   * Test if port is accessible (supports HTTPS → HTTP automatic fallback)
   */
  protected async testPort(port: number, csrfToken: string): Promise<boolean> {
    const result = await httpTestPort(
      "127.0.0.1",
      port,
      "/exa.language_server_pb.LanguageServerService/GetUnleashData",
      {
        "X-Codeium-Csrf-Token": csrfToken,
        "Connect-Protocol-Version": "1",
      },
      JSON.stringify({ wrapper_data: {} })
    );
    return result.success;
  }
}
