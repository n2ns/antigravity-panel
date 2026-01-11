import * as assert from 'assert';
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
        // Expect scheduler start to be called with 'autoAccept'
        schedulerMock.expects('start').withExactArgs('autoAccept').once();
        // Expect scheduler isRunning to be called and return true
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

    test('task logic should execute commands when enabled', async () => {
        // We need to extract the task callback to verify its logic
        // This is a bit tricky with private access, but typical for unit testing internal logic
        // Or we can rely on the fact that we test the public methods and Scheduler separately.
        // However, to test that the *task* calls the commands, we can mock the scheduler's register method
        // to capture the task.

        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        // Re-instantiate to use the stub
        service = new AutomationService();

        // Get the registered task
        const taskArgs = schedulerStub.firstCall.args[0];
        assert.strictEqual(taskArgs.name, 'autoAccept');

        // Enable it so the task logic proceeds
        service.start();

        // Run the task manually
        await taskArgs.execute();

        // Verify commands were called
        assert.ok(commandsStub.calledWith('antigravity.agent.acceptAgentStep'), 'Should call acceptAgentStep');
        assert.ok(commandsStub.calledWith('antigravity.terminal.accept'), 'Should call terminal.accept');
    });

    test('task logic should NOT execute commands when disabled', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];

        // Ensure it's disabled
        assert.strictEqual(service.isRunning(), false);

        await taskArgs.execute();

        assert.ok(commandsStub.notCalled, 'Should not execute commands when disabled');
    });
});
