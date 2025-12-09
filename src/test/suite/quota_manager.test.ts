import * as assert from 'assert';
import { QuotaManager, QuotaManagerConfig } from '../../core/quota_manager';

// Mock response types based on QuotaManager internals
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

class TestQuotaManager extends QuotaManager {
    public mockResponse: ServerUserStatusResponse | Error | null = null;
    public requestCount = 0;
    public mockResponses: (ServerUserStatusResponse | Error)[] = [];

    constructor(config: QuotaManagerConfig) {
        super(config);
    }

    // Allow setting multiple responses for sequence testing
    setMockResponses(responses: (ServerUserStatusResponse | Error)[]) {
        this.mockResponses = responses;
        this.requestCount = 0;
    }

    protected async request<T>(path: string, body: object): Promise<T> {
        this.requestCount++;
        
        let response: ServerUserStatusResponse | Error;

        if (this.mockResponses.length > 0) {
            response = this.mockResponses.shift()!;
        } else if (this.mockResponse) {
            response = this.mockResponse;
        } else {
            throw new Error('No mock response configured');
        }

        if (response instanceof Error) {
            throw response;
        }
        return response as unknown as T;
    }
}

suite('QuotaManager Test Suite', () => {
    let manager: TestQuotaManager;

    const validResponse: ServerUserStatusResponse = {
        userStatus: {
            planStatus: {
                planInfo: { monthlyPromptCredits: 100 },
                availablePromptCredits: 80
            },
            cascadeModelConfigData: {
                clientModelConfigs: [
                    {
                        label: 'GPT-4',
                        modelOrAlias: { model: 'gpt-4' },
                        quotaInfo: {
                            remainingFraction: 0.5,
                            resetTime: new Date(Date.now() + 3600000).toISOString()
                        }
                    }
                ]
            }
        }
    };

    setup(() => {
        manager = new TestQuotaManager({ port: 1234, csrfToken: 'abc' });
    });

    test('should fetch and parse quota correctly', async () => {
        manager.mockResponse = validResponse;
        
        const snapshot = await manager.fetchQuota();
        
        assert.ok(snapshot);
        assert.strictEqual(snapshot.promptCredits?.available, 80);
        assert.strictEqual(snapshot.promptCredits?.remainingPercentage, 80);
        assert.strictEqual(snapshot.models.length, 1);
        assert.strictEqual(snapshot.models[0].label, 'GPT-4');
        assert.strictEqual(snapshot.models[0].remainingPercentage, 50);
    });

    test('should retry on failure', async () => {
        // Fail once, then succeed
        manager.setMockResponses([
            new Error('Network Error'),
            validResponse
        ]);

        const snapshot = await manager.fetchQuota();
        
        assert.ok(snapshot, 'Should return snapshot after retry');
        assert.strictEqual(manager.requestCount, 2, 'Should have retried once');
    });

    test('should return null on persistent failure', async () => {
        manager.setMockResponses([
            new Error('Network Error'),
            new Error('Network Error 2')
        ]);

        let receivedError: Error | undefined;
        manager.onError((err) => {
            receivedError = err;
        });

        const snapshot = await manager.fetchQuota();
        
        assert.strictEqual(snapshot, null);
        assert.ok(receivedError);
        assert.strictEqual(receivedError.message, 'Network Error 2');
    });

    test('should handle missing plan info safely', async () => {
        manager.mockResponse = {
            userStatus: {
                cascadeModelConfigData: { clientModelConfigs: [] }
            }
        };

        const snapshot = await manager.fetchQuota();
        assert.ok(snapshot);
        assert.strictEqual(snapshot.promptCredits, undefined);
        assert.strictEqual(snapshot.models.length, 0);
    });
});
