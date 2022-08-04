export default function insertInDescendSortedArray<T extends {[smth in K]?: number}, K extends keyof T>(array: Array<T>, element: T, getProperty: K, pos?: number): number;
export default function insertInDescendSortedArray<T>(array: Array<T>, element: T, getProperty: (element: T) => number, pos?: number): number;
export default function insertInDescendSortedArray<T extends {[smth in K]?: number}, K extends keyof T>(array: Array<T>, element: T, getProperty: K | ((element: T) => T[K]), pos?: number): number {
  if(typeof(getProperty) !== 'function') {
    const property = getProperty;
    getProperty = (element) => element[property];
  }

  const sortProperty: number = getProperty(element);

  if(pos === undefined) {
    pos = array.indexOf(element);
    if(pos !== -1) {
      const prev = array[pos - 1];
      const next = array[pos + 1];
      if((!prev || getProperty(prev) >= sortProperty) && (!next || getProperty(next) <= sortProperty)) {
        // console.warn('same pos', pos, sortProperty, prev, next);
        return pos;
      }

      array.splice(pos, 1);
    }
  }

  const len = array.length;
  if(!len || sortProperty <= getProperty(array[len - 1])) {
    return array.push(element) - 1;
  } else if(sortProperty >= getProperty(array[0])) {
    array.unshift(element);
    return 0;
  } else {
    for(let i = 0; i < len; i++) {
      if(sortProperty > getProperty(array[i])) {
        array.splice(i, 0, element);
        return i;
      }
    }
  }

  console.error('wtf', array, element);
  return array.indexOf(element);
}
