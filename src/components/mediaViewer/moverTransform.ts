/**
 * The mover is moved through a registered property (`@property` in mediaViewer.scss) where the
 * browser has them, not through `transform` itself. A `transform` transition runs on the
 * compositor, ahead of the clip-path, corner and size transitions that open and close the mover with
 * it on the main thread - so the picture flew back over the topbar before its clip caught up. A
 * registered property is animated on the main thread, with them.
 */
const PROPERTY = '--media-viewer-mover-transform';

export const MOVER_TRANSFORM_PROPERTY = typeof CSS !== 'undefined' && 'registerProperty' in CSS ? PROPERTY : 'transform';

// * on a mover that is moved through the registered property
export const MOVER_TRANSFORM_SYNCED_CLASS = 'is-transform-synced';

export function setMoverTransform(mover: HTMLElement, transform: string) {
  mover.style.setProperty(MOVER_TRANSFORM_PROPERTY, transform);
}

export function getMoverTransform(mover: HTMLElement) {
  return mover.style.getPropertyValue(MOVER_TRANSFORM_PROPERTY);
}
