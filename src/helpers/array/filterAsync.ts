type K = boolean;
export default async function filterAsync<T>(arr: T[], callback: (item: T, idx: number, arr: T[]) => Promise<K> | K) {
  const promises = arr.map(async(item, idx, arr) => {
    if(await callback(item, idx, arr)) {
      return item;
    }
  });

  return (await Promise.all(promises)).filter(Boolean);
}
