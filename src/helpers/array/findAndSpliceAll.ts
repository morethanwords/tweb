export default function findAndSpliceAll<T>(array: Array<T>, verify: (value: T, index: number, arr: typeof array) => boolean) {
  const out: typeof array = [];
  let idx = -1;
  while((idx = array.findIndex(verify)) !== -1) {
    out.push(array.splice(idx, 1)[0]);
  }

  return out;
}
