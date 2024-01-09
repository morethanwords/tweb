import type {HistoryStorage} from '../../appMessagesManager';

export default function getHistoryStorageKey(
  type: HistoryStorage['type'],
  peerId: PeerId,
  threadId?: number
) {
  return [type, peerId, threadId].filter(Boolean).join('_') as HistoryStorage['key'];
}
