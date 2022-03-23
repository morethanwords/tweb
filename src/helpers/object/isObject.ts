export default function isObject<T extends Record<any, any>>(object: any): object is T {
  return typeof(object) === 'object' && object !== null;
}
