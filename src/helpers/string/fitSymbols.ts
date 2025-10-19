export default function fitSymbols(str: string, length: number) {
  const ending = '...';
  str = str.trim();

  if(str.length > length - ending.length) {
    str = str.slice(0, length - ending.length) + ending;
  }

  return str;
}
