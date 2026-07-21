const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_PIXEL_AREA = 1_500_000;

export default function getMediaViewerSnapshotSize(options: {
  width: number,
  height: number,
  sourceWidth?: number,
  sourceHeight?: number,
  devicePixelRatio?: number
}) {
  const displayWidth = Math.max(1, options.width);
  const displayHeight = Math.max(1, options.height);
  const hasSourceSize = options.sourceWidth > 0 && options.sourceHeight > 0;
  const sourceWidth = hasSourceSize ? options.sourceWidth : displayWidth;
  const sourceHeight = hasSourceSize ? options.sourceHeight : displayHeight;
  const devicePixelRatio = Math.min(Math.max(options.devicePixelRatio || 1, 1), MAX_DEVICE_PIXEL_RATIO);

  // Preserve the source aspect ratio so CSS object-fit: cover produces exactly the
  // same crop as the source thumbnail. Scale just far enough to cover the displayed
  // box at the capped DPR, without upscaling or exceeding the area budget.
  const coverScale = Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight) * devicePixelRatio;
  const areaScale = Math.sqrt(MAX_PIXEL_AREA / (sourceWidth * sourceHeight));
  const scale = Math.min(1, coverScale, areaScale);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}
