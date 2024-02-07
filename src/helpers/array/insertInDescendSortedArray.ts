export default function insertInDescendSortedArray<T extends {[smth in K]?: number}, K extends keyof T>(array: Array<T>, element: T, getProperty: K, pos?: number, cmp?: (val1: number, val2: number) => number): number;
export default function insertInDescendSortedArray<T>(array: Array<T>, element: T, getProperty?: (element: T) => number, pos?: number, cmp?: (val1: number, val2: number) => number): number;
export default function insertInDescendSortedArray<T extends {[smth in K]?: number}, K extends keyof T>(array: Array<T>, element: T, getProperty: K | ((element: T) => T[K]), pos?: number, cmp?: (val1: number, val2: number) => number): number {
  if(!getProperty) {
    getProperty = (element) => element as any;
  } else if(typeof(getProperty) !== 'function') {
    const property = getProperty;
    getProperty = (element) => element[property];
  }

  cmp ||= (val1, val2) => val1 - val2;

  const sortProperty = getProperty(element);

  pos ??= array.indexOf(element);
  if(pos !== -1) {
    const prev = array[pos - 1];
    const next = array[pos + 1];
    if((!prev || cmp(getProperty(prev), sortProperty) >= 0) && (!next || cmp(getProperty(next), sortProperty) <= 0)) {
      // console.warn('same pos', pos, sortProperty, prev, next);
      return pos;
    }

    array.splice(pos, 1);
  }

  const len = array.length;
  if(!len || cmp(sortProperty, getProperty(array[len - 1])) <= 0) {
    return array.push(element) - 1;
  } else if(cmp(sortProperty, getProperty(array[0])) >= 0) {
    array.unshift(element);
    return 0;
  } else {
    for(let i = 0; i < len; i++) {
      if(cmp(sortProperty, getProperty(array[i])) > 0) {
        array.splice(i, 0, element);
        return i;
      }
    }
  }

  console.error('wtf', array, element);
  return array.indexOf(element);
}
