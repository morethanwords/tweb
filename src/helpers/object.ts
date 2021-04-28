/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

export function copy<T>(obj: T): T {
  //in case of premitives
  if(obj === null || typeof(obj) !== "object") {
    return obj;
  }
 
  //date objects should be 
  if(obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
 
  //handle Array
  if(Array.isArray(obj)) {
    // @ts-ignore
    const clonedArr: T = obj.map(el => copy(el)) as any as T;
    return clonedArr;
  }
 
  //lastly, handle objects
  // @ts-ignore
  let clonedObj = new obj.constructor();
  for(var prop in obj){
    if(obj.hasOwnProperty(prop)) {
      clonedObj[prop] = copy(obj[prop]);
    }
  }
  return clonedObj;
}

export function deepEqual(x: any, y: any): boolean {
  const ok = Object.keys, tx = typeof x, ty = typeof y;
  return x && y && tx === 'object' && tx === ty ? (
    ok(x).length === ok(y).length &&
      ok(x).every(key => deepEqual(x[key], y[key]))
  ) : (x === y);
}

export function defineNotNumerableProperties(obj: {[key: string]: any}, names: string[]) {
  //const perf = performance.now();
  const props = {writable: true, configurable: true};
  const out: {[name: string]: typeof props} = {};
  names.forEach(name => {
    if(obj[name] === undefined) {
      out[name] = props;
    }
  });
  Object.defineProperties(obj, out);
  //console.log('defineNotNumerableProperties time:', performance.now() - perf);
}

export function getObjectKeysAndSort(object: any, sort: 'asc' | 'desc' = 'asc') {
  if(!object) return [];
  const ids = Object.keys(object).map(i => +i);
  if(sort === 'asc') return ids.sort((a, b) => a - b);
  else return ids.sort((a, b) => b - a);
}

export function safeReplaceObject(wasObject: any, newObject: any) {
  if(!wasObject) {
    return newObject;
  }

  for(var key in wasObject) {
    if(!newObject.hasOwnProperty(key)) {
      delete wasObject[key];
    }
  }

  for(var key in newObject) {
    //if (newObject.hasOwnProperty(key)) { // useless
      wasObject[key] = newObject[key];
    //}
  }
  
  return wasObject;
}

/**
 * Will be used for FILE_REFERENCE_EXPIRED
 * @param key 
 * @param wasObject 
 * @param newObject 
 */
export function safeReplaceArrayInObject<K>(key: K, wasObject: any, newObject: any) {
  if('byteLength' in newObject[key]) { // Uint8Array
    newObject[key] = [...newObject[key]];
  }

  if(wasObject && wasObject[key] !== newObject[key]) {
    wasObject[key].length = newObject[key].length;
    (newObject[key] as any[]).forEach((v, i) => {
      wasObject[key][i] = v;
    });

    /* wasObject[key].set(newObject[key]); */
    newObject[key] = wasObject[key];
  }
}

export function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

export function getDeepProperty(object: any, key: string) {
  const splitted = key.split('.');
  let o: any = object;
  splitted.forEach(key => {
    if(!key) {
      return;
    }
    
    // @ts-ignore
    o = o[key];
  });
  
  return o;
}

export function setDeepProperty(object: any, key: string, value: any) {
  const splitted = key.split('.');
  getDeepProperty(object, splitted.slice(0, -1).join('.'))[splitted.pop()] = value;
}

export function validateInitObject(initObject: any, currentObject: any, onReplace?: (key: string) => void, previousKey?: string) {
  for(const key in initObject) {
    if(typeof(currentObject[key]) !== typeof(initObject[key])) {
      currentObject[key] = copy(initObject[key]);
      onReplace && onReplace(previousKey || key);
    } else if(isObject(initObject[key])) {
      validateInitObject(initObject[key], currentObject[key], onReplace, previousKey || key);
    }
  }
}

export function safeAssign(object: any, fromObject: any) {
  if(!fromObject) return;
  
  for(let i in fromObject) {
    if(fromObject[i] !== undefined) {
      object[i] = fromObject[i];
    }
  }
}
