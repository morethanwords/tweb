/**
 * How many photos the profile carousel has for a chat / channel.
 *
 * The carousel always renders the current photo as its first item, while
 * `messages.getHistory` counts only the photos that have a service message.
 * Normally the current one does, and it gets spliced out of the loaded page —
 * so the server count already covers it. When it doesn't (its service message
 * was deleted, or the photo was set without one), the current photo is
 * synthesized on top of the WHOLE history and the server count is one short —
 * which makes the click handler treat the first photo as the last one
 * (distance = -(count - 1) = 0), so the carousel never moves.
 */
export default function getChatPhotosCount(
  historyCount: number,
  loadedCount: number,
  isCurrentSynthesized: boolean
) {
  const count = historyCount ?? loadedCount;
  return isCurrentSynthesized ? count + 1 : count;
}
