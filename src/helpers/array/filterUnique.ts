export default function filterUnique<T extends Array<any>>(arr: T): T {
  return [...new Set(arr)] as T;
}
