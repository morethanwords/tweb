/*
 * Accent-color presets ported from Telegram iOS' ThemeColorPresets.swift.
 * See submodules/SettingsUI/Sources/Themes/ThemeColorPresets.swift in TelegramMessenger/Telegram-iOS
 * for the upstream definitions; the index numbers are kept identical so a preset can be
 * recognised across platforms.
 *
 * Each preset is a (accent, bubble gradient, optional pattern wallpaper) bundle. Tapping a preset
 * applies it to the *currently active* AppTheme via themeController.applyAccentPreset — the four
 * built-in default AppThemes (`day` / `night` / `light` / `tinted`) keep their factory look as a
 * separate "no preset" choice.
 */

import type {BaseTheme, ThemeSettings, WallPaper} from '@layer';
import {hsvToRgb, rgbToHsv} from '@helpers/color';

export type AccentPresetWallpaper = {
  intensity: number,            // 1..100; sign is derived from `dark`
  background_color: number,
  second_background_color?: number,
  third_background_color?: number,
  fourth_background_color?: number,
  dark?: boolean
};

export type AccentPreset = {
  id: number,                   // matches iOS PresentationThemeAccentColor.index
  accent_color: number,
  message_colors: number[],     // 1-2 colors (gradient stops for outgoing bubble fill)
  wallpaper?: AccentPresetWallpaper
};

// dayClassic — tweb's `day` AppTheme. iOS dayClassicColorPresets, indices 101..107.
const dayClassicAccentPresets: AccentPreset[] = [
  {id: 106, accent_color: 0xf55783, message_colors: [0xd6f5ff, 0xc9fdfe], wallpaper: {intensity: 50, background_color: 0x8dc0eb, second_background_color: 0xb9d1ea, third_background_color: 0xc6b1ef, fourth_background_color: 0xebd7ef}},
  {id: 102, accent_color: 0xff5fa9, message_colors: [0xfff4d7],            wallpaper: {intensity: 50, background_color: 0xeaa36e, second_background_color: 0xf0e486, third_background_color: 0xf29ebf, fourth_background_color: 0xe8c06e}},
  {id: 104, accent_color: 0x5a9e29, message_colors: [0xfff8df],            wallpaper: {intensity: 50, background_color: 0x7fc289, second_background_color: 0xe4d573, third_background_color: 0xafd677, fourth_background_color: 0xf0c07a}},
  {id: 101, accent_color: 0x7e5fe5, message_colors: [0xf5e2ff],            wallpaper: {intensity: 50, background_color: 0xe4b2ea, second_background_color: 0x8376c2, third_background_color: 0xeab9d9, fourth_background_color: 0xb493e6}},
  {id: 107, accent_color: 0x2cb9ed, message_colors: [0xadf7b5, 0xfcff8b],  wallpaper: {intensity: 50, background_color: 0x1a2e1a, second_background_color: 0x47623c, third_background_color: 0x222e24, fourth_background_color: 0x314429}},
  {id: 103, accent_color: 0x199972, message_colors: [0xfffec7],            wallpaper: {intensity: 50, background_color: 0xdceb92, second_background_color: 0x8fe1d6, third_background_color: 0x67a3f2, fourth_background_color: 0x85d685}},
  {id: 105, accent_color: 0xda90d9, message_colors: [0x94fff9, 0xccffc7],  wallpaper: {intensity: 50, background_color: 0xffc3b2, second_background_color: 0xe2c0ff, third_background_color: 0xffe7b2}}
];

// `light` AppTheme = baseThemeDay. iOS dayColorPresets — no wallpaper, gradient bubbles only.
const dayAccentPresets: AccentPreset[] = [
  {id: 101, accent_color: 0x0088ff, message_colors: [0x0088ff, 0xff53f4]},
  {id: 102, accent_color: 0x00b09b, message_colors: [0xaee946, 0x00b09b]},
  {id: 103, accent_color: 0xd33213, message_colors: [0xf9db00, 0xd33213]},
  {id: 104, accent_color: 0xea8ced, message_colors: [0xea8ced, 0x00c2ed]}
];

// `night` AppTheme. iOS nightColorPresets — index 101 is commented out upstream,
// presets carry dark pattern wallpapers (intensity stored positive; sign is applied via `dark: true`).
const nightAccentPresets: AccentPreset[] = [
  {id: 102, accent_color: 0x00b09b, message_colors: [0xaee946, 0x00b09b], wallpaper: {dark: true, intensity: 35, background_color: 0xe4b2ea, second_background_color: 0x8376c2, third_background_color: 0xeab9d9, fourth_background_color: 0xb493e6}},
  {id: 103, accent_color: 0xd33213, message_colors: [0xf9db00, 0xd33213], wallpaper: {dark: true, intensity: 40, background_color: 0xfec496, second_background_color: 0xdd6cb9, third_background_color: 0x962fbf, fourth_background_color: 0x4f5bd5}},
  {id: 104, accent_color: 0xea8ced, message_colors: [0xea8ced, 0x00c2ed], wallpaper: {dark: true, intensity: 30, background_color: 0x8adbf2, second_background_color: 0x888dec, third_background_color: 0xe39fea, fourth_background_color: 0x679ced}}
];

// iOS PresentationThemeBaseColor enum — plain accent presets without bubble gradient or wallpaper.
// Index = enum rawValue + 10, matching iOS PresentationThemeAccentColor.index serialization.
// See submodules/TelegramUIPreferences/Sources/PresentationThemeSettings.swift L390-436.
type BaseColorName = 'blue' | 'cyan' | 'green' | 'pink' | 'orange' | 'purple' | 'red' | 'yellow' | 'gray';

const BASE_COLOR_RGB: {[name in BaseColorName]: number} = {
  blue:   0x0088ff,
  cyan:   0x00c2ed,
  green:  0x29b327,
  pink:   0xeb6ca4,
  orange: 0xf08200,
  purple: 0x9472ee,
  red:    0xd33213,
  yellow: 0xedb400,
  gray:   0x6d839e
};

const BASE_COLOR_INDEX: {[name in BaseColorName]: number} = {
  blue: 10, cyan: 11, green: 12, pink: 13, orange: 14, purple: 15, red: 16, yellow: 17, gray: 18
};

// iOS `colorFor(baseTheme:)` (PresentationThemeSettings.swift L532): blue is brightened on
// night base (0x0088ff → 0x3e88f7); other bases (incl. nightAccent/tinted) leave it as-is.
function baseColorAccent(name: BaseColorName, base: BaseTheme['_']): number {
  if(base === 'baseThemeNight' && name === 'blue') return 0x3e88f7;
  return BASE_COLOR_RGB[name];
}

// Per base-color wallpaper presets for nightAccent (Dark) — verbatim from iOS
// DefaultDarkTintedPresentationTheme.swift L11–38 (PresentationThemeBaseColor.colorWallpaper).
// Gradient stops are deliberately dark muted variants of the hue, with intensity 40 (positive,
// overlay mode) so the pattern reads against the dark gradient. Black/white/sentinels return nil.
const TINTED_BASE_WALLPAPERS: {[name in BaseColorName]?: AccentPresetWallpaper} = {
  blue:   {intensity: 40, background_color: 0x1e3557, second_background_color: 0x182036, third_background_color: 0x1c4352, fourth_background_color: 0x16263a, dark: true},
  cyan:   {intensity: 40, background_color: 0x1e3557, second_background_color: 0x151a36, third_background_color: 0x1c4352, fourth_background_color: 0x2a4541, dark: true},
  green:  {intensity: 40, background_color: 0x2d4836, second_background_color: 0x172b19, third_background_color: 0x364331, fourth_background_color: 0x103231, dark: true},
  pink:   {intensity: 40, background_color: 0x2c0b22, second_background_color: 0x290020, third_background_color: 0x160a22, fourth_background_color: 0x3b1834, dark: true},
  orange: {intensity: 40, background_color: 0x2c211b, second_background_color: 0x442917, third_background_color: 0x22191f, fourth_background_color: 0x3b2714, dark: true},
  purple: {intensity: 40, background_color: 0x3a1c3a, second_background_color: 0x24193c, third_background_color: 0x392e3e, fourth_background_color: 0x1a1632, dark: true},
  red:    {intensity: 40, background_color: 0x2c211b, second_background_color: 0x44332a, third_background_color: 0x22191f, fourth_background_color: 0x3b2d36, dark: true},
  yellow: {intensity: 40, background_color: 0x2c2512, second_background_color: 0x45360b, third_background_color: 0x221d08, fourth_background_color: 0x3b2f13, dark: true},
  gray:   {intensity: 40, background_color: 0x1c2731, second_background_color: 0x1a1c25, third_background_color: 0x27303b, fourth_background_color: 0x1b1b21, dark: true}
};

// HSV "withMultiplied" — direct port of iOS UIColor.withMultiplied(hue:saturation:brightness:).
// Each channel is independently scaled; saturation/value clamp at 1.0. Hue wraps mod 360.
function withMul(rgbInt: number, hMul: number, sMul: number, vMul: number): number {
  const r = (rgbInt >> 16) & 0xff, g = (rgbInt >> 8) & 0xff, b = rgbInt & 0xff;
  const hsv = rgbToHsv(r, g, b);
  const out = hsvToRgb((hsv[0] * hMul) % 360, Math.min(1, hsv[1] * sMul), Math.min(1, hsv[2] * vMul));
  return (out[0] << 16) | (out[1] << 8) | out[2];
}

// iOS DefaultDarkTintedPresentationTheme.swift:88-91 — outgoing bubble gradient for Dark Blue.
// When a custom accent is picked but bubbleColors is empty, iOS derives a 2-stop gradient:
//   bottomColor = accent.withMultiplied(1.019, 0.731, 0.59)  ← muted, ~59% brightness
//   topColor    = bottomColor.withMultiplied(0.966, 0.61, 0.98)
// We use the same formula so plain base-color picks (cyan, green, …) get a proper bubble fill
// instead of a blinding solid-accent rectangle.
function darkBubbleColors(accent: number): number[] {
  const bottom = withMul(accent, 1.019, 0.731, 0.59);
  const top = withMul(bottom, 0.966, 0.61, 0.98);
  return [top, bottom];
}

// Find the BaseColorName closest to `accentRgb` in plain RGB Euclidean distance. Used by
// applyNewTheme on tinted to pick a per-accent dark wallpaper as the blend target — so cloud
// themes with e.g. orange accents blend toward iOS' orange dark gradient, not always navy.
export function nearestTintedBaseColor(accentRgb: number): BaseColorName {
  const ar = (accentRgb >> 16) & 0xff, ag = (accentRgb >> 8) & 0xff, ab = accentRgb & 0xff;
  let bestName: BaseColorName = 'blue';
  let bestDist = Infinity;
  (Object.keys(BASE_COLOR_RGB) as BaseColorName[]).forEach((name) => {
    const c = BASE_COLOR_RGB[name];
    const cr = (c >> 16) & 0xff, cg = (c >> 8) & 0xff, cb = c & 0xff;
    const d = (cr - ar) ** 2 + (cg - ag) ** 2 + (cb - ab) ** 2;
    if(d < bestDist) {
      bestDist = d;
      bestName = name;
    }
  });
  return bestName;
}

export function tintedBaseWallpaperFor(baseColor: BaseColorName): AccentPresetWallpaper | undefined {
  return TINTED_BASE_WALLPAPERS[baseColor];
}

// Blend an arbitrary wallpaper toward the iOS Dark Blue palette so it reads navy-dominant on
// tinted base. Used everywhere a non-curated wallpaper lands on tinted: cloud themes from the
// carousel (applyNewTheme), grid picks from Chat Wallpaper, color-picker single-color picks,
// uploaded files. The blend target is the iOS `colorWallpaper` of the BaseColor closest to
// `accent` — so an orange-accented theme blends toward iOS' orange dark gradient, etc. Caller
// is responsible for deciding *whether* to blend; this helper just performs the math.
export function blendWallpaperForTinted(wallPaper: WallPaper, accent: number): WallPaper {
  // wallPaperNoFile (single color picker) and wallPaper with file both expose `settings`.
  const wpSettings = (wallPaper as WallPaper.wallPaper).settings;
  if(!wpSettings || typeof wpSettings.background_color !== 'number') return wallPaper;

  const nearest = nearestTintedBaseColor(accent);
  const targetWp = TINTED_BASE_WALLPAPERS[nearest];
  if(!targetWp) return wallPaper;

  const BASE_WEIGHT = 0.85;
  const blend = (target: number, pick: number) => {
    const dr = (target >> 16) & 0xff, dg = (target >> 8) & 0xff, db = target & 0xff;
    const pr = (pick >> 16) & 0xff, pg = (pick >> 8) & 0xff, pb = pick & 0xff;
    const r = Math.round(dr * BASE_WEIGHT + pr * (1 - BASE_WEIGHT));
    const g = Math.round(dg * BASE_WEIGHT + pg * (1 - BASE_WEIGHT));
    const b = Math.round(db * BASE_WEIGHT + pb * (1 - BASE_WEIGHT));
    return (r << 16) | (g << 8) | b;
  };

  return {
    ...wallPaper,
    pFlags: {...wallPaper.pFlags, dark: true as const},
    settings: {
      ...wpSettings,
      background_color: blend(targetWp.background_color, wpSettings.background_color),
      second_background_color: wpSettings.second_background_color !== undefined ?
        blend(targetWp.second_background_color ?? targetWp.background_color, wpSettings.second_background_color) :
        undefined,
      third_background_color: wpSettings.third_background_color !== undefined ?
        blend(targetWp.third_background_color ?? targetWp.background_color, wpSettings.third_background_color) :
        undefined,
      fourth_background_color: wpSettings.fourth_background_color !== undefined ?
        blend(targetWp.fourth_background_color ?? targetWp.background_color, wpSettings.fourth_background_color) :
        undefined,
      intensity: targetWp.dark ? -targetWp.intensity : targetWp.intensity
    }
  } as WallPaper;
}

function baseColorPreset(name: BaseColorName, base: BaseTheme['_']): AccentPreset {
  const accent = baseColorAccent(name, base);
  // For night-class bases (tinted/Dark, night/Night) iOS auto-derives the outgoing bubble pair
  // from the accent — without this the bubble renders as a blinding solid-accent rectangle on a
  // dark theme (most visible on bright accents like cyan/yellow).
  const isDarkBase = base === 'baseThemeTinted' || base === 'baseThemeNight';
  return {
    id: BASE_COLOR_INDEX[name],
    accent_color: accent,
    message_colors: isDarkBase ? darkBubbleColors(accent) : [accent],
    // For nightAccent (Dark) iOS pairs each base color with a dedicated dark-muted wallpaper —
    // see DefaultDarkTintedPresentationTheme.swift `colorWallpaper`. Other bases skip the
    // wallpaper override so the picker only swaps accent + bubbles (matches iOS behavior:
    // .day / .dayClassic / .night use their own wallpaper logic, not this map).
    wallpaper: base === 'baseThemeTinted' ? TINTED_BASE_WALLPAPERS[name] : undefined
  };
}

// Per-base picker contents, matching the iOS ThemePickerController layout (lines 184-225).
// Order: curated combo presets first (when present), then base colors. The "default" / factory-
// reset choice is a separate UI element rendered in generalSettings.tsx, not part of this list.
const BASE_COLORS_DARK: BaseColorName[] = ['blue', 'cyan', 'green', 'pink', 'orange', 'purple', 'red', 'yellow', 'gray'];
const BASE_COLORS_NIGHT: BaseColorName[] = ['blue', 'cyan', 'green', 'pink', 'orange', 'purple', 'red', 'yellow']; // gray excluded
const BASE_COLORS_DAY: BaseColorName[] = ['blue', 'cyan', 'green', 'pink', 'orange', 'purple', 'red', 'yellow', 'gray'];

export function getAccentPresetsForBase(base: BaseTheme['_']): AccentPreset[] {
  switch(base) {
    case 'baseThemeClassic':
      // dayClassic — 7 curated combos + 9 base colors.
      return [...dayClassicAccentPresets, ...BASE_COLORS_DAY.map((c) => baseColorPreset(c, base))];
    case 'baseThemeNight':
      // night — 3 curated combos (with vivid wallpapers) + 8 base colors (no gray).
      return [...nightAccentPresets, ...BASE_COLORS_NIGHT.map((c) => baseColorPreset(c, base))];
    case 'baseThemeDay':
      // day — 4 curated combos (no wallpaper) + 9 base colors.
      return [...dayAccentPresets, ...BASE_COLORS_DAY.map((c) => baseColorPreset(c, base))];
    case 'baseThemeTinted':
      // nightAccent ("Dark") — NO curated combos in iOS, just 9 base colors. Total 9 + default = 10.
      return BASE_COLORS_DARK.map((c) => baseColorPreset(c, base));
    default:
      return [];
  }
}

// Wallpaper id format scoped to client-side presets. Different from cloud wallpaper ids
// so the wallpaper picker doesn't try to resolve them via account.getWallPaper.
const PRESET_WALLPAPER_ID_PREFIX = 'preset:wp:';

function buildPresetWallpaper(preset: AccentPreset): WallPaper.wallPaper | undefined {
  const wp = preset.wallpaper;
  if(!wp) return undefined;
  return {
    _: 'wallPaper',
    pFlags: {
      default: true,
      pattern: true,
      ...(wp.dark ? {dark: true as const} : {})
    },
    access_hash: '',
    document: undefined,
    id: PRESET_WALLPAPER_ID_PREFIX + preset.id,
    slug: 'pattern',
    settings: {
      _: 'wallPaperSettings',
      pFlags: {},
      // Sign convention mirrors DEFAULT_THEME wallpapers: tweb uses negative intensity
      // for dark patterns (chatBackground.tsx applies abs(intensity) as overlay opacity).
      intensity: wp.dark ? -wp.intensity : wp.intensity,
      background_color: wp.background_color,
      second_background_color: wp.second_background_color,
      third_background_color: wp.third_background_color,
      fourth_background_color: wp.fourth_background_color
    }
  };
}

export function presetToThemeSettings(preset: AccentPreset, base: BaseTheme['_']): ThemeSettings {
  return {
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: base} as BaseTheme,
    accent_color: preset.accent_color,
    message_colors: preset.message_colors,
    wallpaper: buildPresetWallpaper(preset)
  };
}

export function presetThemeId(preset: AccentPreset): string {
  return 'preset:' + preset.id;
}
