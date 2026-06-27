import * as assert from 'assert';
import * as net from 'net';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AutomationService } from '../../model/services/automation.service';
import { Scheduler } from '../../shared/utils/scheduler';

suite('AutomationService Test Suite', () => {
    let service: AutomationService;
    let sandbox: sinon.SinonSandbox;
    let schedulerMock: sinon.SinonMock;
    let commandsStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        commandsStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        service = new AutomationService();
        // @ts-ignore: access private property for testing
        schedulerMock = sandbox.mock(service['scheduler']);
    });

    teardown(() => {
        service.dispose();
        sandbox.restore();
    });

    test('should be disabled by default', () => {
        assert.strictEqual(service.isRunning(), false);
    });

    test('start() should enable service and start scheduler', () => {
        schedulerMock.expects('start').withExactArgs('autoAccept').once();
        schedulerMock.expects('isRunning').withExactArgs('autoAccept').returns(true);

        service.start();

        assert.strictEqual(service.isRunning(), true);
        schedulerMock.verify();
    });

    test('stop() should disable service and stop scheduler', () => {
        service.start();

        schedulerMock.expects('stop').withExactArgs('autoAccept').once();

        service.stop();

        assert.strictEqual(service.isRunning(), false);
        schedulerMock.verify();
    });

    test('toggle() should switch state', () => {
        // Disabled -> Enabled
        schedulerMock.expects('start').once();
        schedulerMock.expects('isRunning').returns(true);

        service.toggle();
        assert.strictEqual(service.isRunning(), true);

        // Enabled -> Disabled
        schedulerMock.expects('stop').once();
        service.toggle();
        assert.strictEqual(service.isRunning(), false);
    });

    test('updateInterval() should delegate to scheduler', () => {
        schedulerMock.expects('updateInterval').withExactArgs('autoAccept', 1000).once();
        service.updateInterval(1000);
        schedulerMock.verify();
    });

    test('task logic should call command API when enabled', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        service = new AutomationService();

        const taskArgs = schedulerStub.firstCall.args[0];
        assert.strictEqual(taskArgs.name, 'autoAccept');

        service.start();

        await taskArgs.execute();

        // Primary strategy: command API should be called
        assert.ok(commandsStub.calledWith('antigravity.agent.acceptAgentStep'), 'Should call acceptAgentStep');
        assert.ok(commandsStub.calledWith('antigravity.terminal.accept'), 'Should call terminal.accept');
    });

    test('task logic should NOT execute when disabled', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];

        assert.strictEqual(service.isRunning(), false);

        await taskArgs.execute();

        assert.ok(commandsStub.notCalled, 'Should not execute commands when disabled');
    });

    test('should use fixed CDP port 9222', () => {
        // @ts-ignore: access private static for testing
        assert.strictEqual(AutomationService['CDP_PORT'], 9222);
    });

    test('connectToPage should timeout and resolve false for half-open sockets', async function () {
        this.timeout(3000);
        const sockets = new Set<net.Socket>();
        const server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            // Keep the socket open without completing a WebSocket handshake.
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address !== 'string');

        try {
            // @ts-ignore: access private method for timeout behavior
            const result = await service['connectToPage']('half-open', `ws://127.0.0.1:${address.port}`);
            assert.strictEqual(result, false);
            // @ts-ignore: access private map to verify failed connections are cleaned up
            assert.strictEqual(service['connections'].has('half-open'), false);
        } finally {
            sockets.forEach(socket => socket.destroy());
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('dispose() should clean up connections', () => {
        // @ts-ignore: access private for testing
        const connections = service['connections'];
        const mockWs = { close: sandbox.stub() };
        connections.set('test:1', mockWs as any);

        service.dispose();

        assert.ok(mockWs.close.calledOnce, 'Should close WebSocket connections');
        assert.strictEqual(connections.size, 0, 'Should clear connections map');
    });
});
