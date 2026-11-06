/** A key of a chat, or of a topic in it (a forum topic, a saved sub-dialog) */
export default function getPeerThreadKey(peerId: PeerId, threadId?: number) {
  return peerId + (threadId ? '_' + threadId : '');
}
