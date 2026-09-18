/**
 * The weather pill a story can carry (`mediaAreaWeather`): the temperature text every client
 * agrees on — whole degrees, °C straight off the wire, °F converted.
 *
 * The soundtrack panel's naming lives in audioTitles.test.ts, with the helper the rest of the app
 * shares.
 */

import formatTemperature from '@helpers/temperature';

describe('story weather pill', () => {
  test('celsius is the wire value, rounded to whole degrees', () => {
    expect(formatTemperature(24, 'celsius')).toBe('24°C');
    expect(formatTemperature(23.6, 'celsius')).toBe('24°C');
    expect(formatTemperature(-7.4, 'celsius')).toBe('-7°C');
    expect(formatTemperature(0, 'celsius')).toBe('0°C');
  });

  test('fahrenheit is converted, not re-read', () => {
    expect(formatTemperature(24, 'fahrenheit')).toBe('75°F');
    expect(formatTemperature(0, 'fahrenheit')).toBe('32°F');
    expect(formatTemperature(-40, 'fahrenheit')).toBe('-40°F');
    expect(formatTemperature(-7.4, 'fahrenheit')).toBe('19°F');
  });

  test('a value off the wire cannot stretch the pill to any width it likes', () => {
    expect(formatTemperature(1e30, 'celsius')).toBe('1000000°C');
    expect(formatTemperature(-1e30, 'celsius')).toBe('-274°C');
    expect(formatTemperature(undefined, 'celsius')).toBe('0°C');
  });
});
