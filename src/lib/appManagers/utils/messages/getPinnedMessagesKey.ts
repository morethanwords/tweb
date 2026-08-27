/**
 * Storage key of a peer's pinned-message list. Thread-scoped in a forum topic
 * (or a saved sub-dialog), where the pinned list is per-thread rather than
 * per-peer. Shared by the manager's pin cache and by the UI's
 * `hiddenPinnedMessages` state so both sides key the same way.
 */
export default function getPinnedMessagesKey(peerId: PeerId, threadId?: number) {
  return peerId + (threadId ? '_' + threadId : '');
}
