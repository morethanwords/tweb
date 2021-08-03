/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* export function stringMiddleOverflow(str: string, maxLength: number) {
  return str.length > maxLength ? str.slice(0, maxLength / 2 | 0) + '...' + str.slice(-Math.round(maxLength / 2)) : str; 
} */

export function limitSymbols(str: string, length: number, limitFrom = length + 10) {
  str = str.trim();
  if(str.length > limitFrom) {
    str = str.slice(0, length)/* .replace(/\s*$/, '') */ + '...';
  }

  return str;
}

// credits to https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
export function escapeRegExp(str: string) {
  return str
    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    .replace(/-/g, '\\x2d');
}

export function encodeEntities(value: string) {
  return value.replace(/&/g, '&amp;').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (value) => {
    var hi = value.charCodeAt(0);
    var low = value.charCodeAt(1);
    return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';';
  }).replace(/([^\#-~| |!])/g, (value) => { // non-alphanumeric
    return '&#' + value.charCodeAt(0) + ';';
  }).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function splitStringByLength(str: string, maxLength: number) {
  if(str.length < maxLength) return [str];
  let length = 0, lastSliceStartIndex = 0, arrayIndex = 0;
  const delimiter = ' ';//'\n';
  const out: string[] = [];

  const cut = (end?: number) => {
    let part = str.slice(lastSliceStartIndex, end);
    const _arrayIndex = arrayIndex++;
    if(part.length > maxLength) {
      let overflowPart = part.slice(maxLength);
      const splitted = splitStringByLength(overflowPart, maxLength);
      splitted.forEach(part => {
        out[arrayIndex++] = part;
      });

      part = part.slice(0, maxLength);
    }

    lastSliceStartIndex = end;
    length = 0;
    out[_arrayIndex] = (out[_arrayIndex] || '') + part;
  };

  let lastIndex = 0;
  do {
    let index = str.indexOf(delimiter, lastIndex);
    if(index === -1) {
      if(lastIndex !== (str.length - 1)) {
        cut();
      }

      break;
    }

    index += delimiter.length;

    const partLength = index - lastIndex;
    if((length + partLength) > maxLength) {
      cut(length);
    }
    
    lastIndex = index;
    length += partLength;
  } while(true);

  return out;
}

// https://stackoverflow.com/a/14824756
/* export const checkRTL = (s: string) => {           
  const ltrChars  = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF'+'\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF',
    rtlChars      = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC',
    rtlDirCheck   = new RegExp('^[^'+ltrChars+']*['+rtlChars+']');

  return rtlDirCheck.test(s);
}; */

//(window as any).checkRTL = checkRTL;

export function convertInputKeyToKey<T extends string>(inputKey: string) {
  const str = inputKey.replace('input', '');
  return (str[0].toLowerCase() + str.slice(1)) as T;
}

export function convertKeyToInputKey(key: string) {
  key = key[0].toUpperCase() + key.slice(1);
  key = 'input' + key;
  return key;
}

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
