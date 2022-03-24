export default function convertKeyToInputKey(key: string) {
  key = key[0].toUpperCase() + key.slice(1);
  key = 'input' + key;
  return key;
}
