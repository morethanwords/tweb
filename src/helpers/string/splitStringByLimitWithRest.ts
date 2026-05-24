export default function splitStringByLimitWithRest(str: string, separator: string, limit: number) {
  const splitted = str.split(separator);
  const out: string[] = [];

  while(limit > 0 && splitted.length) {
    out.push(splitted.shift());
    --limit;
  }

  if(splitted.length) {
    out.push(splitted.join(separator));
  }

  return out;
}
