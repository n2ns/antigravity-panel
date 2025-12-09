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
    try {
      const cmd = this.strategy.getProcessListCommand(this.processName);
      const { stdout } = await this.execute(cmd);

      const info = this.strategy.parseProcessInfo(stdout);
      if (!info) {
        return null;
      }

      const ports = await this.getListeningPorts(info.pid);
      if (ports.length === 0) {
        return null;
      }

      const workingPort = await this.findWorkingPort(ports, info.csrfToken);
      if (!workingPort) {
        return null;
      }

      return {
        port: workingPort,
        csrfToken: info.csrfToken,
      };
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
  protected async execute(command: string): Promise<{ stdout: string; stderr: string }> {
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
