/** Deletes the entries of `map` whose keys `filter` takes; says whether there were any. */
export default function mapDeleteWhere<K>(map: Map<K, unknown>, filter: (key: K) => boolean) {
  let deleted = false;
  for(const key of map.keys()) {
    if(filter(key)) deleted = map.delete(key) || deleted;
  }

  return deleted;
}
