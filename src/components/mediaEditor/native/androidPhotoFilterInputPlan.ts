/** Isolated geometry/allocation PLAN for NEW candidate sessions only. No pixels,
 * persisted processing descriptor, legacy migration, paint policy or GPU work.
 * Pinned Android proof and remaining parity limits: tmp/media-editor-android-photo-input.md.
 */
export type PhotoFilterSize = readonly [width: number, height: number];
export type AndroidPhotoFilterInputPolicyV1 = Readonly<{
  version: 'android-photo-filter-input-policy-v1';
  maxEdge: number;
}>;

/** Explicitly chosen WEB default, based on Android's mutable default, not a hard
 * native maximum. Internal experiments may explicitly supply another maxEdge.
 */
export const androidPhotoFilterInputWebPolicyV1: AndroidPhotoFilterInputPolicyV1 = Object.freeze({
  version: 'android-photo-filter-input-policy-v1', maxEdge: 2560
});

export type AndroidPhotoFilterInputRequestV1 = {
  version: 'android-photo-filter-input-plan-v1';
  /** ACTUAL decoded bitmap dimensions, not EXIF/file metadata or display size.
   * Reuse the oriented import/decode path. If decode applied orientation already,
   * pass its resulting dimensions and orientation=0; never rotate twice.
   */
  decodedSize: PhotoFilterSize;
  orientation: 0 | 90 | 180 | 270;
  policy: AndroidPhotoFilterInputPolicyV1;
  /** Caller-chosen practical admission limit, not a measured GPU capacity.
   * Include other/full-size source storage, downstream allocations and everything
   * still live during allocate-before-release resize. Zero must be explicit.
   */
  budget: {
    maxBytes: number;
    additionalSourceBytes: number;
    downstreamBytes: number;
    retainedBytes: number;
  };
};

export function planAndroidPhotoFilterInputV1(input: AndroidPhotoFilterInputRequestV1) {
  const validInt = (n: number) => Number.isInteger(n) && n > 0 && n <= 2147483647;
  if(input?.version !== 'android-photo-filter-input-plan-v1' || input.policy?.version !== 'android-photo-filter-input-policy-v1' ||
    !validInt(input.policy.maxEdge) || input.decodedSize?.length !== 2 || !input.decodedSize.every(validInt) ||
    ![0, 90, 180, 270].includes(input.orientation)) throw new RangeError('Invalid candidate photo-filter input plan');
  const budget = input.budget;
  if(!budget || ![budget.maxBytes, budget.additionalSourceBytes, budget.downstreamBytes, budget.retainedBytes]
  .every(n => Number.isSafeInteger(n) && n >= 0)) throw new RangeError('Invalid explicit photo-filter budget');

  // Java float division/comparison/multiplication BEFORE positive int truncation.
  // Bitmap.createBitmap's independently rounded raster size is NOT predicted here.
  const f = Math.fround, cap = f(input.policy.maxEdge);
  const int = (n: number) => Math.min(2147483647, Math.trunc(n));
  let [width, height] = input.decodedSize;
  let scale = 1;
  if(f(width) > cap || f(height) > cap) {
    const scaleX = f(cap / f(width)), scaleY = f(cap / f(height));
    if(scaleX < scaleY) {
      width = int(cap);
      height = int(f(f(height) * scaleX));
      scale = scaleX;
    } else {
      height = int(cap);
      width = int(f(f(width) * scaleY));
      scale = scaleY;
    }
  }
  if(input.orientation === 90 || input.orientation === 270) [width, height] = [height, width];
  const renderSize: PhotoFilterSize = [width, height];
  const sourceRGBA8Bytes = width * height * 4;
  const skinTargetsRGBA8Bytes = sourceRGBA8Bytes * 3;
  const curveRGBA8Bytes = 256 * 4;
  const estimatedPeakBytes = sourceRGBA8Bytes + skinTargetsRGBA8Bytes + curveRGBA8Bytes +
    budget.additionalSourceBytes + budget.downstreamBytes + budget.retainedBytes;
  if(!Number.isSafeInteger(estimatedPeakBytes)) throw new RangeError('Photo-filter byte estimate exceeds safe integer range');
  const reason = width === 0 || height === 0 ? 'zero-logical-dimension' as const :
    estimatedPeakBytes > budget.maxBytes ? 'practical-budget-exceeded' as const : undefined;
  return {
    version: input.version,
    policy: {...input.policy},
    decodedSize: [...input.decodedSize] as PhotoFilterSize,
    orientation: input.orientation,
    scale,
    /** One planned grid for ALL filter stages and export, not a separate mask.
     * This does NOT assert that a real texture or export has been normalized.
     */
    renderSize,
    exportRenderSize: renderSize,
    androidBitmapRasterSize: 'unknown' as const,
    status: reason ? 'unsupported' as const : 'planned' as const,
    reason,
    estimates: {sourceRGBA8Bytes, skinTargetsRGBA8Bytes, curveRGBA8Bytes,
      additionalSourceBytes: budget.additionalSourceBytes, downstreamBytes: budget.downstreamBytes,
      retainedBytes: budget.retainedBytes, estimatedPeakBytes}
  };
}
