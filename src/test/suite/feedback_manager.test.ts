
import * as assert from 'assert';
import * as vscode from '../mocks/vscode';
import { FeedbackManager, DiagnosticMetadata } from '../../shared/utils/feedback_manager';

suite('FeedbackManager Test Suite', () => {
    const mockMeta: DiagnosticMetadata = {
        reason: 'test_reason',
        platform: 'win32',
        arch: 'x64',
        version: '1.2.3',
        candidateCount: 1,
        parsingInfo: 'some info'
    };

    test('getFeedbackUrl should construct correct GitHub URL', () => {
        const url = FeedbackManager.getFeedbackUrl(mockMeta);
        const urlString = url.path; // In mock Uri, path is the string

        assert.ok(urlString.startsWith('https://github.com/n2ns/antigravity-panel/issues/new'), 'Incorrect base URL');
        assert.ok(urlString.includes('title=' + encodeURIComponent('[REPORT-AUTO] test_reason - 1.2.3')), 'Missing title');
        assert.ok(urlString.includes('labels=bug,auto-report'), 'Missing labels');

        // Decoded body check
        const decodedBody = decodeURIComponent(urlString.split('body=')[1].split('&')[0]);
        assert.ok(decodedBody.includes('Diagnostic System Information (Auto-generated)'), 'Missing header');
        assert.ok(decodedBody.includes('**Extension Version**: 1.2.3'), 'Missing version');
        assert.ok(decodedBody.includes('**Operating System**: win32 (x64)'), 'Missing OS info');
        assert.ok(decodedBody.includes('**Candidate Process Count**: 1'), 'Missing candidate count');
    });

    test('getFeedbackUrl should handle missing optional meta fields', () => {
        const minimalMeta: DiagnosticMetadata = {
            reason: 'minimal',
            platform: 'linux',
            arch: 'arm64',
            version: '0.0.1'
        };
        const url = FeedbackManager.getFeedbackUrl(minimalMeta);
        const decodedBody = decodeURIComponent(url.path.split('body=')[1].split('&')[0]);

        assert.ok(!decodedBody.includes('Candidate Process Count'), 'Should not include candidate count if undefined');
        assert.ok(!decodedBody.includes('Parsing Details'), 'Should not include parsing details if undefined');
    });

    test('getFeedbackUrl should include process diagnostics when provided', () => {
        const url = FeedbackManager.getFeedbackUrl({
            ...mockMeta,
            diagnosticSummary: 'Diagnostic command: success\nRelated process output: none'
        });
        const decodedBody = decodeURIComponent(url.path.split('body=')[1].split('&')[0]);

        assert.ok(decodedBody.includes('**Process Diagnostics**'), 'Missing process diagnostics section');
        assert.ok(decodedBody.includes('Related process output: none'), 'Missing diagnostic summary');
    });

    test('getFeedbackUrl should include IDE product version when provided', () => {
        const url = FeedbackManager.getFeedbackUrl({ ...mockMeta, ideVersion: '1.107.0', productVersion: '2.1.1' });
        const decodedBody = decodeURIComponent(url.path.split('body=')[1].split('&')[0]);

        assert.ok(decodedBody.includes('**IDE Version**: 1.107.0'), 'Missing IDE base version');
        assert.ok(decodedBody.includes('**IDE Product Version**: 2.1.1'), 'Missing IDE product version');
    });

    test('getFeedbackUrl should substitute URL-hostile ASCII chars with full-width lookalikes', () => {
        // VS Code's openExternal chain double-encodes ? and #, and a raw & would
        // split the body query param — they must not survive into the URL body.
        const url = FeedbackManager.getFeedbackUrl({
            ...mockMeta,
            parsingInfo: 'why? a&b #tag 1+1'
        });
        const encodedBody = url.path.split('body=')[1].split('&labels=')[0];
        const decodedBody = decodeURIComponent(encodedBody);

        assert.ok(!encodedBody.includes('%3F') && !encodedBody.includes('%23') && !encodedBody.includes('%26') && !encodedBody.includes('%2B'),
            'Encoded body must not contain ASCII ?, #, &, + escapes');
        assert.ok(decodedBody.includes('why？ a＆b ＃tag 1＋1'), 'Hostile chars should become full-width lookalikes');
        assert.ok(decodedBody.includes('upgrade the IDE？'), 'Template question mark should be full-width');
    });

    test('showFeedbackNotification should show both buttons and handle diagnostic click', async () => {
        // Prepare mock selection
        (vscode.window as any).nextMessageSelection = 'Run Diagnostics';
        (vscode.commands as any).lastExecutedCommand = undefined;

        await FeedbackManager.showFeedbackNotification('test message', mockMeta);

        // Verify buttons shown
        const items = (vscode.window as any).lastMessageItems;
        assert.ok(items.includes('Feedback'), 'Missing Feedback button');
        assert.ok(items.includes('Run Diagnostics'), 'Missing Run Diagnostics button');

        // Verify command executed
        assert.strictEqual((vscode.commands as any).lastExecutedCommand, 'tfa.runDiagnostics');
    });
});
