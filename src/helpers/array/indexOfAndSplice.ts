export default function indexOfAndSplice<T>(array: Array<T>, item: T) {
  const idx = array.indexOf(item);
  const spliced = idx === -1 ? undefined : array.splice(idx, 1);
  return spliced?.[0];
}
