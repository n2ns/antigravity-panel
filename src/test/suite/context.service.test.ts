import * as assert from 'assert';
import * as sinon from 'sinon';
import * as httpClient from '../../shared/utils/http_client';
import { ContextService } from '../../model/services/context.service';
import { ConfigManager, IConfigReader } from '../../shared/config/config_manager';

const reader: IConfigReader = { get: <T>(_key: string, defaultValue: T) => defaultValue };

type Responses = Record<string, { statusCode: number; data: unknown } | Error>;

/** ContextService with the HTTP layer replaced by canned responses */
class TestContextService extends ContextService {
    calls: { method: string; body: Record<string, unknown> }[] = [];
    constructor(public responses: Responses) {
        super(new ConfigManager(reader));
    }
    protected async request<T>(method: string, body: object) {
        this.calls.push({ method, body: body as Record<string, unknown> });
        const response = this.responses[method];
        if (response instanceof Error) throw response;
        return { ...response, data: response.data as T, protocol: 'http' as const };
    }
}

const summary = (overrides: Record<string, unknown> = {}) => ({
    summary: 'Fix tests',
    stepCount: 10,
    status: 'CASCADE_RUN_STATUS_RUNNING',
    lastModifiedTime: '2026-10-03T08:41:11.752744111Z',
    trajectoryType: 'CORTEX_TRAJECTORY_TYPE_CASCADE',
    ...overrides
});

const call = (used: number | string | undefined, extra: Record<string, unknown> = {}) => ({
    chatModel: {
        responseModel: 'gemini-3.8-flash',
        chatStartMetadata: {
            checkpointIndex: -1,
            contextWindowMetadata: { estimatedTokensUsed: used, maxContextTokens: 256000 },
            ...extra
        }
    }
});

function createService(responses: Responses) {
    const service = new TestContextService(responses);
    service.setServerInfo({ port: 1234, csrfToken: 'token' });
    return service;
}

suite('ContextService Test Suite', () => {
    test('should return null before the server is known', async () => {
        const service = new TestContextService({});
        assert.strictEqual(await service.fetchContext(), null);
        assert.strictEqual(service.calls.length, 0);
    });

    test('should read the latest call of the most recently modified conversation', async () => {
        const service = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: {
                old: summary({ lastModifiedTime: '2026-10-03T07:00:00Z' }),
                current: summary(),
                subagent: summary({ lastModifiedTime: '2026-10-03T09:00:00Z', trajectoryType: 'CORTEX_TRAJECTORY_TYPE_BROWSER' })
            } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [
                call(1000),
                call(37190),
                { chatModel: { responseModel: 'intent-model' } }
            ] } }
        });

        assert.deepStrictEqual(await service.fetchContext(), {
            cascadeId: 'current', title: 'Fix tests', stepCount: 10, running: true,
            usedTokens: 37190, maxTokens: 256000, model: 'gemini-3.8-flash', checkpointIndex: -1, truncated: false
        });
        assert.strictEqual(service.calls[1].body.cascadeId, 'current');
    });

    test('should map omitted protobuf fields and string numbers', async () => {
        const service = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: {
                c: { lastModifiedTime: '2026-10-03T08:00:00Z' }
            } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [{
                chatModel: { chatStartMetadata: { contextWindowMetadata: {
                    estimatedTokensUsed: '255780', maxContextTokens: '256000', truncationReason: 'TRUNCATION_REASON_MAX_TOKEN_LIMIT'
                } } }
            }] } }
        });

        assert.deepStrictEqual(await service.fetchContext(), {
            cascadeId: 'c', title: '', stepCount: 0, running: false,
            usedTokens: 255780, maxTokens: 256000, model: '', checkpointIndex: 0, truncated: true
        });
    });

    test('should not report less than the prompt actually sent', async () => {
        const firstCall = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: { c: summary() } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [{
                chatModel: { ...call(147).chatModel, usage: { inputTokens: '21199' } }
            }] } }
        });
        assert.strictEqual((await firstCall.fetchContext())?.usedTokens, 21199, 'The first-call estimate misses the system prompt');

        const later = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: { c: summary() } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [{
                chatModel: { ...call(51114).chatModel, usage: { inputTokens: '16201', cacheReadTokens: '28557' } }
            }] } }
        });
        assert.strictEqual((await later.fetchContext())?.usedTokens, 51114, 'Later calls keep the server estimate that drives compression');
    });

    test('should fetch the metadata again only when the step count changes', async () => {
        const responses: Responses = {
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: { c: summary() } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [call(1000)] } }
        };
        const service = createService(responses);
        await service.fetchContext();

        responses.GetAllCascadeTrajectories = { statusCode: 200, data: { trajectorySummaries: {
            c: summary({ status: 'CASCADE_RUN_STATUS_IDLE' })
        } } };
        const idle = await service.fetchContext();
        assert.strictEqual(idle?.running, false);
        assert.strictEqual(service.calls.filter(c => c.method === 'GetCascadeTrajectoryGeneratorMetadata').length, 1);

        responses.GetAllCascadeTrajectories = { statusCode: 200, data: { trajectorySummaries: { c: summary({ stepCount: 12 }) } } };
        responses.GetCascadeTrajectoryGeneratorMetadata = { statusCode: 200, data: { generatorMetadata: [call(31115, { checkpointIndex: 1 })] } };
        const compressed = await service.fetchContext();
        assert.strictEqual(compressed?.usedTokens, 31115);
        assert.strictEqual(compressed?.checkpointIndex, 1);
        assert.strictEqual(service.calls.filter(c => c.method === 'GetCascadeTrajectoryGeneratorMetadata').length, 2);

        // A new server forgets the cached conversation
        service.setServerInfo({ port: 5678, csrfToken: 'other' });
        await service.fetchContext();
        assert.strictEqual(service.calls.filter(c => c.method === 'GetCascadeTrajectoryGeneratorMetadata').length, 3);
    });

    test('should return null without a conversation, a context window, or a successful request', async () => {
        const empty = createService({ GetAllCascadeTrajectories: { statusCode: 200, data: {} } });
        assert.strictEqual(await empty.fetchContext(), null);

        const noWindow = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: { c: summary() } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 200, data: { generatorMetadata: [call(5, { contextWindowMetadata: { maxContextTokens: 0 } })] } }
        });
        assert.strictEqual(await noWindow.fetchContext(), null);

        const httpError = createService({ GetAllCascadeTrajectories: { statusCode: 500, data: {} } });
        assert.strictEqual(await httpError.fetchContext(), null);

        const metadataError = createService({
            GetAllCascadeTrajectories: { statusCode: 200, data: { trajectorySummaries: { c: summary() } } },
            GetCascadeTrajectoryGeneratorMetadata: { statusCode: 404, data: {} }
        });
        assert.strictEqual(await metadataError.fetchContext(), null);

        const thrown = createService({ GetAllCascadeTrajectories: new Error('ECONNREFUSED') });
        assert.strictEqual(await thrown.fetchContext(), null);
    });
});

suite('ContextService request host', () => {
    teardown(() => sinon.restore());

    test('should use the host found during discovery, else the configured host', async () => {
        const hosts: string[] = [];
        sinon.stub(httpClient, 'httpRequest').callsFake(async (options) => {
            hosts.push(options.hostname);
            return { statusCode: 200, data: {} as never, protocol: 'http' };
        });
        const service = new ContextService(new ConfigManager(reader));
        const request = (s: ContextService) =>
            (s as unknown as { request(method: string, body: object): Promise<unknown> }).request('M', {});

        service.setServerInfo({ port: 1234, csrfToken: 'token', host: '172.28.16.1' });
        await request(service);
        service.setServerInfo({ port: 1234, csrfToken: 'token' });
        await request(service);

        assert.deepStrictEqual(hosts, ['172.28.16.1', '127.0.0.1']);
    });
});
