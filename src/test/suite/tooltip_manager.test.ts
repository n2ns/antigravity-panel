import * as assert from 'assert';
import { TooltipManager } from '../../view/webview/utils/tooltip-manager';

suite('TooltipManager Test Suite', () => {
    let originalDocument: any;
    let originalWindow: any;

    let mockElement: any;
    let mockBody: any;
    let eventListeners: Map<string, Function> = new Map();
    let createdElements: any[] = [];

    setup(() => {
        // Save original globals
        originalDocument = (global as any).document;
        originalWindow = (global as any).window;

        // Reset mocks
        eventListeners.clear();
        createdElements = [];

        // Mock Style
        const createMockStyle = () => new Proxy({}, {
            set: (target: any, prop: string, value: string) => {
                target[prop] = value;
                return true;
            },
            get: (target: any, prop: string) => target[prop]
        });

        // Mock Element
        class MockElement {
            style = createMockStyle();
            className = '';
            textContent = '';
            removed = false;

            closest(selector: string) {
                return selector === '[data-tooltip]' ? this : null;
            }

            getAttribute(name: string) {
                return name === 'data-tooltip' ? 'Test Tooltip Content' : null;
            }

            getBoundingClientRect() {
                return { top: 200, bottom: 230, left: 100, right: 150, width: 50, height: 30 };
            }

            remove() {
                this.removed = true;
            }
        }

        mockElement = new MockElement();

        // Mock Body
        mockBody = {
            appendChild: (el: any) => createdElements.push(el),
            addEventListener: (event: string, cb: Function) => eventListeners.set(event, cb),
            removeEventListener: (event: string, cb: Function) => {
                if (eventListeners.get(event) === cb) {
                    eventListeners.delete(event);
                }
            },
            clientWidth: 800 // Fallback width
        };

        // Mock Document
        (global as any).document = {
            createElement: (tag: string) => {
                const el = new MockElement();
                return el;
            },
            body: mockBody,
            documentElement: {
                clientWidth: 1024 // Viewport width
            }
        };

        // Mock Window
        (global as any).window = {
            setTimeout: (cb: Function, ms: number) => {
                cb(); // Execute immediately for testing
                return 123;
            },
            clearTimeout: (id: number) => { }
        };
    });

    teardown(() => {
        // Restore globals
        (global as any).document = originalDocument;
        (global as any).window = originalWindow;
    });

    test('should create tooltip element on initialization', () => {
        new TooltipManager();
        assert.strictEqual(createdElements.length, 1);
        assert.strictEqual(createdElements[0].className, 'global-tooltip');
        assert.strictEqual(createdElements[0].style.position, 'fixed');
    });

    test('should show tooltip on mouseover', () => {
        new TooltipManager();
        const mouseOverHandler = eventListeners.get('mouseover');
        assert.ok(mouseOverHandler, 'Mouseover listener should be attached');

        // Simulate mouseover event
        const mockEvent = { target: mockElement };
        mouseOverHandler!(mockEvent);

        const tooltipEl = createdElements[0];

        // Check visibility
        assert.strictEqual(tooltipEl.style.visibility, 'visible');
        assert.strictEqual(tooltipEl.style.opacity, '1');
        assert.strictEqual(tooltipEl.textContent, 'Test Tooltip Content');

        // Check Positioning logic
        // Top should be: rect.top (200) - 8 = 192
        assert.strictEqual(tooltipEl.style.top, '192px');

        // Left should be fixed 10px
        assert.strictEqual(tooltipEl.style.left, '10px');

        // Max-width should be viewport (1024) - 20 = 1004px
        assert.strictEqual(tooltipEl.style.maxWidth, '1004px');
    });

    test('should hide tooltip on mouseout', () => {
        new TooltipManager();
        const mouseOverHandler = eventListeners.get('mouseover');
        const mouseOutHandler = eventListeners.get('mouseout');

        // 1. Show it first to set active target
        mouseOverHandler!({ target: mockElement });

        const tooltipEl = createdElements[0];
        assert.strictEqual(tooltipEl.style.visibility, 'visible');

        // 2. Hide it
        // We mocked setTimeout to execute immediately
        mouseOutHandler!({ target: mockElement });

        assert.strictEqual(tooltipEl.style.visibility, 'hidden');
        assert.strictEqual(tooltipEl.style.opacity, '0');
    });

    test('should remove listeners and tooltip element on dispose', () => {
        const manager = new TooltipManager();
        const tooltipEl = createdElements[0];

        assert.ok(eventListeners.has('mouseover'));
        assert.ok(eventListeners.has('mouseout'));

        manager.dispose();

        assert.strictEqual(eventListeners.has('mouseover'), false);
        assert.strictEqual(eventListeners.has('mouseout'), false);
        assert.strictEqual(tooltipEl.removed, true);
    });
});
