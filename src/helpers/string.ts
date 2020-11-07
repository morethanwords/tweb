/* export function stringMiddleOverflow(str: string, maxLength: number) {
  return str.length > maxLength ? str.slice(0, maxLength / 2 | 0) + '...' + str.slice(-Math.round(maxLength / 2)) : str; 
} */

export function limitSymbols(str: string, length: number, limitFrom = length + 10) {
  if(str.length > limitFrom) {
    str = str.slice(0, length).replace(/(\n|\s)+$/, '') + '...';
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
      if(lastIndex != (str.length - 1)) {
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