export default function exceptKeys<T extends object, Key extends keyof T>(obj: T, keys: Key[]) {
  const set = new Set<any>(keys);
  const res = {};

  Object.keys(obj).forEach((key) => {
    if(set.has(key)) return;
    (res as any)[key] = (obj as any)[key];
  });

  return res as Exclude<T, Key>;
}
