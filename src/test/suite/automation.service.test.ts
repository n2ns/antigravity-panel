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
            getComputedStyle: element => ({ cursor: element.closest('button') ? 'pointer' : 'default' })
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
    // A terminal-command prompt offers Reject next to Run.
    const reject = new ClickerElement('BUTTON', 'Reject');
    card.append(button, reject);
    panel.append(card);
    html.append(panel);
    const document = new ClickerDocument(html);
    const window: any = { getComputedStyle: document.defaultView.getComputedStyle };
    const execute = (script: string) => {
        const run = new Function('window', 'document', 'NodeFilter', 'MouseEvent', script);
        run(window, document, { SHOW_ELEMENT: 1 }, class { });
    };
    return { window, document, html, panel, card, button, reject, execute };
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

    test('start() should enable service and start scheduler', () => {
        schedulerMock.expects('start').withExactArgs('autoAccept').once();

        service.start();

        schedulerMock.verify();
    });

    test('stop() should disable service and stop scheduler', () => {
        service.start();
        const connection = { close: sandbox.stub() };
        service['connections'].set('9222:agent', connection as any);

        schedulerMock.expects('stop').withExactArgs('autoAccept').once();

        service.stop();

        assert.ok(connection.close.calledOnce, 'Stopping should close tracked CDP connections');
        assert.strictEqual(service['connections'].size, 0);
        schedulerMock.verify();
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
            'antigravity.prioritized.agentAcceptAllInFile',
            'unrelated.command'
        ]);
        service = new AutomationService();

        const taskArgs = schedulerStub.firstCall.args[0];
        assert.strictEqual(taskArgs.name, 'autoAccept');

        service.start();

        await taskArgs.execute();

        assert.deepStrictEqual(
            commandsStub.getCalls().map(call => call.args[0]),
            ['antigravity.prioritized.agentAcceptAllInFile'],
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
        getCommandsStub.onSecondCall().resolves(['antigravity.prioritized.agentAcceptAllInFile']);
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
        assert.deepStrictEqual(commandsStub.getCalls().map(call => call.args[0]), ['antigravity.prioritized.agentAcceptAllInFile']);
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
        resolveCommands(['antigravity.prioritized.agentAcceptAllInFile']);
        await execution;

        assert.ok(commandsStub.notCalled, 'An in-flight run must not accept after stop()');
        assert.strictEqual(service['availableCommands'], null, 'A stale discovery must not overwrite the next run cache');
    });

    test('stop() should close a CDP connection completed by a stale run without replacing a new owner', async () => {
        sandbox.stub(service as any, 'getPages').resolves([
            {
                type: 'page',
                id: 'agent',
                url: 'vscode-file://vscode-app/workbench/workbench.html',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/agent'
            }
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
        service.setAcceptTerminalCommands(true);
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
        const outside = new ClickerElement('BUTTON', 'Accept');
        harness.html.append(outside);

        harness.execute(script);
        assert.strictEqual(nextButton.clickCount, 1, 'A later pass should scan the replacement panel');
        assert.strictEqual(outside.clickCount, 0, 'Controls outside the Agent Panel must remain untouched');
    });

    test('danger context should never read text outside the Agent Panel', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('npm test');
        harness.html.append(new ClickerElement('DIV', 'rm -rf /'));
        harness.execute(service['getClickerScript']());
        assert.ok(harness.button.clickCount > 0, 'External dangerous text must not block a safe panel action');
    });

    test('danger context should not leak across sibling cards in the Agent Panel', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('npm test');
        harness.panel.append(new ClickerElement('DIV', 'rm -rf /'));
        harness.execute(service['getClickerScript']());
        assert.strictEqual(harness.button.clickCount, 1, 'A dangerous sibling card must not block the safe card');
    });

    test('danger filtering should be re-evaluated on the next scheduled pass', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('rm -rf /');
        const script = service['getClickerScript']();
        harness.execute(script);
        assert.strictEqual(harness.button.clickCount, 0, 'Dangerous action should be left for manual review');

        harness.card.innerText = 'npm test';
        harness.execute(script);
        assert.ok(harness.button.clickCount > 0, 'The reused button should be accepted after its content becomes safe');
    });

    test('node timestamp should suppress immediate repeats without tracking action history', async () => {
        service.setAcceptTerminalCommands(true);
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
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness();
        harness.panel.removeChild(harness.card);
        const host = new ClickerElement('DIV');
        const shadow = new ClickerElement('SHADOW');
        const card = new ClickerElement('DIV', 'npm test');
        const button = new ClickerElement('BUTTON', 'Run');
        card.append(button, new ClickerElement('BUTTON', 'Reject'));
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

    test('commands that can approve a terminal command should never run, whatever the terminal setting', async () => {
        const schedulerStub = sandbox.stub(Scheduler.prototype, 'register');
        sandbox.stub(AutomationService.prototype as any, 'performCdpAutoAccept').resolves();
        const terminalCapable = [
            'antigravity.terminalCommand.accept',
            'antigravity.terminalCommand.run',
            'antigravity.terminal.accept',
            'antigravity.command.accept',
            'antigravity.agent.acceptAllAgentSteps',
            'antigravity.agent.acceptAgentStep'
        ];
        sandbox.stub(vscode.commands, 'getCommands').resolves([
            ...terminalCapable,
            'antigravity.prioritized.agentAcceptAllInFile'
        ]);
        service = new AutomationService();
        const taskArgs = schedulerStub.firstCall.args[0];
        service.start();

        for (const enabled of [false, true, false]) {
            commandsStub.resetHistory();
            service.setAcceptTerminalCommands(enabled);
            await taskArgs.execute();
            assert.deepStrictEqual(
                commandsStub.getCalls().map(call => call.args[0]),
                ['antigravity.prioritized.agentAcceptAllInFile'],
                `Only non-terminal commands may run (terminal setting ${enabled ? 'on' : 'off'})`
            );
            for (const id of terminalCapable) {
                assert.ok(!commandsStub.calledWith(id), `${id} must never run through the command path`);
            }
        }
    });

    test('Run buttons should be clicked only when terminal accepts are enabled', () => {
        for (const label of ['Run', 'Run Alt+⏎']) {
            const harness = createClickerHarness('npm test');
            const accept = new ClickerElement('BUTTON', 'Accept');
            const run = new ClickerElement('BUTTON', label);
            harness.card.removeChild(harness.button);
            harness.card.append(accept, run);

            harness.execute(service['getClickerScript']());
            assert.strictEqual(run.clickCount, 0, `"${label}" must not be clicked while terminal accepts are off`);
            assert.strictEqual(accept.clickCount, 1, 'Non-terminal actions are still accepted');

            service.setAcceptTerminalCommands(true);
            harness.execute(service['getClickerScript']());
            assert.strictEqual(run.clickCount, 1, `"${label}" should be clicked once terminal accepts are on`);
            service.setAcceptTerminalCommands(false);
        }
    });

    test('Run should be clicked only inside a terminal-command prompt', () => {
        service.setAcceptTerminalCommands(true);

        // A Run without a Reject in its card is not a terminal-command prompt.
        const lone = createClickerHarness('npm test');
        lone.card.removeChild(lone.reject);
        lone.execute(service['getClickerScript']());
        assert.strictEqual(lone.button.clickCount, 0, 'A Run outside a Reject/Run prompt must not be clicked');

        // A Reject in a sibling card must not turn a lone Run into a prompt.
        const siblings = createClickerHarness('npm test');
        const list = new ClickerElement('DIV');
        const loneCard = new ClickerElement('DIV', 'npm run build');
        const loneRun = new ClickerElement('BUTTON', 'Run');
        loneCard.append(loneRun);
        siblings.panel.removeChild(siblings.card);
        list.append(loneCard, siblings.card);
        siblings.panel.append(list);
        siblings.execute(service['getClickerScript']());
        assert.strictEqual(loneRun.clickCount, 0, 'A Reject from another card must not scope this Run');
        assert.strictEqual(siblings.button.clickCount, 1, 'The Run of the real prompt is clicked');

        // Run and Reject that only share the Agent Panel are not one prompt.
        const loose = createClickerHarness('npm test');
        loose.panel.removeChild(loose.card);
        const looseRun = new ClickerElement('BUTTON', 'Run');
        loose.panel.append(looseRun, new ClickerElement('BUTTON', 'Reject'));
        loose.execute(service['getClickerScript']());
        assert.strictEqual(looseRun.clickCount, 0, 'The panel itself is never treated as a prompt card');
    });

    test('Run should not borrow the Reject of a sibling card that has no Run', () => {
        service.setAcceptTerminalCommands(true);
        for (const editActions of [['Reject'], ['Accept', 'Reject']]) {
            const harness = createClickerHarness('npm test');
            harness.panel.removeChild(harness.card);
            const list = new ClickerElement('DIV');
            const runCard = new ClickerElement('DIV', 'npm run build');
            const run = new ClickerElement('BUTTON', 'Run');
            runCard.append(run);
            const editCard = new ClickerElement('DIV', 'src/app.ts');
            editCard.append(...editActions.map(label => new ClickerElement('BUTTON', label)));
            list.append(runCard, editCard);
            harness.panel.append(list);
            harness.execute(service['getClickerScript']());
            assert.strictEqual(run.clickCount, 0,
                `A Run must not be scoped by a sibling card offering ${editActions.join('/')}`);
        }

        // A keybinding hint next to Run still keeps Run and Reject in one group.
        const hinted = createClickerHarness('npm test');
        hinted.card.removeChild(hinted.button);
        const runGroup = new ClickerElement('DIV');
        const run = new ClickerElement('BUTTON', 'Run');
        runGroup.append(run, new ClickerElement('SPAN', 'Alt+⏎'));
        hinted.card.append(runGroup);
        hinted.execute(service['getClickerScript']());
        assert.strictEqual(run.clickCount, 1, 'Run beside its own Reject is still approved');
    });

    test('Always run should never be clicked, even inside a terminal-command prompt', () => {
        for (const enabled of [false, true]) {
            service.setAcceptTerminalCommands(enabled);
            const harness = createClickerHarness('npm test');
            const alwaysRun = new ClickerElement('BUTTON', 'Always run');
            harness.card.append(alwaysRun);
            harness.execute(service['getClickerScript']());
            assert.strictEqual(alwaysRun.clickCount, 0, 'Always run is a persistent grant');
            assert.strictEqual(harness.button.clickCount, enabled ? 1 : 0, 'Only the one-shot Run follows the setting');
            assert.strictEqual(harness.reject.clickCount, 0, 'Reject is never clicked');
        }
    });

    test('danger check should cover the whole terminal prompt card around a deeply nested Run', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('rm -rf /');
        harness.card.removeChild(harness.button);
        let parent = harness.card;
        for (let i = 0; i < 4; i++) {
            const wrapper = new ClickerElement('DIV');
            parent.append(wrapper);
            parent = wrapper;
        }
        const run = new ClickerElement('BUTTON', 'Run');
        parent.append(run);

        harness.execute(service['getClickerScript']());
        assert.strictEqual(run.clickCount, 0, 'A dangerous command in the prompt card must block its Run button');

        harness.card.innerText = 'npm test';
        harness.execute(service['getClickerScript']());
        assert.strictEqual(run.clickCount, 1, 'The same prompt is approved once its command is safe');
    });

    test('persistent grants should never be clicked', () => {
        for (const enabled of [false, true]) {
            service.setAcceptTerminalCommands(enabled);
            for (const label of ['Always allow', 'Always allow this conversation', 'Allow this conversation', 'Always run', 'Always Run Alt+⏎']) {
                const harness = createClickerHarness('npm test');
                const grant = new ClickerElement('BUTTON', label);
                harness.card.removeChild(harness.button);
                harness.card.append(grant);
                harness.execute(service['getClickerScript']());
                assert.strictEqual(grant.clickCount, 0,
                    `"${label}" is a persistent grant (terminal setting ${enabled ? 'on' : 'off'})`);
            }
        }
    });

    test('danger check should cover the whole action card, not only the button row', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('rm -fr ~');
        harness.card.removeChild(harness.button);
        const row = new ClickerElement('DIV');
        const run = new ClickerElement('BUTTON', 'Run');
        row.append(run, new ClickerElement('BUTTON', 'Reject'));
        harness.card.append(row);

        harness.execute(service['getClickerScript']());
        assert.strictEqual(run.clickCount, 0, 'A dangerous command elsewhere in the card must block the Run button');
    });

    const buildDeepPromptCard = (commandText: string) => {
        // card > body > footer > row > [wrapper > Run], Reject
        const harness = createClickerHarness(commandText);
        harness.card.removeChild(harness.button);
        harness.card.removeChild(harness.reject);
        const body = new ClickerElement('DIV');
        const footer = new ClickerElement('DIV');
        const row = new ClickerElement('DIV');
        const wrapper = new ClickerElement('DIV');
        const run = new ClickerElement('BUTTON', 'Run');
        wrapper.append(run);
        row.append(wrapper, new ClickerElement('BUTTON', 'Reject'));
        footer.append(row);
        body.append(footer);
        harness.card.append(body);
        return { harness, run };
    };

    test('danger check should climb from the action row to the whole prompt card', () => {
        service.setAcceptTerminalCommands(true);
        const dangerous = buildDeepPromptCard('rm -rf ~');
        dangerous.harness.execute(service['getClickerScript']());
        assert.strictEqual(dangerous.run.clickCount, 0, 'A dangerous command five levels above Run must block it');

        const safe = buildDeepPromptCard('npm test');
        safe.harness.execute(service['getClickerScript']());
        assert.strictEqual(safe.run.clickCount, 1, 'A safe command five levels above Run is approved');
    });

    test('Run should not be clicked when its prompt card shows no command text', () => {
        service.setAcceptTerminalCommands(true);
        const { harness, run } = buildDeepPromptCard('');
        harness.execute(service['getClickerScript']());
        assert.strictEqual(run.clickCount, 0, 'A prompt without visible command text must fail closed');
    });

    test('elements nested inside a button should not be clicked separately', () => {
        service.setAcceptTerminalCommands(true);
        const harness = createClickerHarness('npm test');
        harness.button.innerText = '';
        const label = new ClickerElement('SPAN', 'Run');
        harness.button.append(label);
        harness.execute(service['getClickerScript']());
        assert.strictEqual(label.clickCount, 0, 'The label inside the button is not a separate target');
        assert.strictEqual(harness.button.clickCount, 1, 'The button itself is clicked once');
    });

    test('danger patterns should catch destructive commands and spare ordinary ones', () => {
        const patterns = AutomationService['DANGER_PATTERNS'] as readonly RegExp[];
        const isDangerous = (text: string) => {
            const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
            return patterns.some(re => re.test(normalized));
        };
        const dangerous = [
            'rm -rf /', 'rm -r -f /', 'rm -fr ~', 'rm -Rf ~/', 'rm --recursive --force /', 'sudo rm -rf /*',
            'rm -rf "$HOME"', 'rm -rf ${HOME}', 'rm -rf "${HOME}/"', 'rm -rf $HOME/*', 'rm -f -r ~ && ls',
            'rm -rf --no-preserve-root /tmp',
            // Coverage of the original rule: any -r/-f rm on a path under /, ~ or $HOME
            'rm -rf /usr', 'rm -rf /etc', 'rm -rf /tmp/build', 'rm -f /', 'rm -rf ~/Documents',
            'rm -rf ~/project/node_modules', 'rm -f ~/.cache/x', 'rm -rf $HOME/.config', 'rm -rf "$HOME/project"',
            'git reset --hard', 'git reset --hard HEAD~1', 'git -C repo reset --hard origin/main', 'git reset HEAD~1 --hard',
            'git clean -f', 'git clean -fdx', 'git clean -xdf', 'git clean -d --force',
            'Remove-Item -Recurse -Force C:\\build', 'Remove-Item C:\\build -Recurse', 'Remove-Item . -r',
            'del /s /q C:\\build', 'del /q /s *.*', 'del /f/s/q build', 'erase /s build',
            'rmdir /s /q C:\\build', 'rd /s build', 'RMDIR /S build',
            'git push --force origin main', 'DROP TABLE users', 'mkfs.ext4 /dev/sda1', 'dd if=/dev/zero of=/dev/sda',
            'find / -delete', 'find ~ -name "*.log" -delete', 'find /usr -delete', 'find ~/Downloads -type f -delete',
            'git push origin +main', 'git push -fu origin main',
            'rm -r -fo C:\\Users\\me\\project', 'ri -recurse -force C:\\build', 'rd -r C:\\build', 'rm -rf C:/Users/me/project',
            'cd ~ && rm -rf *', 'cd / ; rm -rf .'
        ];
        const ordinary = [
            'rm -rf ./dist', 'rm -rf build', 'rm file.txt', 'rm ~', 'npm run rm', 'perform -r /x','git reset --soft HEAD~1', 'git reset HEAD file.txt',
            'git clean -n', 'git clean --dry-run', 'git clean -nd', 'git push --force-with-lease',
            'Remove-Item foo.txt', 'Get-ChildItem -Recurse', 'del file.txt', 'del /q file.txt',
            'rmdir build', 'rmdir /q build', 'model /s', 'npm test',
            'find . -name x -delete', 'find ./src -name "*.tmp" -delete', 'git push origin main', 'rm -r build', 'cd src && rm -rf dist'
        ];
        for (const text of dangerous) assert.ok(isDangerous(text), `Should flag: ${text}`);
        for (const text of ordinary) assert.ok(!isDangerous(text), `Should not flag: ${text}`);

        // The same patterns are embedded in the injected scan.
        for (const text of ['rm -r -f /', 'git clean -fdx', 'rmdir /s /q C:\\build']) {
            const harness = createClickerHarness(text);
            harness.button.innerText = 'Accept';
            harness.execute(service['getClickerScript']());
            assert.strictEqual(harness.button.clickCount, 0, `Injected scan should block: ${text}`);
        }
        const safe = createClickerHarness('rm -rf ./dist');
        safe.button.innerText = 'Accept';
        safe.execute(service['getClickerScript']());
        assert.strictEqual(safe.button.clickCount, 1, 'A project-relative cleanup is not flagged');
    });

    test('CDP should only attach to workbench targets with a loopback debugger socket', async () => {
        sandbox.stub(service as any, 'getPages').resolves([
            { type: 'page', id: 'workbench', url: 'vscode-file://vscode-app/out/workbench.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/workbench' },
            { type: 'webview', id: 'panel', url: 'vscode-webview://abc/index.html', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/panel' },
            { type: 'page', id: 'site', url: 'https://example.com/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/site' },
            { type: 'page', id: 'blank', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/blank' },
            { type: 'page', id: 'devtools', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/devtools' },
            { type: 'page', id: 'remote', url: 'vscode-file://vscode-app/out/workbench.html', webSocketDebuggerUrl: 'ws://192.168.1.5:9222/devtools/page/remote' },
            { type: 'page', id: 'lookalike', url: 'vscode-file://vscode-app/out/workbench.html', webSocketDebuggerUrl: 'ws://127.0.0.1.evil.test:9222/devtools/page/x' },
            { type: 'page', id: 'bad', url: 'vscode-webview://abc/index.html', webSocketDebuggerUrl: 'not a url' }
        ]);
        const connectStub = sandbox.stub(service as any, 'connectToPage').resolves(null);
        service.start();

        await service['performCdpAutoAccept'](service['runGeneration']);

        assert.deepStrictEqual(connectStub.getCalls().map(call => call.args[0]), ['9222:workbench', '9222:panel']);
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
