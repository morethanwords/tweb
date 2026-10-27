/*
 * The waves around the microphone button: two soft radial blobs and a glow that swell with the
 * microphone's level, in the button's own gradient (tdesktop's BlobsWidget, call_mute_button.cpp).
 */

import {ColorRgb, hexToRgb} from '@helpers/color';
import customProperties from '@helpers/dom/customProperties';
import GroupCallBlobs, {RadialBlob} from '@components/groupCall/blobs';

const BLOB_ALPHA = 76 / 255;
const GLOW_ALPHA = 150 / 255;
const GLOW_MIN_SCALE = 0.6;
const GLOW_PADDING = 1.2;
const SCALE_SMALL_MIN = 0.926;
const SCALE_SMALL_MAX = SCALE_SMALL_MIN + 0.704 - 0.1;
const SCALE_BIG_MIN = 0.878;
const SCALE_BIG_MAX = SCALE_BIG_MIN + 0.807 - 0.1;
// tdesktop's blob radii are given for a button of this radius
const BASE_RADIUS = 57;

export type GroupCallMicrophoneBlobsColors = 'unmuted' | 'muted' | 'hand';

// the button's own gradient (base.scss), from its top-right corner to its bottom-left one
const getColors = (state: GroupCallMicrophoneBlobsColors): ColorRgb[] => {
  return ['from', 'to'].map((end) => hexToRgb(customProperties.getPropertyAsColor(`gc-microphone-${state}-${end}`)));
};

export default class GroupCallMicrophoneBlobs extends GroupCallBlobs {
  private readonly radius: number;
  private blobFill: CanvasGradient;
  private glowFill: CanvasGradient;

  /**
   * @param radius the button's, in CSS pixels
   * @param readLevel the microphone's level (linear RMS) right now, read while the waves run
   */
  constructor(radius: number, readLevel?: () => number | undefined) {
    const minor = [64, 74].map((value) => value / BASE_RADIUS * SCALE_SMALL_MAX * radius);
    const major = [67, 77].map((value) => value / BASE_RADIUS * SCALE_BIG_MAX * radius);
    super({
      blobs: [
        new RadialBlob(9, SCALE_SMALL_MIN / SCALE_SMALL_MAX, minor[0], minor[1]),
        new RadialBlob(12, SCALE_BIG_MIN / SCALE_BIG_MAX, major[0], major[1])
      ],
      size: Math.ceil(major[1] * 2 * GLOW_PADDING),
      className: 'group-call-microphone-blobs',
      readLevel
    });

    this.radius = radius;
  }

  public setColors(state: GroupCallMicrophoneBlobsColors) {
    this.switchColors(getColors(state));
  }

  protected updateFills(colors: ColorRgb[]) {
    const {context, radius} = this;
    const rgba = (color: ColorRgb, alpha: number) => `rgba(${color.join()}, ${alpha})`;

    // over the button's own circle, the way its CSS gradient runs
    const blobFill = this.blobFill = context.createLinearGradient(radius, -radius, -radius, radius);
    blobFill.addColorStop(0, rgba(colors[0], 1));
    blobFill.addColorStop(1, rgba(colors[1], 1));

    const glowFill = this.glowFill = context.createRadialGradient(0, 0, 0, 0, 0, this.size / 2);
    glowFill.addColorStop(0, rgba(colors[0], GLOW_ALPHA));
    glowFill.addColorStop(1, rgba(colors[0], 0));
  }

  protected paint(enter: number) {
    const {context, size} = this;
    const glowScale = (GLOW_MIN_SCALE + (1 - GLOW_MIN_SCALE) * this.level) * Math.min(1, enter);
    if(glowScale > 0) {
      context.save();
      context.scale(glowScale, glowScale);
      context.fillStyle = this.glowFill;
      context.fillRect(-size / 2, -size / 2, size, size);
      context.restore();
    }

    context.globalAlpha = BLOB_ALPHA;
    context.fillStyle = this.blobFill;
    this.blobs.forEach((blob) => blob.paint(context, enter));
    context.globalAlpha = 1;
  }
}
