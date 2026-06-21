export default function splitStringByLength(str: string, maxLength: number) {
  if(str.length <= maxLength) return [str];

  const delimiter = ' ';// '\n';
  const out: string[] = [];
  let current = '';

  const flush = () => {
    if(current.length) {
      out.push(current);
      current = '';
    }
  };

  // each token keeps its trailing delimiter so the original string is reconstructed losslessly
  let lastIndex = 0;
  do {
    let index = str.indexOf(delimiter, lastIndex);
    const isLast = index === -1;
    if(isLast) index = str.length;
    else index += delimiter.length;

    let token = str.slice(lastIndex, index);
    lastIndex = index;

    // a single token longer than maxLength must be hard-cut into maxLength-sized pieces
    if(token.length > maxLength) {
      flush();
      while(token.length > maxLength) {
        out.push(token.slice(0, maxLength));
        token = token.slice(maxLength);
      }
    }

    if((current.length + token.length) > maxLength) {
      flush();
    }

    current += token;
  } while(lastIndex < str.length);

  flush();

  return out;
}
