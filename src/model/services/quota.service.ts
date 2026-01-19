/**
 * QuotaService: Handles quota API calls to Antigravity Language Server
 * 
 * Implements IQuotaService interface for dependency injection.
 * Supports automatic HTTPS → HTTP fallback with retry mechanism.
 */

import { retry } from '../../shared/utils/retry';
import { httpRequest } from '../../shared/utils/http_client';
import { logQuotaParseError, warnLog } from '../../shared/utils/logger';
import type { IQuotaService } from './interfaces';
import type { ConfigManager } from '../../shared/config/config_manager';
import type {
    ModelQuotaInfo,
    PromptCreditsInfo,
    FlowCreditsInfo,
    TokenUsageInfo,
    QuotaSnapshot,
    QuotaUpdateCallback,
    ErrorCallback,
    LanguageServerInfo,
    UserInfo,
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
            warnLog("Cannot fetch quota: server info not available. Try restarting the IDE or running diagnostics.");
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
        const apiPath = config["system.apiPath"];

        const response = await this.request<ServerUserStatusResponse>(
            apiPath,
            {
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'antigravity',
                    locale: 'en',
                },
            }
        );

        if (response.statusCode === 401 || response.statusCode === 403) {
            this.parsingError = `AUTH_FAILED_${response.statusCode}`;
            return null;
        }

        const data = response.data;
        if (!data || !data.userStatus) {
            this.parsingError = response.statusCode !== 200
                ? `HTTP_ERROR_${response.statusCode}`
                : 'Invalid Response Structure';
            logQuotaParseError(this.parsingError, data);
            return null;
        }

        try {
            return this.parseResponse(data);
        } catch (e) {
            this.parsingError = 'Response Parsing Failed';
            logQuotaParseError(this.parsingError, data);
            throw e;
        }
    }

    /**
     * Send request (supports HTTPS → HTTP automatic fallback)
     */
    protected async request<T>(path: string, body: object): Promise<import('../../shared/utils/http_client').HttpResponse<T>> {
        if (!this.serverInfo) {
            throw new Error("Server info not set");
        }

        const config = this.configManager.getConfig();
        const host = config["system.serverHost"];

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

        return response;
    }

    private parseResponse(data: ServerUserStatusResponse): QuotaSnapshot {
        const userStatus = data.userStatus;
        const planInfo = userStatus.planStatus?.planInfo;
        const availableCredits = userStatus.planStatus?.availablePromptCredits;
        const availableFlowCredits = userStatus.planStatus?.availableFlowCredits;

        // Parse Prompt Credits
        let promptCredits: PromptCreditsInfo | undefined;
        if (planInfo && availableCredits !== undefined) {
            const monthly = Number(planInfo.monthlyPromptCredits);
            const available = Number(availableCredits);
            if (monthly > 0) {
                promptCredits = {
                    available,
                    monthly,
                    usedPercentage: ((monthly - available) / monthly) * 100,
                    remainingPercentage: (available / monthly) * 100,
                };
            }
        }

        // Parse Flow Credits
        let flowCredits: FlowCreditsInfo | undefined;
        if (planInfo?.monthlyFlowCredits && availableFlowCredits !== undefined) {
            const monthly = Number(planInfo.monthlyFlowCredits);
            const available = Number(availableFlowCredits);
            if (monthly > 0) {
                flowCredits = {
                    available,
                    monthly,
                    usedPercentage: ((monthly - available) / monthly) * 100,
                    remainingPercentage: (available / monthly) * 100,
                };
            }
        }

        // Build combined token usage info
        let tokenUsage: TokenUsageInfo | undefined;
        if (promptCredits || flowCredits) {
            const totalAvailable = (promptCredits?.available || 0) + (flowCredits?.available || 0);
            const totalMonthly = (promptCredits?.monthly || 0) + (flowCredits?.monthly || 0);
            tokenUsage = {
                promptCredits,
                flowCredits,
                totalAvailable,
                totalMonthly,
                overallRemainingPercentage: totalMonthly > 0 ? (totalAvailable / totalMonthly) * 100 : 0,
            };
        }

        // Extract user subscription info
        const userTier = userStatus.userTier;
        const userInfo: UserInfo | undefined = userStatus.name || userTier ? {
            name: userStatus.name,
            email: userStatus.email,
            tier: userTier?.name || planInfo?.teamsTier,
            tierId: userTier?.id,
            tierDescription: userTier?.description,
            planName: planInfo?.planName,
            teamsTier: planInfo?.teamsTier,
            upgradeUri: userTier?.upgradeSubscriptionUri,
            upgradeText: userTier?.upgradeSubscriptionText,
            browserEnabled: planInfo?.browserEnabled,
            knowledgeBaseEnabled: planInfo?.knowledgeBaseEnabled,
            canBuyMoreCredits: planInfo?.canBuyMoreCredits,
            monthlyPromptCredits: planInfo?.monthlyPromptCredits,
            availablePromptCredits: availableCredits,
        } : undefined;

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

        return { timestamp: new Date(), promptCredits, flowCredits, tokenUsage, userInfo, models };
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
        name?: string;
        email?: string;
        userTier?: {
            id?: string;
            name?: string;
            description?: string;
            upgradeSubscriptionUri?: string;
            upgradeSubscriptionText?: string;
        };
        planStatus?: {
            planInfo: {
                monthlyPromptCredits: number;
                monthlyFlowCredits?: number;
                planName?: string;
                teamsTier?: string;
                browserEnabled?: boolean;
                knowledgeBaseEnabled?: boolean;
                canBuyMoreCredits?: boolean;
            };
            availablePromptCredits: number;
            availableFlowCredits?: number;
        };
        cascadeModelConfigData?: {
            clientModelConfigs: RawModelConfig[];
        };
    };
}
