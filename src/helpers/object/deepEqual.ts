/**
 * ignores `undefined` properties
 */
export default function deepEqual<T>(x: T, y: T, ignoreKeys?: (keyof T)[]): boolean {
  const ignoreSet = ignoreKeys && new Set(ignoreKeys);
  const okok = (obj: any) => Object.keys(obj).filter((key) => obj[key] !== undefined);
  const ok = ignoreKeys ? (obj: any) => okok(obj).filter((key) => !ignoreSet.has(key as any)) : okok,
    tx = typeof x,
    ty = typeof y;
  return x && y && tx === 'object' && tx === ty ? (
    ok(x).length === ok(y).length &&
      ok(x).every((key) => deepEqual((x as any)[key], (y as any)[key], ignoreKeys))
  ) : (x === y);
}
