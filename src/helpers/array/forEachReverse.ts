export default function forEachReverse<T>(array: Array<T>, callback: (value: T, index?: number, array?: Array<T>) => void) {
  for(let length = array.length, i = length - 1; i >= 0; --i) {
    callback(array[i], i, array);
  }
};
