export default function convertInputKeyToKey<T extends string>(inputKey: string) {
  const str = inputKey.replace('input', '');
  return (str[0].toLowerCase() + str.slice(1)) as T;
}
