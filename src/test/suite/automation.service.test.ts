import * as assert from 'assert';
import * as net from 'net';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { WebSocketServer } from 'ws';
import { AutomationService } from '../../model/services/automation.service';
import { Scheduler } from '../../shared/utils/scheduler';

class ClickerElement {
    readonly dataset: Record<string, string> = {};
    readonly children: ClickerElement[] = [];
    parentElement: ClickerElement | null = null;
    ownerDocument!: ClickerDocument;
    shadowRoot: ClickerElement | null = null;
    clickCount = 0;

    constructor(
        readonly tagName: string,
        private ownText = '',
        readonly className = '',
        readonly id = '',
        readonly testId = ''
    ) { }

    get innerText(): string {
        return [this.ownText, ...this.children.map(child => child.innerText)].filter(Boolean).join(' ');
    }

    set innerText(value: string) {
        this.ownText = value;
    }

    get textContent(): string {
        return this.innerText;
    }

    append(...elements: ClickerElement[]): void {
        for (const element of elements) {
            element.parentElement = this;
            this.children.push(element);
            if (this.ownerDocument) this.ownerDocument.attach(element);
        }
    }

    replaceChild(next: ClickerElement, previous: ClickerElement): void {
        const index = this.children.indexOf(previous);
        assert.notStrictEqual(index, -1);
        previous.parentElement = null;
        next.parentElement = this;
        this.children[index] = next;
        this.ownerDocument.attach(next);
    }

    removeChild(element: ClickerElement): void {
        const index = this.children.indexOf(element);
        assert.notStrictEqual(index, -1);
        this.children.splice(index, 1);
        element.parentElement = null;
    }

    matches(selectorList: string): boolean {
        return selectorList.split(',').some(selector => {
            const value = selector.trim();
            if (value.startsWith('.')) return this.className.split(/\s+/).includes(value.slice(1));
            if (value.startsWith('#')) return this.id === value.slice(1);
            if (value === '[data-testid="agent-panel"]') return this.testId === 'agent-panel';
            return this.tagName.toLowerCase() === value.toLowerCase();
        });
    }

    querySelectorAll(selector: string): ClickerElement[] {
        if (selector === 'iframe, frame') return [];
        const descendants: ClickerElement[] = [];
        const visit = (element: ClickerElement) => {
            for (const child of element.children) {
                descendants.push(child);
                visit(child);
            }
        };
        visit(this);
        if (selector === '*') return descendants;
        return descendants.filter(element => element.matches(selector));
    }

    querySelector(selector: string): ClickerElement | null {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    getAttribute(name: string): string | null {
        if (name === 'role' && this.tagName === 'BUTTON') return 'button';
        return null;
    }

    closest(selector: string): ClickerElement | null {
        let element: ClickerElement | null = this;
        while (element) {
            if (element.matches(selector)) return element;
            element = element.parentElement;
        }
        return null;
    }

    click(): void {
        this.clickCount++;
    }

    dispatchEvent(): boolean {
        return true;
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, width: 10, height: 10 };
    }
}

class ClickerDocument {
    readonly defaultView: { getComputedStyle: (element: ClickerElement) => { cursor: string } };

    constructor(readonly documentElement: ClickerElement) {
        this.defaultView = {
            getComputedStyle: element => ({ cursor: element.tagName === 'BUTTON' ? 'pointer' : 'default' })
        };
        this.attach(documentElement);
    }

    attach(element: ClickerElement): void {
        element.ownerDocument = this;
        element.children.forEach(child => this.attach(child));
        if (element.shadowRoot) this.attach(element.shadowRoot);
    }

    querySelectorAll(selector: string): ClickerElement[] {
        const matches = this.documentElement.matches(selector) ? [this.documentElement] : [];
        return matches.concat(this.documentElement.querySelectorAll(selector));
    }

    querySelector(selector: string): ClickerElement | null {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    createTreeWalker(root: ClickerElement) {
        const elements = root.querySelectorAll('*');
        let index = 0;
        return { nextNode: () => elements[index++] ?? null };
    }
}

function createClickerHarness(commandText = 'npm test') {
    const html = new ClickerElement('HTML');
    const panel = new ClickerElement('DIV', '', 'agent-panel');
    const card = new ClickerElement('DIV', commandText);
    const button = new ClickerElement('BUTTON', 'Run');
    card.append(button);
    panel.append(card);
    html.append(panel);
    const document = new ClickerDocument(html);
    const window: any = { getComputedStyle: document.defaultView.getComputedStyle };
    const execute = (script: string) => {
        const run = new Function('window', 'document', 'NodeFilter', 'MouseEvent', script);
        run(window, document, { SHOW_ELEMENT: 1 }, class { });
    };
    return { window, document, html, panel, card, button, execute };
}

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
        const connection = { close: sandbox.stub() };
        service['connections'].set('9222:agent', connection as any);

        schedulerMock.expects('stop').withExactArgs('autoAccept').once();

        service.stop();

        assert.strictEqual(service.isRunning(), false);
        assert.ok(connection.close.calledOnce, 'Stopping should close tracked CDP connections');
        assert.strictEqual(service['connections'].size, 0);
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

    test('task logic should call only discovered accept commands when enabled', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        // Keep unit tests off the network: a real IDE may be listening on 9222
        sandbox.stub(AutomationService.prototype as any, 'performCdpAutoAccept').resolves();
        sandbox.stub(vscode.commands, 'getCommands').resolves([
            'antigravity.terminalCommand.accept',
            'antigravity.command.accept',
            'unrelated.command'
        ]);
        service = new AutomationService();

        const taskArgs = schedulerStub.firstCall.args[0];
        assert.strictEqual(taskArgs.name, 'autoAccept');

        service.start();

        await taskArgs.execute();

        assert.deepStrictEqual(
            commandsStub.getCalls().map(call => call.args[0]),
            ['antigravity.terminalCommand.accept', 'antigravity.command.accept'],
            'Should call exactly the registered candidate commands'
        );
    });

    test('command discovery should tolerate getCommands failure', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        sandbox.stub(AutomationService.prototype as any, 'performCdpAutoAccept').resolves();
        sandbox.stub(vscode.commands, 'getCommands').rejects(new Error('not available'));
        service = new AutomationService();

        const taskArgs = schedulerStub.firstCall.args[0];
        service.start();

        await taskArgs.execute();

        assert.ok(commandsStub.notCalled, 'Should not call any accept command when discovery fails');
    });

    test('command discovery should refresh after 60 seconds and find late registrations', async () => {
        const clock = sandbox.useFakeTimers({ now: 10_000 });
        service.dispose();
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        sandbox.stub(AutomationService.prototype as any, 'performCdpAutoAccept').resolves();
        const getCommandsStub = sandbox.stub(vscode.commands, 'getCommands');
        getCommandsStub.onFirstCall().resolves([]);
        getCommandsStub.onSecondCall().resolves(['antigravity.agent.acceptAgentStep']);
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];
        service.start();

        await taskArgs.execute();
        await clock.tickAsync(59_999);
        await taskArgs.execute();
        assert.strictEqual(getCommandsStub.callCount, 1, 'Should use the cached command set before 60 seconds');

        await clock.tickAsync(1);
        await taskArgs.execute();
        assert.strictEqual(getCommandsStub.callCount, 2, 'Should refresh command discovery at 60 seconds');
        assert.deepStrictEqual(commandsStub.getCalls().map(call => call.args[0]), ['antigravity.agent.acceptAgentStep']);
    });

    test('stop() should invalidate command discovery already in flight', async () => {
        service.dispose();
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        sandbox.stub(AutomationService.prototype as any, 'performCdpAutoAccept').resolves();
        let resolveCommands!: (commands: string[]) => void;
        sandbox.stub(vscode.commands, 'getCommands').returns(new Promise(resolve => {
            resolveCommands = resolve;
        }));
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];
        service.start();

        const execution = taskArgs.execute();
        await Promise.resolve();
        service.stop();
        resolveCommands(['antigravity.terminalCommand.accept']);
        await execution;

        assert.ok(commandsStub.notCalled, 'An in-flight run must not accept after stop()');
        assert.strictEqual(service['availableCommands'], null, 'A stale discovery must not overwrite the next run cache');
    });

    test('stop() should close a CDP connection completed by a stale run without replacing a new owner', async () => {
        sandbox.stub(service as any, 'getPages').resolves([
            { type: 'page', id: 'agent', webSocketDebuggerUrl: 'ws://agent' }
        ]);
        let resolveConnect!: (connected: any) => void;
        sandbox.stub(service as any, 'connectToPage').returns(new Promise(resolve => {
            resolveConnect = resolve;
        }));
        const evaluateStub = sandbox.stub(service as any, 'evaluate').resolves();
        service.start();

        const work = service['performCdpAutoAccept'](service['runGeneration']);
        await Promise.resolve();
        service.stop();
        service.start();
        const replacement = { close: sandbox.stub(), readyState: 1 };
        service['connections'].set('9222:agent', replacement as any);
        const staleSocket = { close: sandbox.stub(), readyState: 1 };
        resolveConnect(staleSocket);
        await work;

        assert.ok(evaluateStub.notCalled, 'An in-flight CDP run must not evaluate after stop()');
        assert.ok(staleSocket.close.calledOnce, 'The stale run connection should close itself');
        assert.strictEqual(service['connections'].get('9222:agent'), replacement as any);
    });

    test('task logic should NOT execute when disabled', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];

        assert.strictEqual(service.isRunning(), false);

        await taskArgs.execute();

        assert.ok(commandsStub.notCalled, 'Should not execute commands when disabled');
    });

    test('clicker script should be syntactically valid without persistent page helpers', () => {
        const script = service['getClickerScript']() as string;
        assert.doesNotThrow(() => new Function(script), 'Injected script must parse as valid JS');
        assert.ok(!script.includes('MutationObserver'));
        assert.ok(!script.includes('__agPanelAA'));
        assert.ok(!script.includes('ACTION_MAX_ATTEMPTS'));
        assert.ok(!script.includes('setTimeout'));
        assert.ok(!script.includes('setInterval'));

        const harness = createClickerHarness();
        const windowKeys = Object.keys(harness.window);
        harness.execute(script);
        assert.deepStrictEqual(Object.keys(harness.window), windowKeys, 'The scan must not install window state');
    });

    test('each scheduled pass should relocate the current Agent Panel', () => {
        const harness = createClickerHarness();
        const script = service['getClickerScript']();
        harness.execute(script);
        assert.strictEqual(harness.button.clickCount, 1);

        const nextPanel = new ClickerElement('DIV', '', 'agent-panel');
        const nextCard = new ClickerElement('DIV', 'npm run build');
        const nextButton = new ClickerElement('BUTTON', 'Accept');
        nextCard.append(nextButton);
        nextPanel.append(nextCard);
        harness.html.replaceChild(nextPanel, harness.panel);
        const outside = new ClickerElement('BUTTON', 'Run');
        harness.html.append(outside);

        harness.execute(script);
        assert.strictEqual(nextButton.clickCount, 1, 'A later pass should scan the replacement panel');
        assert.strictEqual(outside.clickCount, 0, 'Controls outside the Agent Panel must remain untouched');
    });

    test('danger context should never read text outside the Agent Panel', () => {
        const harness = createClickerHarness('npm test');
        harness.html.append(new ClickerElement('DIV', 'rm -rf /'));
        harness.execute(service['getClickerScript']());
        assert.ok(harness.button.clickCount > 0, 'External dangerous text must not block a safe panel action');
    });

    test('danger context should not leak across sibling cards in the Agent Panel', () => {
        const harness = createClickerHarness('npm test');
        harness.panel.append(new ClickerElement('DIV', 'rm -rf /'));
        harness.execute(service['getClickerScript']());
        assert.strictEqual(harness.button.clickCount, 1, 'A dangerous sibling card must not block the safe card');
    });

    test('danger filtering should be re-evaluated on the next scheduled pass', () => {
        const harness = createClickerHarness('rm -rf /');
        const script = service['getClickerScript']();
        harness.execute(script);
        assert.strictEqual(harness.button.clickCount, 0, 'Dangerous action should be left for manual review');

        harness.card.innerText = 'npm test';
        harness.execute(script);
        assert.ok(harness.button.clickCount > 0, 'The reused button should be accepted after its content becomes safe');
    });

    test('node timestamp should suppress immediate repeats without tracking action history', async () => {
        const clock = sandbox.useFakeTimers({ now: 10_000 });
        const harness = createClickerHarness('npm test');
        const script = service['getClickerScript']();
        harness.execute(script);
        assert.strictEqual(harness.button.clickCount, 1, 'Initial action should be clicked once');

        harness.execute(script);
        assert.strictEqual(harness.button.clickCount, 1, 'The same DOM node should not be clicked again immediately');

        const replacement = new ClickerElement('BUTTON', 'Run');
        harness.card.replaceChild(replacement, harness.button);
        harness.execute(script);
        assert.strictEqual(replacement.clickCount, 1, 'A replacement action should be eligible without a global circuit breaker');

        await clock.tickAsync(5_000);
        harness.execute(script);
        assert.strictEqual(replacement.clickCount, 2, 'The same node should become eligible after the short retry delay');
    });

    test('scheduled scans should include accessible shadow roots', () => {
        const harness = createClickerHarness();
        harness.panel.removeChild(harness.card);
        const host = new ClickerElement('DIV');
        const shadow = new ClickerElement('SHADOW');
        const card = new ClickerElement('DIV', 'npm test');
        const button = new ClickerElement('BUTTON', 'Run');
        card.append(button);
        shadow.append(card);
        host.shadowRoot = shadow;
        harness.panel.append(host);
        harness.document.attach(shadow);

        harness.execute(service['getClickerScript']());
        assert.strictEqual(button.clickCount, 1, 'Initial shadow-root action should be scanned');

        const replacement = new ClickerElement('BUTTON', 'Accept');
        card.innerText = 'npm run build';
        card.replaceChild(replacement, button);
        harness.execute(service['getClickerScript']());
        assert.strictEqual(replacement.clickCount, 1, 'A later scheduled scan should see shadow-root changes');
    });

    test('should use fixed CDP port 9222', () => {
        // @ts-ignore: access private static for testing
        assert.strictEqual(AutomationService['CDP_PORT'], 9222);
    });

    test('connectToPage should timeout and resolve null for half-open sockets', async function () {
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
            assert.strictEqual(result, null);
            // @ts-ignore: access private map to verify failed connections are cleaned up
            assert.strictEqual(service['connections'].has('half-open'), false);
        } finally {
            sockets.forEach(socket => socket.destroy());
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('a stale WebSocket close must not delete its replacement connection', async () => {
        const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        await new Promise<void>(resolve => server.once('listening', () => resolve()));
        const address = server.address();
        assert.ok(address && typeof address !== 'string');

        try {
            const stale = await service['connectToPage']('same-page', `ws://127.0.0.1:${address.port}`);
            assert.ok(stale);
            service['connections'].set('same-page', stale);

            const replacement = { close: sandbox.stub() };
            service['connections'].set('same-page', replacement as any);
            const closed = new Promise<void>(resolve => stale.once('close', () => resolve()));
            stale.close();
            await closed;

            assert.strictEqual(service['connections'].get('same-page'), replacement as any);
        } finally {
            service['connections'].delete('same-page');
            await new Promise<void>(resolve => server.close(() => resolve()));
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
