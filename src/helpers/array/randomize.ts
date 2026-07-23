export default function randomize<T extends ArrayBufferView<ArrayBuffer>>(arr: T) {
  if(crypto && 'getRandomValues' in crypto) {
    crypto.getRandomValues(arr);
  } else {
    throw new Error('NO_SECURE_RANDOM');
  }

  return arr;
}
