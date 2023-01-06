// TOO SLOW
/* export function parse(text: string) {
  let arr: number[] = [], performedValue: any = null;
  return JSON.parse(text, (key, value) => {
    //console.log(key, value);
    if(key === 'type' && value === 'bytes') {
      arr = [];
      return undefined;
    } else if(arr) {
      if(key === 'value') {
        performedValue = new Uint8Array(arr);
        arr = null;
        return undefined;
      } else arr[+key] = value;
    } else if(performedValue) {
      const v = performedValue;
      performedValue = null;
      return v;
    }

    return value;
  });
} */
// parse('{"file_reference": {"type": "bytes", "value": [1,2,3]}, "file_reference2": {"type": "bytes", "value": [3,2,1]}}');
// -> {file_reference: Uint8Array}

// TOO SLOW TOO
/* export function stringify(value: any) {
  return JSON.stringify(value, (key, value) => {
    if(key === 'downloaded' || (key === 'url' && value.indexOf('blob:') === 0)) return undefined;
    return value;
  });
} */

export {};
