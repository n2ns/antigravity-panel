/**
 * Logger: 统一的日志输出管理
 *
 * 使用 VS Code Output Channel 输出日志，
 * 受 debugMode 配置控制
 */

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;
let isDebugMode = false;

/**
 * 初始化 Logger
 */
export function initLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
  outputChannel = vscode.window.createOutputChannel("Toolkit for Antigravity");
  context.subscriptions.push(outputChannel);
  return outputChannel;
}

/**
 * 获取 Logger 实例
 */
export function getLogger(): vscode.OutputChannel | null {
  return outputChannel;
}

/**
 * 设置调试模式
 */
export function setDebugMode(enabled: boolean): void {
  isDebugMode = enabled;
}

/**
 * 获取当前调试模式状态
 */
export function isDebugEnabled(): boolean {
  return isDebugMode;
}

/**
 * 输出调试日志（仅在 debugMode 开启时输出）
 */
export function debugLog(message: string, data?: unknown): void {
  if (!isDebugMode || !outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  outputChannel.appendLine(`[${timestamp}] ${message}`);

  if (data !== undefined) {
    if (typeof data === 'object') {
      outputChannel.appendLine(JSON.stringify(data, null, 2));
    } else {
      outputChannel.appendLine(String(data));
    }
  }
}

/**
 * 输出信息日志（始终输出）
 */
export function infoLog(message: string): void {
  if (!outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  outputChannel.appendLine(`[${timestamp}] ℹ️ ${message}`);
}

/**
 * 输出警告日志（始终输出）
 */
export function warnLog(message: string): void {
  if (!outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  outputChannel.appendLine(`[${timestamp}] ⚠️ ${message}`);
}

/**
 * 输出错误日志（始终输出）
 */
export function errorLog(message: string, error?: unknown): void {
  if (!outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  outputChannel.appendLine(`[${timestamp}] ❌ ${message}`);

  if (error) {
    if (error instanceof Error) {
      outputChannel.appendLine(`  ${error.message}`);
      if (error.stack) {
        outputChannel.appendLine(`  ${error.stack}`);
      }
    } else {
      outputChannel.appendLine(`  ${String(error)}`);
    }
  }
}

/**
 * 显示 Output Channel
 */
export function showOutput(): void {
  outputChannel?.show(true);
}

// ==================== Quota Debug Logging ====================

import type { QuotaSnapshot } from '../../model/types/entities';

/**
 * Format credits number for log display
 */
function formatCreditsForLog(value?: number): string {
  if (value === undefined) return 'N/A';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

/**
 * 输出 Quota 快照日志（仅在 debugMode 开启时输出）
 */
export function logQuotaSnapshot(snapshot: QuotaSnapshot): void {
  if (!isDebugMode || !outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const lines: string[] = [];

  lines.push(`[${timestamp}] 📊 Quota Update`);
  lines.push(`${'─'.repeat(55)}`);

  // User Info
  if (snapshot.userInfo) {
    const tier = snapshot.userInfo.tier || snapshot.userInfo.planName || 'N/A';
    const email = snapshot.userInfo.email ? ` <${snapshot.userInfo.email}>` : '';
    lines.push(`User: ${snapshot.userInfo.name || 'Unknown'}${email} (${tier})`);
  }

  // Credits
  if (snapshot.tokenUsage) {
    const tu = snapshot.tokenUsage;
    const promptStr = tu.promptCredits
      ? `${formatCreditsForLog(tu.promptCredits.available)} / ${formatCreditsForLog(tu.promptCredits.monthly)} (${tu.promptCredits.remainingPercentage.toFixed(0)}%)`
      : 'N/A';
    const flowStr = tu.flowCredits
      ? `${formatCreditsForLog(tu.flowCredits.available)} / ${formatCreditsForLog(tu.flowCredits.monthly)} (${tu.flowCredits.remainingPercentage.toFixed(0)}%)`
      : 'N/A';
    lines.push(`Credits: Prompt: ${promptStr} | Flow: ${flowStr}`);
  }

  lines.push(`${'─'.repeat(55)}`);
  lines.push(`${'Model'.padEnd(30)} | Quota | Reset`);
  lines.push(`${'─'.repeat(55)}`);

  // Models - show raw modelId if it looks like a placeholder (potential mismatch)
  for (const model of snapshot.models) {
    const displayName = model.label.substring(0, 28).padEnd(30);
    const quota = `${model.remainingPercentage.toFixed(0)}%`.padStart(5);
    const reset = model.timeUntilReset.padStart(6);
    lines.push(`${displayName} | ${quota} | ${reset}`);

    // If modelId looks like a raw placeholder, log it for debugging
    if (model.modelId.startsWith('MODEL_') || model.modelId.includes('PLACEHOLDER')) {
      lines.push(`  └─ Raw ID: ${model.modelId}`);
    }
  }

  lines.push(`${'─'.repeat(55)}`);

  outputChannel.appendLine(lines.join('\n'));
}

/**
 * 输出 Quota 解析错误日志（含原始数据）
 */
export function logQuotaParseError(error: string, rawData?: unknown): void {
  if (!isDebugMode || !outputChannel) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  outputChannel.appendLine(`[${timestamp}] ❌ Quota Parse Error: ${error}`);

  if (rawData !== undefined) {
    outputChannel.appendLine(`${'─'.repeat(55)}`);
    outputChannel.appendLine(`Raw Response Data:`);
    try {
      outputChannel.appendLine(JSON.stringify(rawData, null, 2));
    } catch {
      outputChannel.appendLine(String(rawData));
    }
    outputChannel.appendLine(`${'─'.repeat(55)}`);
  }
}

