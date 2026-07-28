import isEphemeralMessageId from '@appManagers/utils/messageId/isEphemeralMessageId';

export function getMessageSelectionGroup<K>(
  selectedMids: ReadonlyMap<K, ReadonlySet<number>>
) {
  for(const mids of selectedMids.values()) {
    const mid = mids.values().next().value;
    if(mid !== undefined) {
      return isEphemeralMessageId(mid);
    }
  }
}

export default function isSameMessageSelectionGroup<K>(
  selectedMids: ReadonlyMap<K, ReadonlySet<number>>,
  isEphemeral: boolean
) {
  const selectionGroup = getMessageSelectionGroup(selectedMids);
  return selectionGroup === undefined || selectionGroup === isEphemeral;
}
