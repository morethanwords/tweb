import {ColorRgb, darkenToMaxLuminance, getContrastRatio, rgbIntToHex} from '@helpers/color';
import clamp from '@helpers/number/clamp';

/**
 * Colours of a share theme's backdrop, as the Android client derives them (`QrShareView`: `deepen`,
 * `contrastMatchedQr`, `buildShaders`). Pure, so a test needs no DOM. Colours are 0xRRGGBB integers, as the server
 * sends them; the result is hex strings.
 */

/** The contrast of the code's ink on the white card. Android solves 4.4:1; 4.55 keeps the rounded 8-bit ink above 4.5:1. */
export const QR_INK_CONTRAST = 4.55;
/** A ceiling on the relative luminance of an ink that is not solved (the tuned one): about 4.5:1 on white. */
const QR_INK_MAX_LUMINANCE = 0.18;

/** The backdrop drawn with the screen's own tuned colours instead of the served ones (`Backdrops.TUNED_NAME`). */
export const TUNED_BACKDROP_NAME = 'Neon Blue';
const TUNED_CENTER = 0x3FB1FF;
const TUNED_EDGE = 0x166ACE;
const TUNED_INK = '#0075f1';

/** The backdrop of a theme without one (`Backdrops.DEFAULT_NAME`), for when the served list has not come yet. */
export const DEFAULT_BACKDROP_NAME = 'Black';
export const DEFAULT_BACKDROP = {
  center_color: 0x363738,
  edge_color: 0x0E0F0F,
  pattern_color: 0x000000,
  text_color: 0x8C8F91
};

/** The foreground of controls on a light backdrop (`glassIconColor`). */
const DARK_FOREGROUND = '#1a1d21';
const WHITE: ColorRgb = [255, 255, 255];
/** White glyphs need this much against the backdrop's middle, or the dark ones take over. */
const MIN_GLYPH_CONTRAST = 3;

/** Where the middle stop of a radial backdrop sits (`putBackdropScene`) */
export const BACKDROP_MID_OFFSET = 0.55;
/** … and of the vertical one */
export const BACKDROP_VERTICAL_MID_OFFSET = 0.5;

export type BackdropInput = {
  center_color: number,
  edge_color: number,
  pattern_color: number,
  text_color?: number,
  name?: string
};

export type BackdropColors = {
  /** The gradient's stops, in hex */
  center: string,
  edge: string,
  pattern: string,
  /** The middle stop: the OKLab mean of the two */
  mid: string,
  /** The ink of the QR code, its logo disc and the username on the white card */
  ink: string,
  /** The card's shadow: the ink darkened, 6% */
  shadow: string,
  /** The colour of glyphs and text over the backdrop */
  foreground: string,
  /** A button over the backdrop */
  control: string,
  /** The tuned backdrop runs top to bottom, the others radiate from the card */
  vertical: boolean
};

/* sRGB, OKLab, CIELAB */

const lin = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const gam = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const clamp01 = (v: number) => clamp(v, 0, 1);

export function intToRgb(c: number): ColorRgb {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function rgbToInt(rgb: ColorRgb) {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function hexToRgbTriplet(hex: string): ColorRgb {
  return intToRgb(parseInt(hex.slice(1, 7), 16));
}

export function toOkLab(c: number): [number, number, number] {
  const [R, G, B] = intToRgb(c);
  const r = lin(R / 255), g = lin(G / 255), b = lin(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

/** OKLab to linear sRGB, not clamped */
function okLabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
}

function linearToInt(rgb: number[]) {
  return rgbToInt(rgb.map((v) => Math.round(clamp01(gam(clamp01(v))) * 255)) as ColorRgb);
}

/** `QrCodeLayer.mixOklab`: a straight mix in OKLab */
export function mixOklab(from: number, to: number, t: number) {
  const a = toOkLab(from), b = toOkLab(to);
  return linearToInt(okLabToLinear(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
}

const D65 = [0.95047, 1, 1.08883];
const labF = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
const labFInverse = (t: number) => t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);

function toLab(c: number): [number, number, number] {
  const [R, G, B] = intToRgb(c);
  const r = lin(R / 255), g = lin(G / 255), b = lin(B / 255);
  const x = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65[0]);
  const y = labF(0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
  const z = labF((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / D65[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function fromLab(L: number, a: number, b: number) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = labFInverse(fx) * D65[0], y = labFInverse(fy), z = labFInverse(fz) * D65[2];
  return linearToInt([
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ]);
}

/** `deepen`: the centre stays as in Telegram; the edge goes a hair deeper (L - 3, chroma + 3%) on a full-size radial. */
export function deepenEdge(c: number) {
  const [L, a, b] = toLab(c);
  return fromLab(Math.max(0, L - 3), a * 1.03, b * 1.03);
}

/* The ink */

function inGamut(rgb: number[]) {
  const e = 1e-4;
  return rgb.every((v) => v >= -e && v <= 1 + e);
}

/** The linear sRGB of the largest chroma <= c inside the gamut at (L, h) */
function fitChroma(L: number, c: number, h: number) {
  const ca = Math.cos(h), sa = Math.sin(h);
  let rgb = okLabToLinear(L, c * ca, c * sa);
  if(inGamut(rgb)) return rgb;
  let lo = 0, hi = c;
  for(let k = 0; k < 14; ++k) {
    const mid = (lo + hi) / 2;
    rgb = okLabToLinear(L, mid * ca, mid * sa);
    if(inGamut(rgb)) lo = mid;
    else hi = mid;
  }

  return okLabToLinear(L, lo * ca, lo * sa);
}

function contrastOnWhite(rgb: number[]) {
  const y = 0.2126 * clamp01(rgb[0]) + 0.7152 * clamp01(rgb[1]) + 0.0722 * clamp01(rgb[2]);
  return 1.05 / (y + 0.05);
}

/**
 * `contrastMatchedQr`: the ink for a backdrop is the edge's OKLCH hue (the centre/edge mix for a near-neutral edge),
 * chroma edge * 1.25 + 0.02 (at most 0.20, cut to fit sRGB at each lightness), with the lightness solved for
 * {@link QR_INK_CONTRAST} on white. A dark backdrop keeps it darker than its edge, which only raises the contrast.
 */
export function contrastMatchedInk(center: number, edge: number): number {
  const e = toOkLab(edge), m = toOkLab(center);
  const lCap = e[0] < 0.45 ? e[0] - 0.03 : 2;
  const edgeC = Math.hypot(e[1], e[2]);
  let h: number, c: number;
  if(edgeC < 0.03) {
    const a = m[1] * 0.4 + e[1] * 0.6, b = m[2] * 0.4 + e[2] * 0.6;
    h = Math.atan2(b, a);
    c = Math.min(0.012, Math.hypot(a, b));
  } else {
    h = Math.atan2(e[2], e[1]);
    c = Math.min(edgeC * 1.25 + 0.02, 0.20);
  }

  let lo = 0.2, hi = 0.9;
  for(let k = 0; k < 12; ++k) {
    const mid = (lo + hi) / 2;
    if(contrastOnWhite(fitChroma(mid, c, h)) > QR_INK_CONTRAST) lo = mid;
    else hi = mid;
  }

  let L = (lo + hi) / 2;
  if(L > lCap) L = Math.max(0.05, lCap);
  return linearToInt(fitChroma(L, c, h));
}

/* The result */

export function backdropColors(backdrop: BackdropInput): BackdropColors {
  const tuned = backdrop.name === TUNED_BACKDROP_NAME;
  const center = tuned ? TUNED_CENTER : backdrop.center_color;
  const edge = tuned ? TUNED_EDGE : deepenEdge(backdrop.edge_color);
  const mid = mixOklab(center, edge, 0.5);
  // the tuned ink is Android's own, darkened just enough to clear the same contrast as the solved ones
  const ink = tuned ? darkenToMaxLuminance(TUNED_INK, QR_INK_MAX_LUMINANCE) : rgbIntToHex(contrastMatchedInk(center, edge));
  const inkRgb = hexToRgbTriplet(ink);

  // white glyphs, unless they are lost over the backdrop's middle and the dark ones do better
  const midRgb = intToRgb(mid);
  const white = getContrastRatio(WHITE, midRgb);
  const dark = getContrastRatio(hexToRgbTriplet(DARK_FOREGROUND), midRgb);
  const light = white < MIN_GLYPH_CONTRAST && dark > white;

  return {
    center: rgbIntToHex(center),
    edge: rgbIntToHex(edge),
    pattern: rgbIntToHex(backdrop.pattern_color),
    mid: rgbIntToHex(mid),
    ink,
    shadow: `rgba(${inkRgb.map((v) => Math.round(v * 0.6)).join(', ')}, ${+(0x10 / 255).toFixed(3)})`,
    foreground: light ? DARK_FOREGROUND : '#ffffff',
    // white glass vanishes on a light backdrop: a slightly dark one instead (Android: 0x12000000)
    control: light ? 'rgba(0, 0, 0, .07)' : 'rgba(255, 255, 255, .16)',
    vertical: tuned
  };
}
