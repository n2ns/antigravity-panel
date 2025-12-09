/**
 * QuotaManager: Handles quota API calls to Antigravity Language Server
 *
 * Supports automatic HTTPS → HTTP fallback
 */

import { retry } from "../utils/retry";
import { httpRequest } from "../utils/http_client";
import { debugLog } from "../utils/logger";
import {
  ModelQuotaInfo,
  PromptCreditsInfo,
  QuotaSnapshot,
  QuotaUpdateCallback,
  ErrorCallback,
  LanguageServerInfo,
} from "../utils/types";

// Re-export types for backward compatibility
export type { ModelQuotaInfo, PromptCreditsInfo, QuotaSnapshot };

/**
 * QuotaManager configuration
 */
export interface QuotaManagerConfig {
  port: number;
  csrfToken: string;
}

export class QuotaManager {
  private readonly port: number;
  private readonly csrfToken: string;
  private updateCallback?: QuotaUpdateCallback;
  private errorCallback?: ErrorCallback;

  /**
   * Protected constructor - allows subclass extension but prevents direct external instantiation
   */
  protected constructor(config: QuotaManagerConfig) {
    this.port = config.port;
    this.csrfToken = config.csrfToken;
  }

  /**
   * Static factory method: create instance from LanguageServerInfo
   */
  static create(serverInfo: LanguageServerInfo): QuotaManager {
    return new QuotaManager({
      port: serverInfo.port,
      csrfToken: serverInfo.csrfToken,
    });
  }

  /**
   * Set quota update callback
   */
  onUpdate(callback: QuotaUpdateCallback): void {
    this.updateCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Fetch quota data (with automatic retry)
   *
   * Uses fixed delay retry: waits 1s after failure before retrying, 2 attempts total
   */
  async fetchQuota(): Promise<QuotaSnapshot | null> {
    try {
      const snapshot = await retry(() => this.doFetchQuota(), {
        attempts: 2,
        baseDelay: 1000,
        backoff: "fixed",
      });

      if (snapshot) {
        this.updateCallback?.(snapshot);
      }
      return snapshot;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorCallback?.(err);
      return null;
    }
  }

  /**
   * Single quota fetch (no retry)
   */
  private async doFetchQuota(): Promise<QuotaSnapshot | null> {
    const data = await this.request<ServerUserStatusResponse>(
      "/exa.language_server_pb.LanguageServerService/GetUserStatus",
      {
        metadata: {
          ideName: "antigravity",
          extensionName: "antigravity",
          locale: "en",
        },
      }
    );
    debugLog('Server Response', data);
    return this.parseResponse(data);
  }

  /**
   * Send request (supports HTTPS → HTTP automatic fallback)
   */
  protected async request<T>(path: string, body: object): Promise<T> {
    const response = await httpRequest<T>({
      hostname: "127.0.0.1",
      port: this.port,
      path,
      method: "POST",
      headers: {
        "Connect-Protocol-Version": "1",
        "X-Codeium-Csrf-Token": this.csrfToken,
      },
      body: JSON.stringify(body),
      timeout: 5000,
      allowFallback: true,
    });
    
    return response.data;
  }

  private parseResponse(data: ServerUserStatusResponse): QuotaSnapshot {
    const userStatus = data.userStatus;
    const planInfo = userStatus.planStatus?.planInfo;
    const availableCredits = userStatus.planStatus?.availablePromptCredits;

    let promptCredits: PromptCreditsInfo | undefined;
    if (planInfo && availableCredits !== undefined) {
      const monthly = Number(planInfo.monthlyPromptCredits);
      const available = Number(availableCredits);
      if (monthly > 0) {
        promptCredits = {
          available,
          monthly,
          remainingPercentage: (available / monthly) * 100,
        };
      }
    }

    const rawModels = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
    const models: ModelQuotaInfo[] = rawModels
      .filter((m: RawModelConfig) => m.quotaInfo)
      .map((m: RawModelConfig) => {
        const resetTime = new Date(m.quotaInfo!.resetTime);
        const now = new Date();
        const diff = resetTime.getTime() - now.getTime();
        const remainingFraction = m.quotaInfo!.remainingFraction ?? 0;

        return {
          label: m.label,
          modelId: m.modelOrAlias?.model || "unknown",
          remainingPercentage: remainingFraction * 100,
          isExhausted: remainingFraction === 0,
          resetTime,
          timeUntilReset: this.formatTime(diff),
        };
      });

    return { timestamp: new Date(), promptCredits, models };
  }

  private formatTime(ms: number): string {
    if (ms <= 0) {
      return "Ready";
    }
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) {
      return `${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
}

// Server Response Types
interface RawModelConfig {
  label: string;
  modelOrAlias?: { model: string };
  quotaInfo?: {
    remainingFraction?: number;
    resetTime: string;
  };
}

interface ServerUserStatusResponse {
  userStatus: {
    planStatus?: {
      planInfo: {
        monthlyPromptCredits: number;
      };
      availablePromptCredits: number;
    };
    cascadeModelConfigData?: {
      clientModelConfigs: RawModelConfig[];
    };
  };
}

