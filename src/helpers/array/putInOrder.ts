/**
 * `items` rearranged so that the ones `order` names come first, in its order, and the rest follow
 * in their own - how a list takes a new order that covers only a part of it (what has been loaded
 * of it, say). Keys `items` does not hold are passed over.
 */
export default function putInOrder<T, K = T>(
  items: T[],
  order: K[],
  getKey: (item: T) => K = (item) => item as any as K
): T[] {
  const byKey = new Map(items.map((item) => [getKey(item), item]));
  const ordered: T[] = [];
  for(const key of order) {
    if(byKey.has(key)) {
      ordered.push(byKey.get(key));
      byKey.delete(key);
    }
  }

  return ordered.concat(items.filter((item) => byKey.has(getKey(item))));
}
