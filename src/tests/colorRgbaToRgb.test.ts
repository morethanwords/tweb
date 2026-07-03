import {rgbaToRgb, ColorRgb, ColorRgba} from '@helpers/color';

// Reference alpha-compositing of an RGBA color over an OPAQUE background:
//   out = a * fg + (1 - a) * bg
function reference(rgba: ColorRgba, bg: ColorRgb): ColorRgb {
  const a = rgba[3];
  return rgba.slice(0, 3).map((color, idx) =>
    Math.round(a * color + (1 - a) * bg[idx])
  ) as ColorRgb;
}

describe('rgbaToRgb', () => {
  test('fully opaque foreground returns the foreground unchanged', () => {
    expect(rgbaToRgb([10, 20, 30, 1], [200, 200, 200])).toEqual([10, 20, 30]);
  });

  test('fully transparent foreground returns the background unchanged', () => {
    expect(rgbaToRgb([10, 20, 30, 0], [200, 100, 50])).toEqual([200, 100, 50]);
  });

  test('half-transparent foreground is the midpoint of fg and bg', () => {
    // 0.5 * 0 + 0.5 * 100 = 50 on every channel
    expect(rgbaToRgb([0, 0, 0, 0.5], [100, 100, 100])).toEqual([50, 50, 50]);
  });

  test('matches the alpha-compositing reference at a non-0.5 alpha', () => {
    // white text at 0.64 opacity over a mid-grey header (the webApp.tsx usage)
    expect(rgbaToRgb([255, 255, 255, 0.64], [100, 100, 100]))
    .toEqual(reference([255, 255, 255, 0.64], [100, 100, 100]));
  });

  test('result stays within [0, 255] (no overflow from double-counting bg)', () => {
    const out = rgbaToRgb([255, 255, 255, 0.64], [255, 255, 255]);
    out.forEach((v) => expect(v).toBeLessThanOrEqual(255));
    expect(out).toEqual([255, 255, 255]);
  });
});
