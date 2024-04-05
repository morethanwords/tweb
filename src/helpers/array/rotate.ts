export default function rotateArray<T>(array: T[], n: number) {
  const front = array.slice(n);
  const back = array.slice(0, n);
  return front.concat(back);
}
