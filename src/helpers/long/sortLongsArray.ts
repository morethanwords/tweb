import bigInt from 'big-integer';

export default function sortLongsArray(arr: string[]) {
  return arr.map((long) => {
    return bigInt(long);
  }).sort((a, b) => {
    return a.compare(b);
  }).map((bigInt) => {
    return bigInt.toString(10);
  });
}
