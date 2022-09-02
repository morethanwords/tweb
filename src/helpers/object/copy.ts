export default function copy<T>(obj: T): T {
  // in case of premitives
  if(obj === null || typeof(obj) !== 'object') {
    return obj;
  }

  // date objects should be
  if(obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  // handle Array
  if(Array.isArray(obj)) {
    // @ts-ignore
    const clonedArr: T = obj.map((el) => copy(el)) as any as T;
    return clonedArr;
  }

  if(ArrayBuffer.isView(obj)) {
    // @ts-ignore
    return obj.slice();
  }

  // lastly, handle objects
  // @ts-ignore
  const clonedObj = new obj.constructor();
  for(var prop in obj) {
    if(obj.hasOwnProperty(prop)) {
      clonedObj[prop] = copy(obj[prop]);
    }
  }
  return clonedObj;
}
