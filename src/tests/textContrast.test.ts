import {expect, it} from 'vitest';
import {ensureTextContrast, hexToRgb, relativeLuminance} from '@helpers/color';

it.each([
  ['#3390ec', '#ffffff'],
  ['#3390ec', '#f4f4f5'],
  ['#8774e1', '#212121'],
  ['#3685fa', '#1d2733'],
  ['#8c8e91', '#f4f4f5'],
  ['#df3f40', '#ffffff'],
  ['#ffffff', '#ffffff'],
  ['#000000', '#212121']
])('makes %s readable against %s', (foreground, background) => {
  const backgroundRgb = hexToRgb(background);
  const adjusted = ensureTextContrast(foreground, backgroundRgb);
  const a = relativeLuminance(hexToRgb(adjusted));
  const b = relativeLuminance(backgroundRgb);
  expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
});

it('retains colours that already have sufficient contrast', () => {
  expect(ensureTextContrast('#00488f', [255, 255, 255])).toBe('#00488f');
});
