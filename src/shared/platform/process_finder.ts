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
import { debugLog, infoLog, warnLog, errorLog } from "../utils/logger";
import { isWsl, getWslHostIp } from "../utils/wsl";
import { getExpectedWorkspaceIds } from "../utils/workspace_id";
import { LanguageServerInfo, DetectOptions, CommunicationAttempt, ProcessInfo } from "../utils/types";

const execAsync = promisify(exec);

// Re-export types for backward compatibility
export type { LanguageServerInfo, DetectOptions };

export class ProcessFinder {
  private strategy: PlatformStrategy;
  private processName: string;

  // Stores the reason for the last detection failure
  public failureReason: 'no_process' | 'ambiguous' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null = null;
  // Number of candidate processes found
  public candidateCount: number = 0;
  // Number of candidates skipped due to workspace ID mismatch
  public skippedForWorkspace: number = 0;
  // Detailed info about attempts (for diagnostics)
  public attemptDetails: CommunicationAttempt[] = [];
  // Enhanced diagnostics
  public tokenPreview: string = '';  // First 8 chars of CSRF token
  public portsFromCmdline: number = 0;  // Count of ports from command line
  public portsFromNetstat: number = 0;  // Count of ports from netstat
  public retryCount: number = 0;  // Number of retry attempts
  public protocolUsed: 'https' | 'http' | 'none' = 'none';  // Final protocol used
  // PowerShell warm-up state (learned from competitor: vscode-antigravity-cockpit)
  private powershellTimeoutRetried: boolean = false;

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
   * Get the process name being searched for (for diagnostics)
   */
  getProcessName(): string {
    return this.processName;
  }

  /**
   * Detect Antigravity Language Server process with automatic retry
   *
   * Uses exponential backoff: waits 1.5s after first failure, 3s after second, 6s after third...
   */
  async detect(options: DetectOptions = {}): Promise<LanguageServerInfo | null> {
    const {
      attempts = 5,
      baseDelay = 1500,
      verbose = false,
    } = options;

    // Reset PowerShell warm-up state for this detection cycle
    this.powershellTimeoutRetried = false;

    return retry(() => this.tryDetect(), {
      attempts,
      baseDelay,
      backoff: "exponential",
      maxDelay: 10000,
      onRetry: (attempt, delay) => {
        // Log to output channel so users can see progress in case of slow startup
        warnLog(`ProcessFinder: Attempt ${attempt} failed, retrying in ${delay}ms...`);
        this.retryCount++;
        if (verbose) {
          debugLog(`ProcessFinder: Attempt ${attempt} failed, retrying in ${delay}ms...`);
        }
      },
    }).then(async result => {
      if (!result) {
        errorLog(`ProcessFinder: Detection failed after ${attempts} attempts. Reason: ${this.failureReason || 'unknown'}`);
        // Run diagnostics to help troubleshoot
        await this.runDiagnostics();
      } else {
        infoLog(`ProcessFinder: Language Server detected successfully on port ${result.port}`);
      }
      return result;
    });
  }

  /**
   * Run diagnostics when detection fails
   * Lists related processes and provides troubleshooting tips
   */
  private async runDiagnostics(): Promise<void> {
    warnLog('⚠️ Running diagnostics to help troubleshoot...');
    infoLog(`Target process: ${this.processName}`);
    infoLog(`Platform: ${process.platform}, Arch: ${process.arch}`);

    // Output troubleshooting tips
    const tips = this.strategy.getTroubleshootingTips();
    if (tips.length > 0) {
      infoLog('📋 Troubleshooting Tips:');
      tips.forEach((tip, i) => infoLog(`  ${i + 1}. ${tip}`));
    }

    // Try to list related processes
    try {
      const diagCmd = this.strategy.getDiagnosticCommand();
      debugLog(`Diagnostic command: ${diagCmd}`);

      const { stdout, stderr } = await this.execute(diagCmd);

      // Sanitize output: hide csrf_token to prevent leaking sensitive info
      const sanitize = (text: string) => text.replace(/(--csrf_token[=\s]+)([a-f0-9-]+)/gi, '$1***REDACTED***');

      if (stdout && stdout.trim()) {
        infoLog(`📋 Related processes found:\n${sanitize(stdout).substring(0, 2000)}`);
      } else {
        warnLog('❌ No related processes found (language_server/antigravity)');
        infoLog('💡 This usually means Antigravity IDE is not running or the process name has changed.');
      }

      if (stderr && stderr.trim()) {
        warnLog(`Diagnostic stderr: ${sanitize(stderr).substring(0, 500)}`);
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      debugLog(`Diagnostic command failed: ${error.message}`);

      // Provide manual commands for the user to try
      if (process.platform === 'win32') {
        infoLog('💡 Try running this command manually in PowerShell:');
        infoLog('   Get-Process | Where-Object { $_.ProcessName -match "language|antigravity" }');
      } else {
        infoLog('💡 Try running this command manually in Terminal:');
        infoLog('   ps aux | grep -E "language|antigravity"');
      }
    }
  }



  /**
   * Single detection attempt without retry
   */
  protected async tryDetect(): Promise<LanguageServerInfo | null> {
    this.failureReason = null; // Reset failure reason
    this.candidateCount = 0;   // Reset candidate count
    this.skippedForWorkspace = 0; // Reset workspace mismatch counter
    this.attemptDetails = [];  // Reset attempts
    this.tokenPreview = '';    // Reset token preview
    this.portsFromCmdline = 0; // Reset port counts
    this.portsFromNetstat = 0;
    this.protocolUsed = 'none';
    // Note: powershellTimeoutRetried is NOT reset here - it persists across retries within one detect() call

    try {
      const expectedIds = getExpectedWorkspaceIds();
      debugLog(`ProcessFinder: Expected Workspace IDs: ${expectedIds.join(", ") || "none"}`);

      const cmd = this.strategy.getProcessListCommand(this.processName);
      const { stdout } = await this.executeWithPowershellWarmup(cmd);

      let infos: ProcessInfo[] | null = this.strategy.parseProcessInfo(stdout);

      if (!infos) {
        // 1. Try Keyword Search (existing fallback)
        if (this.strategy.getProcessListByKeywordCommand) {
          debugLog("ProcessFinder: Process name scan failed, trying keyword scan (csrf_token)...");
          const keywordCmd = this.strategy.getProcessListByKeywordCommand("csrf_token");
          // Use standard execute for keyword search to avoid double warm-up delay if first failed
          const { stdout: keywordStdout } = await this.execute(keywordCmd).catch(() => ({ stdout: '', stderr: '' }));
          infos = this.strategy.parseProcessInfo(keywordStdout);
        }

        // 2. Try Platform Fallback (e.g., wmic for Windows) - NEW
        if (!infos && this.strategy.getFallbackProcessListCommand) {
          debugLog("ProcessFinder: Keyword scan failed, trying platform fallback (wmic)...");
          const fallbackCmd = this.strategy.getFallbackProcessListCommand();
          const { stdout: fallbackStdout } = await this.execute(fallbackCmd).catch(() => ({ stdout: '', stderr: '' }));
          infos = this.strategy.parseProcessInfo(fallbackStdout);
        }

        if (!infos) {
          this.failureReason = 'no_process';
          return null;
        }
      }

      this.candidateCount = infos.length;

      const myPid = process.pid;
      const myPpid = process.ppid;

      // Log detected candidates for debugging
      infos.forEach(info => {
        debugLog(`ProcessFinder: Candidate detected - PID: ${info.pid}, PPID: ${info.ppid}, WorkspaceID: ${info.workspaceId || 'N/A'}`);
      });

      // Priority 1: Exact Workspace ID match (Strongest guarantee)
      if (expectedIds.length > 0) {
        const wsMatch = infos.find(i => i.workspaceId && expectedIds.includes(i.workspaceId));
        if (wsMatch) {
          debugLog(`ProcessFinder: Strong Match! Workspace ID matches: ${wsMatch.workspaceId} (PID: ${wsMatch.pid})`);
          const result = await this.verifyAndConnect(wsMatch);
          if (result) return result;
        }
      }

      // Priority 2: Direct Child process of current Extension Host
      const child = infos.find((i) => i.ppid === myPid);
      if (child) {
        if (expectedIds.length > 0 && child.workspaceId && !expectedIds.includes(child.workspaceId)) {
          debugLog(`ProcessFinder: Child PID ${child.pid} has mismatching workspace ID ${child.workspaceId}, skipping.`);
        } else {
          debugLog(`ProcessFinder: Inheritance Match! Found child process of EH (PID: ${child.pid}).`);
          const result = await this.verifyAndConnect(child);
          if (result) return result;
        }
      }

      // Priority 3: Sibling process (Same parent as EH)
      const sibling = infos.find((i) => i.ppid === myPpid);
      if (sibling) {
        if (expectedIds.length > 0 && sibling.workspaceId && !expectedIds.includes(sibling.workspaceId)) {
          debugLog(`ProcessFinder: Sibling PID ${sibling.pid} has mismatching workspace ID ${sibling.workspaceId}, skipping.`);
        } else {
          debugLog(`ProcessFinder: Sibling Match! Found sibling process of EH (PID: ${sibling.pid}).`);
          const result = await this.verifyAndConnect(sibling);
          if (result) return result;
        }
      }

      // Priority 4: Ancestry Trace (Recursive search for grandparent/great-grandparent)
      debugLog("ProcessFinder: Direct relationships failed, tracing ancestry...");
      for (const info of infos) {
        if (!info.ppid) continue;

        // STRICT ISOLATION: Check workspace ID even in ancestry trace
        if (expectedIds.length > 0 && info.workspaceId && !expectedIds.includes(info.workspaceId)) {
          continue;
        }

        // Trace up to 3 levels: LS -> SH -> EH
        let parent = info.ppid;
        for (let level = 0; level < 3; level++) {
          if (parent === myPid) {
            debugLog(`ProcessFinder: Ancestry Match at level ${level + 1}! PID ${info.pid} belongs to EH subtree.`);
            const result = await this.verifyAndConnect(info);
            if (result) return result;
            break;
          }
          const nextParent = await this.getParentPid(parent);
          if (!nextParent || nextParent === parent || nextParent <= 1) break;
          parent = nextParent;
        }
      }

      // Priority 5: Loop-and-Verify (Last Resort with Strict Filtering)
      debugLog(`ProcessFinder: Selective heuristics failed. Verifying all remaining ${infos.length} candidates...`);
      for (const info of infos) {
        // STRICT ISOLATION: If we have expected IDs, don't connect to a process that has a DIFFERENT ID
        if (expectedIds.length > 0 && info.workspaceId && !expectedIds.includes(info.workspaceId)) {
          // 1. Log the mismatch detail
          debugLog(`ProcessFinder: Strict ID mismatch. PID:${info.pid} has '${info.workspaceId}', expected: [${expectedIds.join(', ')}]`);

          // 2. Loose Matching (Fallback): Ignore separators (._-) and case
          // This handles cases where our normalization logic still differs slightly from the server
          const normalizeLoose = (id: string) => id.replace(/[._-]/g, '').toLowerCase();
          const looseMatch = expectedIds.some(eid => normalizeLoose(eid) === normalizeLoose(info.workspaceId!));

          if (looseMatch) {
            warnLog(`ProcessFinder: Loosely matched PID ${info.pid} (Actual: ${info.workspaceId}) despite strict mismatch.`);
            // Proceed to verify/connect despite the strict mismatch
          } else {
            debugLog(`ProcessFinder: Skipping PID ${info.pid} - belongs to a different workspace (${info.workspaceId})`);
            this.skippedForWorkspace++;
            continue;
          }
        }

        const result = await this.verifyAndConnect(info);
        if (result) {
          debugLog(`ProcessFinder: Connection successful for generic PID ${info.pid} after verification.`);
          return result;
        }
      }

      // Set appropriate failureReason based on what happened (only if not already set by verifyAndConnect)
      if (!this.failureReason) {
        if (this.skippedForWorkspace > 0 && this.skippedForWorkspace === infos.length) {
          // All candidates were skipped due to workspace mismatch
          this.failureReason = 'workspace_mismatch';
          debugLog(`ProcessFinder: All ${this.skippedForWorkspace} candidates rejected due to workspace ID mismatch. Expected: [${expectedIds.join(', ')}]`);
        }
        // Note: If verifyAndConnect was called and failed, it already set failureReason to 'no_port' or 'auth_failed'
      }

      return null;
    } catch (e: unknown) {
      errorLog("ProcessFinder: tryDetect unexpected error", e instanceof Error ? e : String(e));
      return null;
    }
  }

  /**
   * Helper: Verify connectivity and return server info
   */
  private async verifyAndConnect(info: ProcessInfo): Promise<LanguageServerInfo | null> {
    // Get all candidate ports
    let ports = await this.getListeningPorts(info.pid);
    this.portsFromNetstat = ports.length;

    // Store token preview for diagnostics (first 8 chars)
    this.tokenPreview = info.csrfToken.substring(0, 8);

    // If we have a fixed port from cmdline, ensure it's tried even if not found by OS tools
    if (info.extensionPort > 0 && !ports.includes(info.extensionPort)) {
      ports = [info.extensionPort, ...ports];
      this.portsFromCmdline = 1;
    }

    const workingPort = await this.findWorkingPort(info.pid, ports, info.csrfToken, info.extensionPort);
    if (!workingPort) {
      const hasAuthFailure = this.attemptDetails.some(a => a.pid === info.pid && (a.statusCode === 401 || a.statusCode === 403));
      this.failureReason = hasAuthFailure ? 'auth_failed' : 'no_port';
      return null;
    }

    return {
      port: workingPort,
      csrfToken: info.csrfToken,
    };
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
      // Ensure port command is detected on Linux (dynamic command selection)
      if (this.strategy instanceof UnixStrategy) {
        await this.strategy.detectAvailablePortCommand();
      }

      const cmd = this.strategy.getPortListCommand(pid);
      const { stdout } = await this.execute(cmd);
      return this.strategy.parseListeningPorts(stdout, pid);
    } catch {
      return [];
    }
  }

  private async findWorkingPort(
    pid: number,
    ports: number[],
    csrfToken: string,
    cmdlinePort?: number
  ): Promise<number | null> {
    for (const port of ports) {
      // 1. Try localhost first (standard for Windows, macOS, and WSL Mirrored)
      let result = await this.testPort("127.0.0.1", port, csrfToken);
      const portSource = (cmdlinePort && port === cmdlinePort) ? 'cmdline' : 'netstat';

      // Record first attempt
      this.attemptDetails.push({
        pid,
        port,
        statusCode: result.statusCode,
        error: result.error,
        protocol: result.protocol,
        portSource
      });

      if (result.success) {
        this.protocolUsed = result.protocol;
        return port;
      }

      // 2. If localhost failed and we are in WSL, try the Host IP (for NAT mode)
      if (isWsl()) {
        const hostIp = getWslHostIp();
        if (hostIp && hostIp !== "127.0.0.1") {
          debugLog(`ProcessFinder: WSL detected, trying Host IP: ${hostIp}:${port}`);
          result = await this.testPort(hostIp, port, csrfToken);

          // Record WSL specific attempt
          this.attemptDetails.push({
            pid,
            port,
            statusCode: result.statusCode,
            error: result.error + " (WSL Host IP)",
            protocol: result.protocol,
            portSource
          });

          if (result.success) {
            this.protocolUsed = result.protocol;
            return port;
          }
        }
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
   * Execute command with PowerShell warm-up handling (Windows only)
   * First timeout gets a free retry after 3s warm-up period
   * Reference: vscode-antigravity-cockpit hunter.ts
   */
  private async executeWithPowershellWarmup(
    command: string
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await this.execute(command);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const errorMsg = error.message.toLowerCase();

      // PowerShell warm-up: First timeout on Windows gets a free retry
      if (process.platform === 'win32' && !this.powershellTimeoutRetried) {
        const isTimeout = errorMsg.includes('timeout') ||
          errorMsg.includes('timed out') ||
          errorMsg.includes('etimedout');

        if (isTimeout) {
          warnLog('ProcessFinder: PowerShell command timed out (likely cold start), warming up...');
          this.powershellTimeoutRetried = true;

          // Wait 3 seconds for PowerShell to warm up
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Retry with longer timeout
          debugLog('ProcessFinder: Retrying after PowerShell warm-up...');
          return execAsync(command, { timeout: 5000 });
        }
      }

      // Re-throw for other errors or if warm-up already attempted
      throw e;
    }
  }

  /**
   * Test if port is accessible (supports HTTPS → HTTP automatic fallback)
   */
  protected async testPort(hostname: string, port: number, csrfToken: string): Promise<{ success: boolean; statusCode: number; protocol: 'https' | 'http'; error?: string }> {
    return httpTestPort(
      hostname,
      port,
      "/exa.language_server_pb.LanguageServerService/GetUserStatus",
      {
        "X-Codeium-Csrf-Token": csrfToken,
        "Connect-Protocol-Version": "1",
      },
      JSON.stringify({ wrapper_data: {} })
    );
  }
}
