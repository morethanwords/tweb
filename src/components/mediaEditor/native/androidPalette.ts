// Android 21f7d109 PersistColorPalette.java:17–49,231–262.
// Pure account-bank data/operations, shared by the worker and editor controller.
export const androidPaletteColors = ['#ff453a', '#ff8a00', '#ffd60a', '#34c759', '#63e6e2', '#0a84ff', '#bf5af2', '#000000', '#ffffff'];
export const androidCustomColors = ['#d7a07c', '#7faffe', '#a58fdb', '#db95ae', '#badc9f'];

export function isAndroidEditorColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value);
}

export const canonicalAndroidColor = (value: string) => value.toLowerCase().replace(/^(#[\da-f]{6})ff$/, '$1');

export function normalizeAndroidCustomColors(saved?: unknown): string[] {
  return androidCustomColors.map((fallback, index) => Array.isArray(saved) && isAndroidEditorColor(saved[index]) ? canonicalAndroidColor(saved[index]) : fallback);
}

export function insertAndroidPaletteColor(colors: string[], value: string) {
  // Existing fixed/custom colors select in place, never an MRU reorder.
  return androidPaletteColors.includes(value) || colors.includes(value) ? colors : [value, ...colors.slice(0, -1)];
}
