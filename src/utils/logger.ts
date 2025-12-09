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
  outputChannel = vscode.window.createOutputChannel("Antigravity Panel");
  context.subscriptions.push(outputChannel);
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
