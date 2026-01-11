/**
 * ConfigManager Test Suite
 *
 * Tests ConfigManager with mock IConfigReader
 * No VS Code dependency - pure unit tests
 */

import * as assert from 'assert';
import { ConfigManager, IConfigReader, MIN_POLLING_INTERVAL, MIN_CACHE_CHECK_INTERVAL } from '../../shared/config/config_manager';

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
      mockReader.set('dashboard.refreshRate', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for zero value', () => {
      mockReader.set('dashboard.refreshRate', 0);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for negative value', () => {
      mockReader.set('dashboard.refreshRate', -10);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('dashboard.refreshRate', 60);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.refreshRate"], 60);
    });

    test('should allow values above minimum', () => {
      mockReader.set('dashboard.refreshRate', 300);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.refreshRate"], 300);
    });
  });

  suite('Cache Check Interval Validation', () => {
    test('should enforce minimum of 30 seconds for low values', () => {
      mockReader.set('cache.scanInterval', 10);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.scanInterval"], MIN_CACHE_CHECK_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('cache.scanInterval', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.scanInterval"], 30);
    });

    test('should allow values above minimum', () => {
      mockReader.set('cache.scanInterval', 120);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.scanInterval"], 120);
    });
  });

  suite('Default Config Values', () => {
    test('should use default for statusBarShowQuota', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["status.showQuota"], true);
    });

    test('should use default for statusBarStyle', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["status.displayFormat"], 'percentage');
    });

    test('should use default for visualizationMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.viewMode"], 'groups');
    });

    test('should use default for debugMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["system.debugMode"], false);
    });

    test('should use default for quotaDisplayStyle', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.gaugeStyle"], 'semi-arc');
    });

    test('should have valid threshold relationship', () => {
      const config = configManager.getConfig();
      assert.ok(config["status.criticalThreshold"] < config["status.warningThreshold"]);
    });
  });

  suite('Custom Config Values', () => {
    test('should read custom statusBarShowQuota', () => {
      mockReader.set('status.showQuota', false);
      const config = configManager.getConfig();
      assert.strictEqual(config["status.showQuota"], false);
    });

    test('should read custom statusBarStyle', () => {
      mockReader.set('status.displayFormat', 'resetTime');
      const config = configManager.getConfig();
      assert.strictEqual(config["status.displayFormat"], 'resetTime');
    });

    test('should read custom visualizationMode', () => {
      mockReader.set('dashboard.viewMode', 'models');
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.viewMode"], 'models');
    });

    test('should read custom debugMode', () => {
      mockReader.set('system.debugMode', true);
      const config = configManager.getConfig();
      assert.strictEqual(config["system.debugMode"], true);
    });

    test('should read custom quotaDisplayStyle', () => {
      mockReader.set('dashboard.gaugeStyle', 'classic-donut');
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.gaugeStyle"], 'classic-donut');
    });

    test('should read custom thresholds', () => {
      mockReader.set('status.warningThreshold', 50);
      mockReader.set('status.criticalThreshold', 20);
      const config = configManager.getConfig();
      assert.strictEqual(config["status.warningThreshold"], 50);
      assert.strictEqual(config["status.criticalThreshold"], 20);
    });
  });

  suite('UI Scale Validation', () => {
    test('should use default value of 1.0', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.uiScale"], 1.0);
    });

    test('should allow valid scale in range', () => {
      mockReader.set('dashboard.uiScale', 1.5);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.uiScale"], 1.5);
    });

    test('should clamp values below 0.8', () => {
      mockReader.set('dashboard.uiScale', 0.5);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.uiScale"], 0.8);
    });

    test('should clamp values above 2.0', () => {
      mockReader.set('dashboard.uiScale', 2.5);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.uiScale"], 2.0);
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

