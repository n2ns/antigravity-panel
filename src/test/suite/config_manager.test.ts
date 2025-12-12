/**
 * ConfigManager Test Suite
 *
 * Tests ConfigManager with mock IConfigReader
 * No VS Code dependency - pure unit tests
 */

import * as assert from 'assert';
import { ConfigManager, IConfigReader, MIN_POLLING_INTERVAL, MIN_CACHE_CHECK_INTERVAL } from '../../core/config_manager';

/**
 * Mock config reader for testing
 */
class MockConfigReader implements IConfigReader {
  private values: Map<string, unknown> = new Map();

  set<T>(key: string, value: T): void {
    this.values.set(key, value);
  }

  get<T>(key: string, defaultValue: T): T {
    if (this.values.has(key)) {
      return this.values.get(key) as T;
    }
    return defaultValue;
  }
}

suite('ConfigManager Test Suite', () => {
  let mockReader: MockConfigReader;
  let configManager: ConfigManager;

  setup(() => {
    mockReader = new MockConfigReader();
    configManager = new ConfigManager(mockReader);
  });

  suite('Polling Interval Validation', () => {
    test('should enforce minimum of 60 seconds for low values', () => {
      mockReader.set('pollingInterval', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config.pollingInterval, MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for zero value', () => {
      mockReader.set('pollingInterval', 0);
      const config = configManager.getConfig();
      assert.strictEqual(config.pollingInterval, MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for negative value', () => {
      mockReader.set('pollingInterval', -10);
      const config = configManager.getConfig();
      assert.strictEqual(config.pollingInterval, MIN_POLLING_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('pollingInterval', 60);
      const config = configManager.getConfig();
      assert.strictEqual(config.pollingInterval, 60);
    });

    test('should allow values above minimum', () => {
      mockReader.set('pollingInterval', 300);
      const config = configManager.getConfig();
      assert.strictEqual(config.pollingInterval, 300);
    });
  });

  suite('Cache Check Interval Validation', () => {
    test('should enforce minimum of 30 seconds for low values', () => {
      mockReader.set('cacheCheckInterval', 10);
      const config = configManager.getConfig();
      assert.strictEqual(config.cacheCheckInterval, MIN_CACHE_CHECK_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('cacheCheckInterval', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config.cacheCheckInterval, 30);
    });

    test('should allow values above minimum', () => {
      mockReader.set('cacheCheckInterval', 120);
      const config = configManager.getConfig();
      assert.strictEqual(config.cacheCheckInterval, 120);
    });
  });

  suite('Default Config Values', () => {
    test('should use default for statusBarShowQuota', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config.statusBarShowQuota, true);
    });

    test('should use default for statusBarStyle', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config.statusBarStyle, 'percentage');
    });

    test('should use default for visualizationMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config.visualizationMode, 'groups');
    });

    test('should use default for debugMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config.debugMode, false);
    });

    test('should have valid threshold relationship', () => {
      const config = configManager.getConfig();
      assert.ok(config.statusBarThresholdCritical < config.statusBarThresholdWarning);
    });
  });

  suite('Custom Config Values', () => {
    test('should read custom statusBarShowQuota', () => {
      mockReader.set('statusBarShowQuota', false);
      const config = configManager.getConfig();
      assert.strictEqual(config.statusBarShowQuota, false);
    });

    test('should read custom statusBarStyle', () => {
      mockReader.set('statusBarStyle', 'resetTime');
      const config = configManager.getConfig();
      assert.strictEqual(config.statusBarStyle, 'resetTime');
    });

    test('should read custom visualizationMode', () => {
      mockReader.set('visualizationMode', 'models');
      const config = configManager.getConfig();
      assert.strictEqual(config.visualizationMode, 'models');
    });

    test('should read custom debugMode', () => {
      mockReader.set('debugMode', true);
      const config = configManager.getConfig();
      assert.strictEqual(config.debugMode, true);
    });

    test('should read custom thresholds', () => {
      mockReader.set('statusBarThresholdWarning', 50);
      mockReader.set('statusBarThresholdCritical', 20);
      const config = configManager.getConfig();
      assert.strictEqual(config.statusBarThresholdWarning, 50);
      assert.strictEqual(config.statusBarThresholdCritical, 20);
    });
  });

  suite('get() method', () => {
    test('should return value from reader', () => {
      mockReader.set('testKey', 'testValue');
      assert.strictEqual(configManager.get('testKey', 'default'), 'testValue');
    });

    test('should return default when key not set', () => {
      assert.strictEqual(configManager.get('unknownKey', 'fallback'), 'fallback');
    });
  });
});

