import * as assert from 'assert';
import * as sinon from 'sinon';
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

import { HttpResponse } from '../../shared/utils/http_client';
import * as httpClient from '../../shared/utils/http_client';

// Test Subclass to mock protected request method
class TestQuotaService extends QuotaService {
    public mockResponse: any | Error | null = null;
    public requestCount = 0;
    public mockResponses: (any | Error)[] = [];

    setMockResponses(responses: (any | Error)[]) {
        this.mockResponses = responses;
        this.requestCount = 0;
    }

    /** Reply to the optional quota summary request; null answers like a server without the RPC */
    public summaryResponse: { statusCode: number; data: any } | Error | null = null;
    public summaryRequestCount = 0;

    protected async request<T>(path: string, body: object): Promise<HttpResponse<T>> {
        if (path.endsWith('/RetrieveUserQuotaSummary')) {
            this.summaryRequestCount++;
            const summary = this.summaryResponse ?? { statusCode: 404, data: null };
            if (summary instanceof Error) throw summary;
            return { statusCode: summary.statusCode, data: summary.data as T, protocol: 'https' };
        }
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

        return {
            statusCode: 200,
            data: response as T,
            protocol: 'https'
        };
    }
}

// Test Subclass that returns scripted HTTP status codes
class StatusQuotaService extends QuotaService {
    public responses: { statusCode: number; data: any }[] = [];

    protected async request<T>(_path: string, _body: object): Promise<HttpResponse<T>> {
        const next = this.responses.shift();
        if (!next) throw new Error('No mock response configured');
        return { statusCode: next.statusCode, data: next.data as T, protocol: 'https' };
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

    test('should default omitted user credit amount to zero', async () => {
        service.mockResponse = {
            userStatus: {
                userTier: {
                    availableCredits: [
                        { creditType: 'GOOGLE_ONE_AI' },
                        { creditType: '', creditAmount: '' },
                        { creditType: 'PAID_AI', creditAmount: ' 42 ' },
                        { creditType: 'BONUS_AI', creditAmount: null }
                    ]
                },
                cascadeModelConfigData: { clientModelConfigs: [] }
            }
        };

        const snapshot = await service.fetchQuota();

        assert.ok(snapshot);
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[0].creditAmount, '0');
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[0].creditType, 'GOOGLE_ONE_AI');
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[1].creditAmount, '0');
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[1].creditType, 'UNKNOWN');
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[2].creditAmount, '42');
        assert.strictEqual(snapshot!.tokenUsage?.userCredits?.[3].creditAmount, '0');
    });

    test('should clamp invalid and out-of-range quota numbers', async () => {
        service.mockResponse = {
            userStatus: {
                planStatus: {
                    planInfo: {
                        monthlyPromptCredits: 100,
                        monthlyFlowCredits: 100
                    },
                    availablePromptCredits: 150,
                    availableFlowCredits: 'not-a-number'
                },
                cascadeModelConfigData: {
                    clientModelConfigs: [
                        {
                            label: 'Too High',
                            modelOrAlias: { model: 'too-high' },
                            quotaInfo: {
                                remainingFraction: 2,
                                resetTime: new Date(Date.now() + 3600000).toISOString()
                            }
                        },
                        {
                            label: 'Negative',
                            modelOrAlias: { model: 'negative' },
                            quotaInfo: {
                                remainingFraction: -1,
                                resetTime: new Date(Date.now() + 3600000).toISOString()
                            }
                        },
                        {
                            label: 'Invalid',
                            modelOrAlias: { model: 'invalid' },
                            quotaInfo: {
                                remainingFraction: 'NaN',
                                resetTime: new Date(Date.now() + 3600000).toISOString()
                            }
                        }
                    ]
                }
            }
        };

        const snapshot = await service.fetchQuota();

        assert.ok(snapshot);
        assert.strictEqual(snapshot!.promptCredits?.remainingPercentage, 100);
        assert.strictEqual(snapshot!.promptCredits?.usedPercentage, 0);
        assert.strictEqual(snapshot!.flowCredits, undefined);
        assert.deepStrictEqual(snapshot!.models.map(m => m.remainingPercentage), [100, 0, 0]);
    });

    test('should flag invalid resetTime as fallback and display N/A', async () => {
        service.mockResponse = {
            userStatus: {
                cascadeModelConfigData: {
                    clientModelConfigs: [
                        {
                            label: 'Broken Model',
                            modelOrAlias: { model: 'broken' },
                            quotaInfo: {
                                remainingFraction: 0.5,
                                resetTime: 'not-a-date'
                            }
                        }
                    ]
                }
            }
        };

        const snapshot = await service.fetchQuota();

        assert.ok(snapshot);
        const model = snapshot!.models[0];
        assert.strictEqual(model.resetTimeIsFallback, true);
        assert.strictEqual(model.timeUntilReset, 'N/A', 'Fallback reset time must not render a fake countdown');
        assert.ok(model.resetTime.getTime() > Date.now(), 'Fallback date still sorts into the future');
    });

    test('should flag a null or missing resetTime as fallback instead of Ready', async () => {
        for (const resetTime of [null, undefined]) {
            service.mockResponse = {
                userStatus: {
                    cascadeModelConfigData: {
                        clientModelConfigs: [
                            { label: 'No Reset', modelOrAlias: { model: 'none' }, quotaInfo: { remainingFraction: 0.5, resetTime } }
                        ]
                    }
                }
            };

            const model = (await service.fetchQuota())!.models[0];
            assert.strictEqual(model.resetTimeIsFallback, true, `resetTime ${resetTime} should use the fallback`);
            assert.strictEqual(model.timeUntilReset, 'N/A');
        }
    });

    test('should not flag valid resetTime as fallback', async () => {
        service.mockResponse = validResponse;
        const snapshot = await service.fetchQuota();

        assert.ok(snapshot);
        const model = snapshot!.models[0];
        assert.strictEqual(model.resetTimeIsFallback, false);
        assert.notStrictEqual(model.timeUntilReset, 'N/A');
    });

    test('should treat omitted available credits as zero like an explicit zero', async () => {
        const build = (planStatus: object) => ({
            userStatus: { planStatus, cascadeModelConfigData: { clientModelConfigs: [] } }
        });
        const expected = { available: 0, monthly: 100, usedPercentage: 100, remainingPercentage: 0 };
        const expectedFlow = { available: 0, monthly: 50, usedPercentage: 100, remainingPercentage: 0 };

        service.mockResponse = build({ planInfo: { monthlyPromptCredits: 100, monthlyFlowCredits: 50 } });
        const omitted = await service.fetchQuota();

        service.mockResponse = build({
            planInfo: { monthlyPromptCredits: 100, monthlyFlowCredits: 50 },
            availablePromptCredits: 0,
            availableFlowCredits: 0
        });
        const explicit = await service.fetchQuota();

        assert.deepStrictEqual(omitted!.promptCredits, expected);
        assert.deepStrictEqual(explicit!.promptCredits, expected);
        assert.deepStrictEqual(omitted!.flowCredits, expectedFlow);
        assert.deepStrictEqual(explicit!.flowCredits, expectedFlow);
    });

    test('should not report flow credits when the plan has no monthly flow credits', async () => {
        service.mockResponse = {
            userStatus: { planStatus: { planInfo: { monthlyPromptCredits: 100 } } }
        };
        const snapshot = await service.fetchQuota();

        assert.strictEqual(snapshot!.flowCredits, undefined);
        assert.strictEqual(snapshot!.promptCredits!.available, 0);
    });

    suite('parsingError across retries', () => {
        let clock: sinon.SinonFakeTimers;
        let statusService: StatusQuotaService;

        setup(() => {
            clock = sinon.useFakeTimers();
            statusService = new StatusQuotaService(configManager);
            statusService.setServerInfo({ port: 1234, csrfToken: 'token', pid: 100 } as any);
        });

        teardown(() => {
            clock.restore();
        });

        test('should clear the first attempt error when the retry succeeds', async () => {
            statusService.responses = [
                { statusCode: 503, data: null },
                { statusCode: 200, data: validResponse }
            ];

            const pending = statusService.fetchQuota();
            await clock.tickAsync(1000);
            const snapshot = await pending;

            assert.ok(snapshot);
            assert.strictEqual(statusService.parsingError, null);
        });

        test('should keep the final attempt error when every attempt fails', async () => {
            statusService.responses = [
                { statusCode: 503, data: null },
                { statusCode: 502, data: null }
            ];

            const pending = statusService.fetchQuota();
            await clock.tickAsync(1000);
            const snapshot = await pending;

            assert.strictEqual(snapshot, null);
            assert.strictEqual(statusService.parsingError, 'HTTP_ERROR_502');
        });
    });

    test('should return the snapshot and not report an error when the update callback throws', async () => {
        service.mockResponse = validResponse;
        let errorCalled = false;
        service.onError(() => { errorCalled = true; });
        service.onUpdate(() => { throw new Error('consumer failure'); });

        const snapshot = await service.fetchQuota();

        assert.ok(snapshot, 'Fetch result must survive a throwing callback');
        assert.strictEqual(errorCalled, false);
    });

    suite('weekly limits from the quota summary', () => {
        const summary = (buckets: any[]) => ({
            statusCode: 200,
            data: { response: { groups: [{ displayName: 'Gemini Models', buckets }] } }
        });

        test('should attach weekly buckets and skip other windows', async () => {
            service.mockResponse = validResponse;
            service.summaryResponse = summary([
                { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.89276433, resetTime: '2026-10-07T04:06:06Z' },
                { bucketId: 'gemini-5h', window: '5h', remainingFraction: 1, resetTime: '2026-10-03T05:52:00Z' }
            ]);

            const snapshot = await service.fetchQuota();

            assert.ok(snapshot);
            assert.strictEqual(service.summaryRequestCount, 1);
            assert.strictEqual(snapshot!.weeklyLimits?.length, 1);
            const weekly = snapshot!.weeklyLimits![0];
            assert.strictEqual(weekly.bucketId, 'gemini-weekly');
            assert.ok(Math.abs(weekly.remainingPercentage - 89.276433) < 1e-9);
            assert.strictEqual(weekly.resetTime?.toISOString(), '2026-10-07T04:06:06.000Z');
        });

        test('should treat an omitted fraction as zero and drop invalid reset times', async () => {
            service.mockResponse = validResponse;
            service.summaryResponse = summary([
                { bucketId: '3p-weekly', window: 'weekly', resetTime: 'not-a-date' }
            ]);

            const snapshot = await service.fetchQuota();

            assert.strictEqual(snapshot!.weeklyLimits![0].remainingPercentage, 0);
            assert.strictEqual(snapshot!.weeklyLimits![0].resetTime, undefined);
        });

        test('should skip a bucket that reports only an amount', async () => {
            service.mockResponse = validResponse;
            service.summaryResponse = summary([
                { bucketId: 'gemini-weekly', window: 'weekly', remainingAmount: '120', resetTime: '2026-10-07T04:06:06Z' }
            ]);

            const snapshot = await service.fetchQuota();

            assert.deepStrictEqual(snapshot!.weeklyLimits, []);
        });

        test('should keep the quota snapshot when the summary RPC is missing or fails', async () => {
            for (const reply of [{ statusCode: 404, data: null }, { statusCode: 200, data: {} }, new Error('ECONNRESET')]) {
                service.mockResponse = validResponse;
                service.summaryResponse = reply;
                let receivedError: Error | undefined;
                service.onError(err => { receivedError = err; });

                const snapshot = await service.fetchQuota();

                assert.ok(snapshot, 'quota fetch must still succeed');
                assert.strictEqual(snapshot!.weeklyLimits, undefined);
                assert.strictEqual(snapshot!.models.length, 1);
                assert.strictEqual(service.parsingError, null);
                assert.strictEqual(receivedError, undefined);
            }
        });
    });
});

suite('QuotaService request host', () => {
    teardown(() => sinon.restore());

    test('should use the host found during discovery, else the configured host', async () => {
        const hosts: string[] = [];
        sinon.stub(httpClient, 'httpRequest').callsFake(async (options) => {
            hosts.push(options.hostname);
            return { statusCode: 200, data: {} as never, protocol: 'http' };
        });
        const service = new QuotaService(new ConfigManager(new MockConfigReader()));
        const request = (s: QuotaService) =>
            (s as unknown as { request(path: string, body: object): Promise<unknown> }).request('/p', {});

        service.setServerInfo({ port: 1234, csrfToken: 'token', host: '172.28.16.1' });
        await request(service);
        service.setServerInfo({ port: 1234, csrfToken: 'token' });
        await request(service);

        assert.deepStrictEqual(hosts, ['172.28.16.1', '127.0.0.1']);
    });
});
