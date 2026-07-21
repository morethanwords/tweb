type MediaViewerVisibleRect = {
  rect: {
    top: number,
    right: number,
    bottom: number,
    left: number
  },
  overflow: {
    top: boolean,
    right: boolean,
    bottom: boolean,
    left: boolean
  }
};

export default function getMediaViewerClipPath(options: {
  visibleRect: MediaViewerVisibleRect,
  viewportWidth: number,
  viewportHeight: number
}) {
  const {visibleRect, viewportWidth, viewportHeight} = options;
  const {rect, overflow} = visibleRect;

  // Mask only the sides actually hidden by a clipping ancestor. Using the
  // thumbnail's other edges would trap the growing mover inside its source rect.
  const top = overflow.top ? Math.max(0, rect.top) : 0;
  const right = overflow.right ? Math.max(0, viewportWidth - rect.right) : 0;
  const bottom = overflow.bottom ? Math.max(0, viewportHeight - rect.bottom) : 0;
  const left = overflow.left ? Math.max(0, rect.left) : 0;

  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}
