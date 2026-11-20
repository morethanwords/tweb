/** Safe mathematical web policy for ordinary-photo blur, not established native bit-exact behavior.
 * Ordinary-photo Painting.setBrush(Blurer), blurManager == null only.
 * Telegram-Android 21f7d109da6ab3506c9e9577f98c6a38771ab335:
 * Painting.java:1112–1145; TMessagesProj/jni/image.cpp:620–876.
 * Operates on raw RGBA bytes: no unpremultiplication or color-space conversion.
 * Not source-bitmap generation, selective photo blur, or video blur composition.
 *
 * Existing helpers/blur.ts uses Canvas filters/box blur; vendor/StackBlur.js
 * requires DOM ids, approximates division and unpremultiplies RGB. Extending
 * those APIs would change unrelated consumers, not reuse this byte contract.
 */
export const androidPaintBlurKernelLimits = Object.freeze({side: 1280, bytes: 8 * 1024 * 1024, radius: 8});

/** Fixed radius 8, weights 9-|k|, divisor 81 after EACH pass on ALL channels.
 * In place; padding, trailing bytes and bytes outside a subarray are untouched.
 * All validation and the single bounded scratch allocation precede any write.
 * Budget is explicit web policy, not Android hardware detection. O(w*h) work,
 * 4*w*h scratch bytes; integer sums never exceed 255*81 (20655).
 */
export function androidPaintBlurRGBA(pixels: Uint8Array | Uint8ClampedArray, options: {
  width: number;
  height: number;
  stride: number;
  radius?: number;
}): void {
  if(!options || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || !(pixels.buffer instanceof ArrayBuffer)) {
    throw new RangeError('Expected owned raw RGBA bytes');
  }
  const {width, height, stride, radius = 8} = options;
  const {side, bytes} = androidPaintBlurKernelLimits;
  if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > side || height > side ||
    !Number.isSafeInteger(stride) || stride < width * 4 || stride > Math.floor(bytes / height) ||
    radius !== 8 || pixels.byteLength < stride * height || pixels.byteLength > bytes) {
    throw new RangeError('Unsupported Android paint blur dimensions/stride/radius/budget');
  }
  const scratch = new Uint8Array(width * height * 4);
  const pass = (source: Uint8Array | Uint8ClampedArray, target: Uint8Array | Uint8ClampedArray,
    sourceStride: number, targetStride: number, vertical: boolean) => {
    const length = vertical ? height : width;
    const lines = vertical ? width : height;
    const sourceStep = vertical ? sourceStride : 4;
    const targetStep = vertical ? targetStride : 4;
    for(let line = 0; line < lines; ++line) {
      for(let channel = 0; channel < 4; ++channel) {
        const origin = (vertical ? line * 4 : line * sourceStride) + channel;
        const at = (position: number) => source[origin + Math.max(0, Math.min(length - 1, position)) * sourceStep];
        let sum = 0, outgoing = 0, incoming = 0;
        for(let k = -8; k <= 8; ++k) sum += at(k) * (9 - Math.abs(k));
        for(let k = -8; k <= 0; ++k) outgoing += at(k);
        for(let k = 1; k <= 9; ++k) incoming += at(k);
        let offset = (vertical ? line * 4 : line * targetStride) + channel;
        for(let position = 0; position < length; ++position) {
          target[offset] = Math.floor(sum / 81);
          sum += incoming - outgoing;
          const next = at(position + 1);
          outgoing += next - at(position - 8);
          incoming += at(position + 10) - next;
          offset += targetStep;
        }
      }
    }
  };
  pass(pixels, scratch, stride, width * 4, false);
  pass(scratch, pixels, width * 4, stride, true);
}
