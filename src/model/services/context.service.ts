/**
 * ContextService: reads the context window of the current conversation
 *
 * The Language Server lists conversations (cascades) with GetAllCascadeTrajectories
 * and reports, for every model call of a conversation, its context window in
 * GetCascadeTrajectoryGeneratorMetadata (chatModel.chatStartMetadata). The
 * metadata grows with the conversation, so it is fetched only when the step
 * count of the current conversation changes.
 */

import { httpRequest } from '../../shared/utils/http_client';
import { debugLog } from '../../shared/utils/logger';
import type { ConversationContext, IContextService } from './interfaces';
import type { ConfigManager } from '../../shared/config/config_manager';
import type { LanguageServerInfo } from '../types/entities';

const HTTP_TIMEOUT_MS = 12000;
const SERVICE_PATH = '/exa.language_server_pb.LanguageServerService/';
const CASCADE_TYPE = 'CORTEX_TRAJECTORY_TYPE_CASCADE';
const RUNNING_STATUS = 'CASCADE_RUN_STATUS_RUNNING';

const REQUEST_METADATA = {
    metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        locale: 'en',
    },
};

interface ServerTrajectorySummary {
    summary?: string;
    stepCount?: number;
    status?: string;
    lastModifiedTime?: string;
    trajectoryType?: string;
}

interface ServerTrajectoriesResponse {
    trajectorySummaries?: Record<string, ServerTrajectorySummary>;
}

interface ServerGeneratorMetadataResponse {
    generatorMetadata?: Array<{
        chatModel?: {
            responseModel?: string;
            usage?: {
                inputTokens?: number | string;
                cacheReadTokens?: number | string;
            };
            chatStartMetadata?: {
                checkpointIndex?: number;
                contextWindowMetadata?: {
                    estimatedTokensUsed?: number | string;
                    maxContextTokens?: number | string;
                    truncationReason?: string;
                };
            };
        };
    }>;
}

export class ContextService implements IContextService {
    private serverInfo: LanguageServerInfo | null = null;
    private cached: ConversationContext | null = null;

    constructor(private readonly configManager: ConfigManager) { }

    setServerInfo(info: LanguageServerInfo): void {
        this.serverInfo = info;
        this.cached = null;
    }

    async fetchContext(): Promise<ConversationContext | null> {
        if (!this.serverInfo) return null;
        try {
            const list = await this.request<ServerTrajectoriesResponse>('GetAllCascadeTrajectories', REQUEST_METADATA);
            if (list.statusCode !== 200) {
                debugLog(`Conversation list unavailable (HTTP ${list.statusCode})`);
                return null;
            }
            const current = ContextService.pickCurrent(list.data?.trajectorySummaries ?? {});
            if (!current) return null;
            const [cascadeId, summary] = current;
            // Missing numbers are zero (protobuf omitempty)
            const stepCount = Number(summary.stepCount ?? 0);
            const running = summary.status === RUNNING_STATUS;
            const title = summary.summary ?? '';

            if (this.cached?.cascadeId === cascadeId && this.cached.stepCount === stepCount) {
                this.cached = { ...this.cached, running, title };
                return this.cached;
            }

            const metadata = await this.request<ServerGeneratorMetadataResponse>(
                'GetCascadeTrajectoryGeneratorMetadata', { ...REQUEST_METADATA, cascadeId });
            if (metadata.statusCode !== 200) {
                debugLog(`Conversation metadata unavailable (HTTP ${metadata.statusCode})`);
                return null;
            }
            const latest = ContextService.latestWindow(metadata.data);
            if (!latest) return null;
            this.cached = { cascadeId, title, stepCount, running, ...latest };
            return this.cached;
        } catch (e) {
            debugLog(`Conversation context request failed: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /** The most recently modified top-level conversation */
    private static pickCurrent(summaries: Record<string, ServerTrajectorySummary>): [string, ServerTrajectorySummary] | null {
        let best: [string, ServerTrajectorySummary] | null = null;
        for (const entry of Object.entries(summaries)) {
            const type = entry[1].trajectoryType;
            if (type !== undefined && type !== CASCADE_TYPE) continue;
            const modified = Date.parse(entry[1].lastModifiedTime ?? '') || 0;
            const bestModified = best ? Date.parse(best[1].lastModifiedTime ?? '') || 0 : -1;
            if (modified > bestModified) best = entry;
        }
        return best;
    }

    /** Context window of the last model call that reports one */
    private static latestWindow(data: ServerGeneratorMetadataResponse | undefined):
        Pick<ConversationContext, 'usedTokens' | 'maxTokens' | 'model' | 'checkpointIndex' | 'truncated'> | null {
        const calls = data?.generatorMetadata ?? [];
        for (let i = calls.length - 1; i >= 0; i--) {
            const start = calls[i].chatModel?.chatStartMetadata;
            const window = start?.contextWindowMetadata;
            const maxTokens = Number(window?.maxContextTokens ?? 0);
            if (!window || !(maxTokens > 0)) continue;
            // The server estimate is what triggers compression, but for the first
            // call of a conversation it misses the system prompt (e.g. 147 against
            // 21199 tokens sent), so never report less than the prompt actually sent.
            const usage = calls[i].chatModel?.usage;
            const estimated = ContextService.toCount(window.estimatedTokensUsed);
            const sent = ContextService.toCount(usage?.inputTokens) + ContextService.toCount(usage?.cacheReadTokens);
            return {
                usedTokens: Math.max(estimated, sent),
                maxTokens,
                model: calls[i].chatModel?.responseModel ?? '',
                checkpointIndex: Number(start?.checkpointIndex ?? 0),
                truncated: Boolean(window.truncationReason),
            };
        }
        return null;
    }

    /** Missing (protobuf omitempty), string or invalid counts as a non-negative number */
    private static toCount(value: number | string | undefined): number {
        const count = Number(value ?? 0);
        return Number.isFinite(count) ? Math.max(0, count) : 0;
    }

    protected async request<T>(method: string, body: object) {
        const info = this.serverInfo!;
        return httpRequest<T>({
            hostname: info.host || this.configManager.getConfig()["system.serverHost"],
            port: info.port,
            path: SERVICE_PATH + method,
            method: 'POST',
            headers: {
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': info.csrfToken,
            },
            body: JSON.stringify(body),
            timeout: HTTP_TIMEOUT_MS,
            allowFallback: true,
        });
    }
}
