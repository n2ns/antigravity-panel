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
      mockReader.set('1_dashboard.40_refreshRate', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.40_refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for zero value', () => {
      mockReader.set('1_dashboard.40_refreshRate', 0);
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.40_refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should enforce minimum for negative value', () => {
      mockReader.set('1_dashboard.40_refreshRate', -10);
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.40_refreshRate"], MIN_POLLING_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('1_dashboard.40_refreshRate', 60);
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.40_refreshRate"], 60);
    });

    test('should allow values above minimum', () => {
      mockReader.set('1_dashboard.40_refreshRate', 300);
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.40_refreshRate"], 300);
    });
  });

  suite('Cache Check Interval Validation', () => {
    test('should enforce minimum of 30 seconds for low values', () => {
      mockReader.set('3_system.40_scanInterval', 10);
      const config = configManager.getConfig();
      assert.strictEqual(config["3_system.40_scanInterval"], MIN_CACHE_CHECK_INTERVAL);
    });

    test('should allow values at minimum', () => {
      mockReader.set('3_system.40_scanInterval', 30);
      const config = configManager.getConfig();
      assert.strictEqual(config["3_system.40_scanInterval"], 30);
    });

    test('should allow values above minimum', () => {
      mockReader.set('3_system.40_scanInterval', 120);
      const config = configManager.getConfig();
      assert.strictEqual(config["3_system.40_scanInterval"], 120);
    });
  });

  suite('Default Config Values', () => {
    test('should use default for statusBarShowQuota', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["2_status.10_showQuota"], true);
    });

    test('should use default for statusBarStyle', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["2_status.30_displayFormat"], 'percentage');
    });

    test('should use default for visualizationMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.20_viewMode"], 'groups');
    });

    test('should use default for debugMode', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["3_system.99_debugMode"], false);
    });

    test('should use default for quotaDisplayStyle', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.10_gaugeStyle"], 'semi-arc');
    });

    test('should have valid threshold relationship', () => {
      const config = configManager.getConfig();
      assert.ok(config["2_status.50_criticalThreshold"] < config["2_status.40_warningThreshold"]);
    });
  });

  suite('Custom Config Values', () => {
    test('should read custom statusBarShowQuota', () => {
      mockReader.set('2_status.10_showQuota', false);
      const config = configManager.getConfig();
      assert.strictEqual(config["2_status.10_showQuota"], false);
    });

    test('should read custom statusBarStyle', () => {
      mockReader.set('2_status.30_displayFormat', 'resetTime');
      const config = configManager.getConfig();
      assert.strictEqual(config["2_status.30_displayFormat"], 'resetTime');
    });

    test('should read custom visualizationMode', () => {
      mockReader.set('1_dashboard.20_viewMode', 'models');
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.20_viewMode"], 'models');
    });

    test('should read custom debugMode', () => {
      mockReader.set('3_system.99_debugMode', true);
      const config = configManager.getConfig();
      assert.strictEqual(config["3_system.99_debugMode"], true);
    });

    test('should read custom quotaDisplayStyle', () => {
      mockReader.set('1_dashboard.10_gaugeStyle', 'classic-donut');
      const config = configManager.getConfig();
      assert.strictEqual(config["1_dashboard.10_gaugeStyle"], 'classic-donut');
    });

    test('should read custom thresholds', () => {
      mockReader.set('2_status.40_warningThreshold', 50);
      mockReader.set('2_status.50_criticalThreshold', 20);
      const config = configManager.getConfig();
      assert.strictEqual(config["2_status.40_warningThreshold"], 50);
      assert.strictEqual(config["2_status.50_criticalThreshold"], 20);
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

