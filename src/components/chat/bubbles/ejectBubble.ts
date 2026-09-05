export default function ejectBubble(bubble: HTMLElement) {
  // Solid disposal clears its host, so keep the owner alive until the old bubble is no longer visible.
  bubble.remove();
  bubble.middlewareHelper.destroy();
}
