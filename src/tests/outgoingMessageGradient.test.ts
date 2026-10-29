import {getAccentPresetsForBase} from '@config/themePresets';
import {ColorRgb, hexToRgb, relativeLuminance, rgbaToHexa} from '@helpers/color';
import {GRADIENT_PHASES} from '@helpers/freeformGradient';
import {getOutgoingMessageFreeformPixels, getOutgoingMessageGradient, getOutgoingMessageGradientColors, keepReadableOnOutgoingMessageGradient, makeOutgoingMessageGradient, MESSAGE_OUT_TINT, OutgoingMessageGradient} from '@helpers/outgoingMessageGradient';
import type {BaseTheme} from '@layer';

const contrast = (a: ColorRgb, b: ColorRgb) => {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};

// * what the browser paints at every height of `linear-gradient(<colours>)`: evenly spaced stops mixed in sRGB
const painted = (colors: ColorRgb[], samples = 400) => Array.from({length: samples + 1}, (_, index) => {
  const at = index / samples * (colors.length - 1);
  const from = Math.min(Math.floor(at), colors.length - 2), t = at - from;
  return colors[from].map((value, channel) => value + (colors[from + 1][channel] - value) * t) as ColorRgb;
});

// * the outgoing text of each base (primary-text-color) and the shipped accent presets of it, with the colours of the
// * cloud themes there were when this was written (several of them fail on their own colours)
const BASES: [BaseTheme['_'], string, number[][]][] = [
  ['baseThemeClassic', '#000000', [[0xe2f5dc, 0xecf2b6, 0xecf6bd, 0xddf6c2], [0xfff3d5, 0xfffddd]]],
  ['baseThemeDay', '#333333', [[0x3baadf, 0x9561df, 0xdf648a, 0xdf902f], [0xcc61a1, 0xe28850, 0xd7a23d, 0xde6d5f], [0x5bb3dc, 0x61c8b9, 0x59c4c8, 0x5f92d9]]],
  ['baseThemeNight', '#ffffff', [[0x4eadc3, 0x6b49c3, 0xe460b6, 0xe28135], [0x5baeb4, 0x498594, 0x4d84b1, 0x4b639f]]],
  ['baseThemeTinted', '#ffffff', [[0x4fadc3, 0x6b49c3, 0xe360b6, 0xe38234], [0x4b69aa, 0x5757b4, 0x3877aa, 0x309eb5]]]
];

// * a hair under 4.5:1: the moved colours are rounded to whole channel values
const READABLE = 4.45;

// * colours of a theme of no one's that mix the darkest and the lightest between them
const OPPOSITES = [[0x16fe1d, 0xea0024], [0x0000ff, 0xffff00], [0x00ffff, 0xff00ff], [0xff0000, 0x00ff00, 0x0000ff], [0xffffff, 0x000000]];

// * the worst a colour (of text) reads on the colours, and on a reaction's tint of it over them (a counter of that colour,
// * `--light-message-out-primary-color`), mixed in sRGB as the page paints it
const worstOn = (painted: ColorRgb[], color: ColorRgb, tint?: boolean) => painted.reduce((worst, under) => {
  const tinted = tint ? under.map((value, channel) => value + (color[channel] - value) * MESSAGE_OUT_TINT) as ColorRgb : under;
  return Math.min(worst, contrast(tinted, color));
}, Infinity);

describe('outgoing message gradient', () => {
  for(const [base, text, cloud] of BASES) {
    const textColor = hexToRgb(text);
    const themes = [...getAccentPresetsForBase(base).map((preset) => preset.message_colors), ...cloud, ...OPPOSITES];

    test(`the text is read at every height of it (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradientColors(colors, textColor);
        if(!gradient) continue;
        const worst = Math.min(...painted(gradient).map((color) => contrast(color, textColor)));
        expect(worst, colors.map((color) => color.toString(16)).join(',')).toBeGreaterThanOrEqual(READABLE);
      }
    });

    // * under white text the bubbles' own colours are white (themeController)
    test.skipIf(relativeLuminance(textColor) > .5)(`a colour of the bubbles' own is read at every height of it (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradientColors(colors, textColor);
        if(!gradient) continue;
        // the theme's own colour for it, about the middle of the gradient: the worst one to start from
        const middle = gradient[gradient.length >> 1];
        const accent = hexToRgb(keepReadableOnOutgoingMessageGradient(rgbaToHexa(middle), {colors: gradient}));
        const label = colors.map((color) => color.toString(16)).join(',');
        expect(worstOn(painted(gradient), accent), label).toBeGreaterThanOrEqual(READABLE);
        expect(worstOn(painted(gradient), accent, true), label).toBeGreaterThanOrEqual(READABLE);
      }
    });

    // * under white text the bubbles' own colour is the text's, and a reaction is a tint of it
    test.skipIf(relativeLuminance(textColor) <= .5)(`the text is read on a reaction's tint at every height (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradientColors(colors, textColor);
        if(!gradient) continue;
        expect(worstOn(painted(gradient), textColor, true), colors.map((color) => color.toString(16)).join(',')).toBeGreaterThanOrEqual(READABLE);
      }
    });
  }

  // * the colours of every pixel of the freeform gradient's pictures, at every phase, and of what the compositor paints
  // * on the way from each phase to the next (`advanceOutgoingMessageGradient`): the two crossfaded, mixed in sRGB
  const freeformPainted = (gradient: OutgoingMessageGradient) => {
    const pictures = Array.from({length: GRADIENT_PHASES}, (_, phase) => {
      const pixels = getOutgoingMessageFreeformPixels(gradient, phase);
      return Array.from({length: pixels.length / 4}, (_, index) => [pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]] as ColorRgb);
    });

    return pictures.flatMap((picture, phase) => {
      const next = pictures[(phase + GRADIENT_PHASES - 1) % GRADIENT_PHASES];
      return picture.flatMap((color, index) => [0, .1, .25, .4, .5, .6, .75, .9].map((t) => {
        return color.map((value, channel) => value + (next[index][channel] - value) * t) as ColorRgb;
      }));
    });
  };

  for(const [base, text, cloud] of BASES) {
    const textColor = hexToRgb(text);
    const themes = [...cloud, ...OPPOSITES].filter((colors) => colors.length >= 3);

    test(`the text is read all over the freeform gradient, at every phase and between them (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradient(colors, true, textColor);
        const worst = freeformPainted(gradient).reduce((min, color) => Math.min(min, contrast(color, textColor)), Infinity);
        expect(worst, colors.map((color) => color.toString(16)).join(',')).toBeGreaterThanOrEqual(READABLE);
      }
    });

    test.skipIf(relativeLuminance(textColor) > .5)(`a colour of the bubbles' own is read all over the freeform gradient (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradient(colors, true, textColor);
        const accent = hexToRgb(keepReadableOnOutgoingMessageGradient(rgbaToHexa(gradient.colors[0]), gradient));
        const label = colors.map((color) => color.toString(16)).join(',');
        const all = freeformPainted(gradient);
        expect(worstOn(all, accent), label).toBeGreaterThanOrEqual(READABLE);
        expect(worstOn(all, accent, true), label).toBeGreaterThanOrEqual(READABLE);
      }
    });

    test.skipIf(relativeLuminance(textColor) <= .5)(`the text is read on a reaction's tint all over the freeform gradient (${base})`, () => {
      for(const colors of themes) {
        const gradient = getOutgoingMessageGradient(colors, true, textColor);
        expect(worstOn(freeformPainted(gradient), textColor, true), colors.map((color) => color.toString(16)).join(',')).toBeGreaterThanOrEqual(READABLE);
      }
    });
  }

  test('only three colours or four that move are freeform', () => {
    const text = hexToRgb('#000000');
    expect(getOutgoingMessageGradient([0xe2f5dc, 0xecf2b6, 0xecf6bd], true, text).freeform).toBeDefined();
    expect(getOutgoingMessageGradient([0xe2f5dc, 0xecf2b6, 0xecf6bd], false, text).freeform).toBeUndefined();
    expect(getOutgoingMessageGradient([0xe2f5dc, 0xecf2b6], true, text).freeform).toBeUndefined();
    expect(getOutgoingMessageGradient([0xe2f5dc, 0xe2f5dc, 0xe2f5dc], true, text)).toBeUndefined();
  });

  test('one colour, or the same one twice, is no gradient', () => {
    const text = hexToRgb('#000000');
    expect(makeOutgoingMessageGradient(getOutgoingMessageGradientColors([0x5ca853], text))).toBe('none');
    expect(makeOutgoingMessageGradient(getOutgoingMessageGradientColors([0xe1ffc7, 0xe1ffc7], text))).toBe('none');
    expect(makeOutgoingMessageGradient(getOutgoingMessageGradientColors(undefined, text))).toBe('none');
  });

  test('the first colour is at the bottom', () => {
    const gradient = makeOutgoingMessageGradient(getOutgoingMessageGradientColors([0xe2f5dc, 0xfff3d5], hexToRgb('#000000')));
    expect(gradient.startsWith('linear-gradient(to top, #e2f5dc')).toBe(true);
    expect(gradient.endsWith('#fff3d5)')).toBe(true);
  });
});
