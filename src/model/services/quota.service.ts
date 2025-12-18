/**
 * QuotaService: Handles quota API calls to Antigravity Language Server
 * 
 * Implements IQuotaService interface for dependency injection.
 * Supports automatic HTTPS → HTTP fallback with retry mechanism.
 */

import { retry } from '../../shared/utils/retry';
import { httpRequest } from '../../shared/utils/http_client';
import type { IQuotaService } from './interfaces';
import type { ConfigManager } from '../../shared/config/config_manager';
import type {
    ModelQuotaInfo,
    PromptCreditsInfo,
    QuotaSnapshot,
    QuotaUpdateCallback,
    ErrorCallback,
    LanguageServerInfo,
} from '../types/entities';

// Re-export types for backward compatibility
export type { ModelQuotaInfo, PromptCreditsInfo, QuotaSnapshot };

/**
 * QuotaService implementation
 */
export class QuotaService implements IQuotaService {
    private serverInfo: LanguageServerInfo | null = null;
    private configManager: ConfigManager;
    private updateCallback?: QuotaUpdateCallback;
    private errorCallback?: ErrorCallback;

    // Tracks parsing or protocol errors
    public parsingError: string | null = null;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Set server info after detection
     */
    setServerInfo(info: LanguageServerInfo): void {
        this.serverInfo = info;
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
     */
    async fetchQuota(): Promise<QuotaSnapshot | null> {
        this.parsingError = null; // Reset
        if (!this.serverInfo) {
            return null;
        }

        try {
            const snapshot = await retry(() => this.doFetchQuota(), {
                attempts: 2,
                baseDelay: 1000,
                backoff: 'fixed',
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
        const config = this.configManager.getConfig();
        const apiPath = config.advancedQuotaApiPath;

        const data = await this.request<ServerUserStatusResponse>(
            apiPath,
            {
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'antigravity',
                    locale: 'en',
                },
            }
        );

        if (!data || !data.userStatus) {
            this.parsingError = 'Invalid Response Structure';
            return null;
        }

        try {
            return this.parseResponse(data);
        } catch (e) {
            this.parsingError = 'Response Parsing Failed';
            throw e;
        }
    }

    /**
     * Send request (supports HTTPS → HTTP automatic fallback)
     */
    protected async request<T>(path: string, body: object): Promise<T> {
        if (!this.serverInfo) {
            throw new Error("Server info not set");
        }

        const config = this.configManager.getConfig();
        const host = config.advancedServerHost;

        const response = await httpRequest<T>({
            hostname: host,
            port: this.serverInfo.port,
            path,
            method: 'POST',
            headers: {
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': this.serverInfo.csrfToken,
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
                    modelId: m.modelOrAlias?.model || 'unknown',
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
            return 'Ready';
        }
        const mins = Math.ceil(ms / 60000);
        if (mins < 60) {
            return `${mins}m`;
        }
        const hours = Math.floor(mins / 60);
        return `${hours}h ${mins % 60}m`;
    }
}

// Server Response Types (internal)
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
