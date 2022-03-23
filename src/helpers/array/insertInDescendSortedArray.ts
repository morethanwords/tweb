export default function insertInDescendSortedArray<T extends {[smth in K]?: number}, K extends keyof T>(array: Array<T>, element: T, property: K, pos?: number) {
  const sortProperty: number = element[property];

  if(pos === undefined) {
    pos = array.indexOf(element);
    if(pos !== -1) {
      const prev = array[pos - 1];
      const next = array[pos + 1];
      if((!prev || prev[property] >= sortProperty) && (!next || next[property] <= sortProperty)) {
        // console.warn('same pos', pos, sortProperty, prev, next);
        return pos;
      }
      
      array.splice(pos, 1);
    }
  }

  const len = array.length;
  if(!len || sortProperty <= array[len - 1][property]) {
    return array.push(element) - 1;
  } else if(sortProperty >= array[0][property]) {
    array.unshift(element);
    return 0;
  } else {
    for(let i = 0; i < len; i++) {
      if(sortProperty > array[i][property]) {
        array.splice(i, 0, element);
        return i;
      }
    }
  }

  console.error('wtf', array, element);
  return array.indexOf(element);
}
