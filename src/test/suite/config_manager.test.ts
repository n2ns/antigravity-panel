/**
 * ConfigManager Test Suite
 *
 * Tests ConfigManager with mock IConfigReader
 * No VS Code dependency - pure unit tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

  suite('Auto Clean Keep Count Validation', () => {
    test('should floor fractional values', () => {
      mockReader.set('cache.autoCleanKeepCount', 2.5);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.autoCleanKeepCount"], 2);
    });

    test('should clamp values below 1', () => {
      mockReader.set('cache.autoCleanKeepCount', -1);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.autoCleanKeepCount"], 1);
    });

    test('should clamp values above 50', () => {
      mockReader.set('cache.autoCleanKeepCount', 100);
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.autoCleanKeepCount"], 50);
    });

    test('should use default value of 5 when missing', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.autoCleanKeepCount"], 5);
    });

    test('should fall back to 5 for non-numeric values', () => {
      mockReader.set('cache.autoCleanKeepCount', 'abc');
      const config = configManager.getConfig();
      assert.strictEqual(config["cache.autoCleanKeepCount"], 5);
    });
  });

  suite('Default Config Values', () => {
    test('manifest and runtime should both hide Prompt/Flow credits by default', () => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      const dashboardSection = manifest.contributes.configuration.find(
        (section: { properties?: Record<string, { default?: unknown }> }) =>
          section.properties?.['tfa.dashboard.showCreditsCard']
      );
      const manifestDefault = dashboardSection?.properties['tfa.dashboard.showCreditsCard'].default;
      assert.strictEqual(manifestDefault, false);
      assert.strictEqual(configManager.getConfig()["dashboard.showCreditsCard"], false);
    });

    test('manifest and runtime should align quota insight defaults', () => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      const properties = Object.assign(
        {},
        ...manifest.contributes.configuration.map(
          (section: { properties?: Record<string, { default?: unknown }> }) => section.properties ?? {}
        )
      );

      assert.strictEqual(properties['tfa.dashboard.showWeeklyCard'].default, true);
      assert.strictEqual(properties['tfa.system.notifyOnQuotaReset'].default, true);
      assert.strictEqual(properties['tfa.system.notifyOnAbnormalDrain'].default, true);

      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.showWeeklyCard"], true);
      assert.strictEqual(config["system.notifyOnQuotaReset"], true);
      assert.strictEqual(config["system.notifyOnAbnormalDrain"], true);
    });

    test('context warning threshold should match the manifest and stay within 50..99', () => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      const properties = Object.assign(
        {},
        ...manifest.contributes.configuration.map(
          (section: { properties?: Record<string, unknown> }) => section.properties ?? {}
        )
      );
      assert.deepStrictEqual(
        (({ default: d, minimum, maximum }) => ({ d, minimum, maximum }))(properties['tfa.context.warningThreshold']),
        { d: 80, minimum: 50, maximum: 99 }
      );

      assert.strictEqual(configManager.getConfig()["context.warningThreshold"], 80);
      for (const [value, expected] of [[10, 50], [100, 99], [75, 75], ['x', 80]] as const) {
        mockReader.set('context.warningThreshold', value);
        assert.strictEqual(configManager.getConfig()["context.warningThreshold"], expected, `value ${value}`);
      }
    });

    test('auto-accept settings should be application-scoped and keep terminal accepts off by default', () => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      const section = manifest.contributes.configuration.find(
        (entry: { properties?: Record<string, unknown> }) => entry.properties?.['tfa.system.autoAccept']
      );
      const properties = section.properties as Record<string, { type?: string; default?: unknown; scope?: string; order?: number }>;
      const keys = Object.keys(properties);

      assert.strictEqual(properties['tfa.system.autoAccept'].scope, 'application');
      assert.strictEqual(properties['tfa.system.autoAcceptTerminal'].type, 'boolean');
      assert.strictEqual(properties['tfa.system.autoAcceptTerminal'].default, false);
      assert.strictEqual(properties['tfa.system.autoAcceptTerminal'].scope, 'application');
      assert.strictEqual(
        keys.indexOf('tfa.system.autoAcceptTerminal'),
        keys.indexOf('tfa.system.autoAcceptInterval') + 1,
        'The terminal opt-in should follow the auto-accept settings'
      );
      assert.ok(properties['tfa.system.autoAcceptTerminal'].order! > properties['tfa.system.autoAcceptInterval'].order!);

      assert.strictEqual(configManager.getConfig()["system.autoAcceptTerminal"], false);
      mockReader.set('system.autoAcceptTerminal', true);
      assert.strictEqual(configManager.getConfig()["system.autoAcceptTerminal"], true);
    });

    test('should use default for statusBarShowQuota', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config["status.showQuota"], true);
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

  suite('Numeric Range Validation', () => {
    test('should default refreshRate to the manifest default of 90', () => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      const properties = Object.assign(
        {},
        ...manifest.contributes.configuration.map(
          (section: { properties?: Record<string, { default?: unknown }> }) => section.properties ?? {}
        )
      );
      assert.strictEqual(properties['tfa.dashboard.refreshRate'].default, 90);
      assert.strictEqual(configManager.getConfig()["dashboard.refreshRate"], 90);
    });

    test('should clamp criticalThreshold above 50', () => {
      mockReader.set('status.warningThreshold', 100);
      mockReader.set('status.criticalThreshold', 60);
      assert.strictEqual(configManager.getConfig()["status.criticalThreshold"], 50);
    });

    test('should cap criticalThreshold at warningThreshold', () => {
      mockReader.set('status.warningThreshold', 40);
      mockReader.set('status.criticalThreshold', 50);
      const config = configManager.getConfig();
      assert.strictEqual(config["status.warningThreshold"], 40);
      assert.strictEqual(config["status.criticalThreshold"], 40);
    });

    test('should clamp warningThreshold to [5, 100]', () => {
      mockReader.set('status.warningThreshold', 200);
      assert.strictEqual(configManager.getConfig()["status.warningThreshold"], 100);
      mockReader.set('status.warningThreshold', 1);
      assert.strictEqual(configManager.getConfig()["status.warningThreshold"], 5);
    });

    test('should clamp scanInterval above 600', () => {
      mockReader.set('cache.scanInterval', 99999);
      assert.strictEqual(configManager.getConfig()["cache.scanInterval"], 600);
    });

    test('should clamp autoAcceptInterval above 5000', () => {
      mockReader.set('system.autoAcceptInterval', 99999);
      assert.strictEqual(configManager.getConfig()["system.autoAcceptInterval"], 5000);
    });

    test('should clamp historyRange to [10, 120]', () => {
      mockReader.set('dashboard.historyRange', -5);
      assert.strictEqual(configManager.getConfig()["dashboard.historyRange"], 10);
      mockReader.set('dashboard.historyRange', 500);
      assert.strictEqual(configManager.getConfig()["dashboard.historyRange"], 120);
    });

    test('should clamp warningSize below 100', () => {
      mockReader.set('cache.warningSize', 50);
      assert.strictEqual(configManager.getConfig()["cache.warningSize"], 100);
    });

    test('should fall back to defaults for non-numeric or NaN values', () => {
      mockReader.set('dashboard.historyRange', 'abc');
      mockReader.set('status.criticalThreshold', NaN);
      mockReader.set('dashboard.refreshRate', NaN);
      const config = configManager.getConfig();
      assert.strictEqual(config["dashboard.historyRange"], 90);
      assert.strictEqual(config["status.criticalThreshold"], 20);
      assert.strictEqual(config["dashboard.refreshRate"], 90);
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
