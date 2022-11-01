export default function indexOfAll(string: string, needle: string) {
  const regExp = new RegExp(needle, 'g');
  const indexes: number[] = [];
  let match: any;
  while(match = regExp.exec(string)) {
    indexes.push(match.index);
  }

  return indexes;
}
