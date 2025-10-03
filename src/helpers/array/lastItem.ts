export default function lastItem<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
