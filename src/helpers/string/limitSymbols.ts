export default function limitSymbols(str: string, length: number, limitFrom = length + 10) {
  str = str.trim();
  if(str.length > limitFrom) {
    str = str.slice(0, length)/* .replace(/\s*$/, '') */ + '...';
  }

  return str;
}
