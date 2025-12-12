/**
 * WebviewHtmlBuilder Test Suite
 *
 * Tests HTML generation for webview
 * No VS Code dependency - uses plain string parameters
 * Uses external CSS for CSP compliance (no 'unsafe-inline')
 */

import * as assert from 'assert';
import { WebviewHtmlBuilder, generateNonce } from '../../ui/html_builder';

suite('WebviewHtmlBuilder Test Suite', () => {
  const testCspSource = 'https://example.com';
  const testCodiconsUri = 'https://cdn.example.com/codicons.css';
  const testStylesUri = 'https://cdn.example.com/webview.css';
  const testWebviewUri = 'https://cdn.example.com/webview.js';

  suite('build', () => {
    test('should generate valid HTML document', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(html.startsWith('<!DOCTYPE html>'), 'Should start with DOCTYPE');
      assert.ok(html.includes('<html>'), 'Should have html tag');
      assert.ok(html.includes('<head>'), 'Should have head tag');
      assert.ok(html.includes('<body>'), 'Should have body tag');
      assert.ok(html.includes('</html>'), 'Should close html tag');
    });

    test('should include Content-Security-Policy without unsafe-inline', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(html.includes('Content-Security-Policy'), 'Should have CSP meta tag');
      assert.ok(html.includes("default-src 'none'"), 'Should have restrictive default-src');
      assert.ok(html.includes("script-src 'nonce-"), 'Should have nonce-based script-src');
      assert.ok(!html.includes("'unsafe-inline'"), 'Should NOT have unsafe-inline');
    });

    test('should include codicons stylesheet', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(
        html.includes(`href="${testCodiconsUri}"`),
        'Should include codicons stylesheet link'
      );
    });

    test('should include external styles stylesheet', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(
        html.includes(`href="${testStylesUri}"`),
        'Should include external styles stylesheet link'
      );
    });

    test('should include webview script with nonce', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(html.includes(`src="${testWebviewUri}"`), 'Should include webview script');
      assert.ok(html.includes('nonce='), 'Should have nonce attribute on script');
      assert.ok(html.includes('type="module"'), 'Should be ES module');
    });

    test('should include sidebar-app custom element', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(html.includes('<sidebar-app></sidebar-app>'), 'Should have sidebar-app element');
    });

    test('should not include inline styles', () => {
      const html = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(!html.includes('<style>'), 'Should NOT have inline style tag');
    });

    test('should generate unique nonce for each build', () => {
      const builder = new WebviewHtmlBuilder()
        .setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri);

      const html1 = builder.build();
      const html2 = builder.build();

      // Extract nonce from CSP: script-src 'nonce-xxx'
      const cspNonceRegex = /nonce-([A-Za-z0-9+/=]+)/;
      // Extract nonce from script tag: nonce="xxx"
      const scriptNonceRegex = /nonce="([A-Za-z0-9+/=]+)"/;

      const cspNonce1 = html1.match(cspNonceRegex)?.[1];
      const scriptNonce1 = html1.match(scriptNonceRegex)?.[1];
      const cspNonce2 = html2.match(cspNonceRegex)?.[1];

      // Verify nonces exist
      assert.ok(cspNonce1, 'CSP nonce should exist');
      assert.ok(scriptNonce1, 'Script nonce should exist');

      // Same nonce used in CSP and script tag within one build
      assert.strictEqual(cspNonce1, scriptNonce1, 'Same nonce in CSP and script');

      // Different builds have different nonces
      assert.notStrictEqual(cspNonce1, cspNonce2, 'Different builds have different nonces');
    });

    test('should throw error if setHead not called', () => {
      const builder = new WebviewHtmlBuilder();
      assert.throws(() => builder.build(), /setHead\(\) must be called/);
    });
  });

  suite('setHead', () => {
    test('should return this for chaining', () => {
      const builder = new WebviewHtmlBuilder();
      const result = builder.setHead(testCspSource, testCodiconsUri, testStylesUri, testWebviewUri);
      assert.strictEqual(result, builder, 'setHead should return builder for chaining');
    });

    test('should accept different CSP sources', () => {
      const customCsp = 'vscode-webview://custom-source';
      const html = new WebviewHtmlBuilder()
        .setHead(customCsp, testCodiconsUri, testStylesUri, testWebviewUri)
        .build();

      assert.ok(html.includes(customCsp), 'Should include custom CSP source');
    });
  });

  suite('generateNonce', () => {
    test('should generate base64 string', () => {
      const nonce = generateNonce();
      assert.ok(/^[A-Za-z0-9+/=]+$/.test(nonce), 'Should be valid base64');
    });

    test('should generate 32 bytes (44 chars in base64)', () => {
      const nonce = generateNonce();
      assert.strictEqual(nonce.length, 44, 'Should be 44 characters (32 bytes base64)');
    });

    test('should generate unique values', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      assert.notStrictEqual(nonce1, nonce2, 'Should generate unique nonces');
    });
  });
});

