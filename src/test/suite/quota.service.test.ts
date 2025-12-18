import * as assert from 'assert';
import { QuotaService } from '../../model/services/quota.service';
import { ConfigManager, IConfigReader } from '../../shared/config/config_manager';

// Mock Config Reader
class MockConfigReader implements IConfigReader {
    private values: Map<string, any> = new Map();
    constructor(initialValues: any = {}) {
        Object.entries(initialValues).forEach(([k, v]) => this.values.set(k, v));
    }
    get<T>(key: string, defaultValue: T): T {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue;
    }
    set(key: string, value: any) { this.values.set(key, value); }
}

// Test Subclass to mock protected request method
class TestQuotaService extends QuotaService {
    public mockResponse: any | Error | null = null;
    public requestCount = 0;
    public mockResponses: (any | Error)[] = [];

    setMockResponses(responses: (any | Error)[]) {
        this.mockResponses = responses;
        this.requestCount = 0;
    }

    protected async request<T>(path: string, body: object): Promise<T> {
        this.requestCount++;
        let response: any | Error;

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
        return response as T;
    }
}

suite('QuotaService Test Suite', () => {
    let service: TestQuotaService;
    let configManager: ConfigManager;

    const validResponse = {
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
        configManager = new ConfigManager(new MockConfigReader({
            advancedServerHost: '127.0.0.1',
            advancedQuotaApiPath: '/api/quota'
        }));
        service = new TestQuotaService(configManager);
        service.setServerInfo({ port: 1234, csrfToken: 'token', pid: 100 } as any);
    });

    test('should fetch and parse quota correctly', async () => {
        service.mockResponse = validResponse;
        const snapshot = await service.fetchQuota();

        assert.ok(snapshot);
        assert.strictEqual(snapshot!.promptCredits?.available, 80);
        assert.strictEqual(snapshot!.promptCredits?.remainingPercentage, 80);
        assert.strictEqual(snapshot!.models.length, 1);
        assert.strictEqual(snapshot!.models[0].label, 'GPT-4');
        assert.strictEqual(snapshot!.models[0].remainingPercentage, 50);
    });

    test('should retry on failure', async () => {
        // Fail once, then succeed
        service.setMockResponses([
            new Error('Network Error'),
            validResponse
        ]);

        const snapshot = await service.fetchQuota();

        assert.ok(snapshot, 'Should return snapshot after retry');
        assert.strictEqual(service.requestCount, 2, 'Should have retried once');
    });

    test('should return null on persistent failure', async () => {
        service.setMockResponses([
            new Error('Network Error'),
            new Error('Network Error 2')
        ]);

        let receivedError: Error | undefined;
        service.onError((err) => {
            receivedError = err;
        });

        const snapshot = await service.fetchQuota();

        assert.strictEqual(snapshot, null);
        assert.ok(receivedError);
        assert.strictEqual(receivedError.message, 'Network Error 2');
    });

    test('should handle missing plan info safely', async () => {
        service.mockResponse = {
            userStatus: {
                cascadeModelConfigData: { clientModelConfigs: [] }
            }
        };

        const snapshot = await service.fetchQuota();
        assert.ok(snapshot);
        assert.strictEqual(snapshot!.promptCredits, undefined);
        assert.strictEqual(snapshot!.models.length, 0);
    });
});
