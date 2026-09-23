/**
 * The indexes to hand a set of items so they end up in the order `keys` asks for: the very indexes
 * they hold now, redealt among them. A list that renders by index then re-sorts into that order
 * without a single new index having to be made up - and without asking whoever owns them for fresh
 * ones, which is what lets a reorder made by hand be on screen before any round trip.
 *
 * Nothing but those items moves: the indexes they held stay where they were in the list as a whole.
 *
 * @param items the items of the list, each with the index it holds now
 * @param keys the ids to reorder, in the order they have to end up in
 * @param descending whether the list puts the greatest index first
 * @returns one index per key, or `undefined` when one of the keys is not in the list
 */
export default function reorderIndexes<Id>(
  items: {id: Id, index: number}[],
  keys: Id[],
  descending?: boolean
): number[] {
  const indexes: number[] = [];
  for(const key of keys) {
    const index = items.find((item) => item.id === key)?.index;
    if(index === undefined) {
      return;
    }

    indexes.push(index);
  }

  return indexes.sort((a, b) => descending ? b - a : a - b);
}
