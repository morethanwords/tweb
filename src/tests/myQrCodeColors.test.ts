import {describe, expect, it} from 'vitest';
import {getContrastRatio, getRgbColorFromTelegramColor, hexToRgb} from '@helpers/color';
import {backdropColors, contrastMatchedInk, deepenEdge, mixOklab, TUNED_BACKDROP_NAME} from '@components/popups/myQrCode/colors';
import {backdropGradient, backdropToCss, gradientStops} from '@components/popups/myQrCode/backdrop';
import {surfaceGeometry} from '@components/popups/myQrCode/layout';

const WHITE = [255, 255, 255] as [number, number, number];

// [name, center, edge, pattern] of the palette's lightest, darkest and most saturated backdrops (Android's table)
const BACKDROPS: [string, number, number, number][] = [
  ['Platinum', 0xB2AEA7, 0x88847E, 0x3D382D],
  ['Ivory White', 0xBAB6B1, 0xA19D97, 0x665F52],
  ['Roman Silver', 0xA3A8B5, 0x7C808A, 0x3F4550],
  ['Black', 0x363738, 0x0E0F0F, 0x000000],
  ['Onyx Black', 0x464A4D, 0x282C2E, 0x000000],
  ['Mystic Pearl', 0xD08B6D, 0xB05770, 0x9B0526],
  ['Cappuccino', 0xB1907E, 0x7C6356, 0xEBD4C8],
  ['Pure Gold', 0xCCAB41, 0x987B32, 0x703C00],
  ['Mint Green', 0x7ECB82, 0x459E5A, 0x026B22],
  ['Sky Blue', 0x58B4C8, 0x448BAB, 0x025074],
  ['Neon Blue', 0x7596F9, 0x6862E4, 0x2828BC],
  ['Electric Purple', 0xC260E6, 0x914ED9, 0x4A018A],
  ['Mexican Pink', 0xE28AB6, 0xA4588B, 0x8E054E]
];

describe('myQrCode colors', () => {
  it('keeps every ink at 4.5:1 or better on the white card', () => {
    for(const [name, center, edge, pattern] of BACKDROPS) {
      const colors = backdropColors({name, center_color: center, edge_color: edge, pattern_color: pattern});
      expect(getContrastRatio(hexToRgb(colors.ink), WHITE), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the ink of any backdrop scannable', () => {
    let seed = 12345;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    for(let i = 0; i < 500; ++i) {
      const center = Math.floor(next() * 0x1000000), edge = Math.floor(next() * 0x1000000);
      const ink = backdropColors({center_color: center, edge_color: edge, pattern_color: 0}).ink;
      expect(getContrastRatio(hexToRgb(ink), WHITE), center.toString(16) + '/' + edge.toString(16)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws the tuned backdrop top to bottom, with its own colours', () => {
    const tuned = backdropColors({name: TUNED_BACKDROP_NAME, center_color: 0, edge_color: 0, pattern_color: 0});
    expect(tuned.vertical).toBe(true);
    expect(tuned.center).toBe('#3fb1ff');
    expect(tuned.edge).toBe('#166ace');
    expect(getContrastRatio(hexToRgb(tuned.ink), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(backdropColors({name: 'Black', center_color: 0x363738, edge_color: 0x0E0F0F, pattern_color: 0}).vertical).toBe(false);
  });

  it('keeps the centre as served and deepens only the edge', () => {
    const colors = backdropColors({center_color: 0x7ECB82, edge_color: 0x459E5A, pattern_color: 0});
    expect(colors.center).toBe('#7ecb82');
    expect(colors.edge).not.toBe('#459e5a');
    const [r, g, b] = hexToRgb(colors.edge), [R, G, B] = getRgbColorFromTelegramColor(0x459E5A);
    expect(r + g + b).toBeLessThan(R + G + B);
    expect(deepenEdge(0x000000)).toBe(0);
  });

  it('mixes in OKLab', () => {
    expect(mixOklab(0xFF0000, 0xFF0000, 0.5)).toBe(0xFF0000);
    expect(mixOklab(0x000000, 0xFFFFFF, 0)).toBe(0);
    expect(mixOklab(0x000000, 0xFFFFFF, 1)).toBe(0xFFFFFF);
    expect(contrastMatchedInk(0xFFFFFF, 0xFFFFFF)).toBeLessThan(0x808080);
  });

  it('puts dark controls on a light backdrop and white ones on a dark one', () => {
    const light = backdropColors({center_color: 0xF5F4F2, edge_color: 0xF0EFEC, pattern_color: 0});
    const dark = backdropColors({center_color: 0x363738, edge_color: 0x0E0F0F, pattern_color: 0});
    expect(light.foreground).not.toBe('#ffffff');
    expect(dark.foreground).toBe('#ffffff');
  });

  it('describes one gradient for the screen and the picture', () => {
    const colors = backdropColors({center_color: 0x7ECB82, edge_color: 0x459E5A, pattern_color: 0});
    const surface = surfaceGeometry(376, 560);
    const stops = gradientStops(colors);
    expect(stops.map((stop) => stop.offset)).toEqual([0, 0.55, 1]);
    const gradient = backdropGradient(colors, surface);
    expect(gradient.kind).toBe('radial');
    // centred on the card
    expect(gradient).toMatchObject({cx: 188, cy: surface.cardCenterY});
    expect(backdropToCss(gradient)).toMatch(/^radial-gradient\(circle [\d.]+px at 188\.0px [\d.]+px, #7ecb82 0%, #[0-9a-f]{6} 55%, #[0-9a-f]{6} 100%\)$/);

    const tuned = backdropGradient({...backdropColors({name: TUNED_BACKDROP_NAME, center_color: 0, edge_color: 0, pattern_color: 0})}, surface);
    expect(tuned.kind).toBe('linear');
    expect(backdropToCss(tuned)).toMatch(/^linear-gradient\(162\.00deg, #3fb1ff 0%, #[0-9a-f]{6} 50%, #166ace 100%\)$/);
  });

  it('places the card as Android does', () => {
    const surface = surfaceGeometry(376, 560);
    expect(surface.card.width).toBe(280);
    expect(surface.card.height).toBeCloseTo(299.6);
    expect(surface.cardTop).toBeCloseTo(560 * 0.468 - 299.6 / 2 - 15 + 16);
    expect(surfaceGeometry(376, 560, {captioned: false}).card.height).toBe(280);
    expect(surfaceGeometry(376, 560, {pill: true}).cardTop).toBeCloseTo(surface.cardTop - 16);
  });
});
