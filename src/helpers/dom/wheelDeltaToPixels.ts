/**
 * A wheel's delta in pixels. A mouse that scrolls by lines or by pages reports those (`deltaMode`
 * 1 and 2): a line is counted as 16px, and a page as the scrolled element's own size.
 */
export default function wheelDeltaToPixels(delta: number, deltaMode: number, pageSize: number) {
  return delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageSize : 1);
}
