import * as assert from 'assert';
import { getArcPath, getArcLength } from '../../shared/utils/gauge_math';

suite('Gauge Math Test Suite', () => {
    test('getArcLength should calculate correct length for 210 degrees swept at 36 radius', () => {
        const length = getArcLength(36, 210);
        assert.strictEqual(length.toFixed(2), '131.95');
    });

    test('getArcPath should produce correct string for semi-arc parameters', () => {
        const path = getArcPath({
            centerX: 50,
            centerY: 40,
            radius: 36,
            startAngle: 195,
            endAngle: -15
        });

        // Manual check:
        // startX = 50 + 36 * cos(195) = 50 + 36 * (-0.9659) = 50 - 34.77 = 15.23
        // startY = 40 - 36 * sin(195) = 40 - 36 * (-0.2588) = 40 + 9.32 = 49.32
        // endX = 50 + 36 * cos(-15) = 50 + 36 * 0.9659 = 50 + 34.77 = 84.77
        // endY = 40 - 36 * sin(-15) = 40 - 36 * (-0.2588) = 40 + 9.32 = 49.32

        assert.ok(path.startsWith('M 15.23 49.32'));
        assert.ok(path.includes('A 36 36 0 1 1 84.77 49.32'));
    });

    test('getArcPath should set largeArcFlag correctly', () => {
        const pathSmall = getArcPath({ centerX: 0, centerY: 0, radius: 10, startAngle: 0, endAngle: 90 });
        assert.strictEqual(pathSmall.split(' A ')[1].split(' ')[3], '0', 'Large arc flag should be 0 for 90 degrees');

        const pathLarge = getArcPath({ centerX: 0, centerY: 0, radius: 10, startAngle: 0, endAngle: 270 });
        assert.strictEqual(pathLarge.split(' A ')[1].split(' ')[3], '1', 'Large arc flag should be 1 for 270 degrees');
    });
});
