export default function splitStringByLength(str: string, maxLength: number) {
  if(str.length < maxLength) return [str];
  let length = 0, lastSliceStartIndex = 0, arrayIndex = 0;
  const delimiter = ' ';// '\n';
  const out: string[] = [];

  const cut = (end?: number) => {
    let part = str.slice(lastSliceStartIndex, end);
    const _arrayIndex = arrayIndex++;
    if(part.length > maxLength) {
      const overflowPart = part.slice(maxLength);
      const splitted = splitStringByLength(overflowPart, maxLength);
      splitted.forEach((part) => {
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
