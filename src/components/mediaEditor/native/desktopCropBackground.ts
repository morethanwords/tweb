import {adaptDesktopCanvasSample, desktopCanvasSamplePlan, type ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';
import {hsvToRgb} from '@helpers/color';

export type DesktopCropColors = readonly [string, string];
const samples = new WeakMap<HTMLImageElement, DesktopCropColors>();

/** Sample the decoded ORIGINAL once, never the adjusted WebGL canvas. Browser
 * smooth resampling is not claimed to be byte-identical to Qt SmoothTransformation.
 */
export function sampleDesktopCropBackground(image: HTMLImageElement): DesktopCropColors {
  const cached = samples.get(image);
  if(cached) return cached;
  const plan = desktopCanvasSamplePlan([image.naturalWidth, image.naturalHeight]);
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, plan.width, plan.height);
  const color = (y: number) => {
    const data = ctx.getImageData(plan.x, y, 1, 1).data;
    const {h, s, v} = adaptDesktopCanvasSample([data[0], data[1], data[2]]);
    return `rgb(${hsvToRgb(h, s, v).join(',')})`;
  };
  const result: DesktopCropColors = [color(plan.topY), color(plan.bottomY)];
  samples.set(image, result);
  return result;
}

/** Vertical in OUTPUT space, clipped around the whole source rectangle, not
 * around opaque source pixels: alpha holes never get background painted in them.
 * destination-over preserves every brush/image/text/sticker already composed.
 */
export function drawDesktopCropBackground(ctx: CanvasRenderingContext2D, crop: ExpandedCropRect, source: ExpandedCropRect, colors: DesktopCropColors) {
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(crop.x, crop.y, crop.width, crop.height);
    ctx.rect(source.x, source.y, source.width, source.height);
    ctx.clip('evenodd');
    ctx.globalCompositeOperation = 'destination-over';
    const gradient = ctx.createLinearGradient(0, crop.y, 0, crop.y + crop.height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(crop.x, crop.y, crop.width, crop.height);
  } finally {
    ctx.restore();
  }
}
