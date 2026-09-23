/** A pinned dialog's key within its list: a peer id, a topic id or a saved-peer id */
export type PinnedKey = PeerId | number;

/**
 * Puts `key` back into a list's pinned order at the place a reorder left it, addressed by the
 * neighbour it ended up next to rather than by how far it travelled.
 *
 * A reorder performed by hand only knows about the rows that were on screen, while the stored
 * order can hold pins with no row at all - the member chats of a folded Community keep theirs -
 * so counting slots would land next to the wrong pin as soon as one of those sits in between.
 *
 * @param order the list's whole pinned order, topmost first
 * @param key the dialog that moved
 * @param above the key it now follows, or `undefined` when it went to the very top of what moved
 * @param below the key it now precedes, used when there is nothing above it
 * @returns the new order, or `undefined` when the pins it was about are not in `order` any more
 */
export default function movePinnedKey(
  order: PinnedKey[],
  key: PinnedKey,
  above: PinnedKey,
  below: PinnedKey
) {
  const without = order.filter((pinned) => pinned !== key);
  if(without.length === order.length) {
    return;
  }

  const hasAbove = above !== undefined;
  const at = without.indexOf(hasAbove ? above : below);
  if(at === -1) {
    return;
  }

  without.splice(hasAbove ? at + 1 : at, 0, key);
  return without;
}
