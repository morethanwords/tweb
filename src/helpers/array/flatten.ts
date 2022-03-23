export default function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => (acc.push(...val), acc), []);
}
