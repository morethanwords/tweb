/**
 * A bare bubble of a message, as `ChatBubbles` reads a message back from its element
 */
export function makeMessageBubble(peerId: PeerId, mid: number) {
  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  bubble.dataset.mid = '' + mid;
  bubble.dataset.peerId = '' + peerId;
  return bubble;
}
