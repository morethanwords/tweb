import { luminance, parseColor, toHex } from './color.js';

export type StarKind = 'premium' | 'stars';
export type StarTheme = 'dark' | 'light';

/** Assets already in memory: the bytes of star.mesh and the decoded flecks.png. */
export interface StarAssets {
  mesh: ArrayBuffer;
  flecks: TexImageSource;
}

export interface StarOptions {
  /** 'premium', the violet Premium star, or 'stars', the golden Telegram Stars star. Default 'premium'. */
  kind?: StarKind;
  /** Default: from `background`, dark when its luminance is under 0.5; 'light' when neither is given. */
  theme?: StarTheme;
  /** The page colour behind the star, which its glass refracts. Default: PAGE_COLORS of the theme. */
  background?: string;
  /** Base URL of star.mesh and flecks.png, or the assets themselves. Default: the package's assets folder. */
  assets?: string | URL | StarAssets;
  /** Drag to spin, tap to push. Default true. */
  interactive?: boolean;
  /** Idle turns and glints. Default true. */
  autoplay?: boolean;
  /** Cap on the backing store's pixel ratio. Default 2: a 3x screen draws 2.25 times the pixels for no visible gain. */
  maxPixelRatio?: number;
  /** A second canvas, behind the star, for its particle field. The field centres on the star's canvas. */
  particles?: HTMLCanvasElement;
  /**
   * One still frame at rest and no input (true), or never (false). Default: follows `prefers-reduced-motion: reduce`.
   * A client with motion settings of its own passes false and sets `autoplay` and `interactive` instead.
   */
  reducedMotion?: boolean;
}

export interface Look {
  theme: StarTheme;
  background: string;
}

export interface ResolvedOptions extends Look {
  kind: StarKind;
  assets: string | URL | StarAssets | undefined;
  interactive: boolean;
  autoplay: boolean;
  maxPixelRatio: number;
  particles: HTMLCanvasElement | null;
  reducedMotion: boolean | undefined;
}

/** Telegram Web's page colours. */
export const PAGE_COLORS: Readonly<Record<StarTheme, string>> = { light: '#ffffff', dark: '#212121' };

export function resolveKind(kind: unknown = 'premium'): StarKind {
  if (kind !== 'premium' && kind !== 'stars') throw new TypeError(`kind must be 'premium' or 'stars', not ${String(kind)}`);
  return kind;
}

export function resolveLook(theme: unknown, background: unknown): Look {
  if (theme !== undefined && theme !== 'dark' && theme !== 'light') throw new TypeError(`theme must be 'dark' or 'light', not ${String(theme)}`);
  const look = theme as StarTheme | undefined;
  if (background === undefined) return { theme: look ?? 'light', background: PAGE_COLORS[look ?? 'light'] };
  const rgb = typeof background === 'string' ? parseColor(background) : null;
  if (!rgb) throw new TypeError(`background must be a #rgb, #rrggbb or rgb() colour, not ${String(background)}`);
  const hex = toHex(rgb);
  return { theme: look ?? (luminance(hex) < 0.5 ? 'dark' : 'light'), background: hex };
}

export function resolveOptions(options: StarOptions = {}): ResolvedOptions {
  const flag = (name: 'interactive' | 'autoplay'): boolean => {
    const value = options[name] ?? true;
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
    return value;
  };
  return {
    kind: resolveKind(options.kind),
    ...resolveLook(options.theme, options.background),
    assets: options.assets,
    interactive: flag('interactive'),
    autoplay: flag('autoplay'),
    maxPixelRatio: ratioCap(options.maxPixelRatio),
    particles: fieldCanvas(options.particles),
    reducedMotion: reducedMotion(options.reducedMotion),
  };
}

function ratioCap(value: unknown = 2): number {
  if (typeof value !== 'number' || !(value >= 1)) throw new TypeError(`maxPixelRatio must be a number of at least 1, not ${String(value)}`);
  return value;
}

function fieldCanvas(value: unknown): HTMLCanvasElement | null {
  if (value === undefined || value === null) return null;
  if (typeof (value as HTMLCanvasElement).getContext !== 'function') throw new TypeError(`particles must be a canvas, not ${String(value)}`);
  return value as HTMLCanvasElement;
}

function reducedMotion(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError('reducedMotion must be a boolean');
  return value as boolean | undefined;
}
