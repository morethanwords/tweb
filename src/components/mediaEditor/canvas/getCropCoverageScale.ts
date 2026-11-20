import type getConvenientPositioning from '@components/mediaEditor/canvas/getConvenientPositioning';

/** Extra scale for centered crop bounds in the image's unrotated CSS-pixel axes. */
export default function getCropCoverageScale(bounds: ReturnType<typeof getConvenientPositioning>) {
  return Math.max(
    1,
    (bounds.cropMaxX - bounds.cropMinX) / (bounds.imageMaxX - bounds.imageMinX),
    (bounds.cropMaxY - bounds.cropMinY) / (bounds.imageMaxY - bounds.imageMinY)
  );
}
