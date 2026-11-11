export type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb`, `rgb(…)` or `rgba(…)`, as getComputedStyle reports a colour. Alpha is ignored. */
export function parseColor(color: string): Rgb | null {
  const s = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const digits = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (c) => c + c) : hex[1]!;
    const n = parseInt(digits, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) => Math.min(255, Math.round(v))) as Rgb : null;
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** sRGB blend of two `#rrggbb` colours. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseColor(a)!;
  const y = parseColor(b)!;
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Relative luminance, as Android's ColorUtils.calculateLuminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseColor(hex)!.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
