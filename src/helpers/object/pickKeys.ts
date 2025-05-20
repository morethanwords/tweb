export default function pickKeys<T extends object, K extends keyof T>(obj: T, keys: K[]) {
  const result = {} as {[key in K]: T[key]};

  keys.forEach(key => {
    result[key] = obj[key];
  });

  return result;
}
