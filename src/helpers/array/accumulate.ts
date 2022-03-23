export default function accumulate(arr: number[], initialValue: number) {
  return arr.reduce((acc, value) => acc + value, initialValue);
}
