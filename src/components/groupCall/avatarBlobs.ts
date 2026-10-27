/*
 * The waves behind a speaking participant's avatar in the list, as Telegram for macOS draws them
 * (GroupCallAvatarView.swift): two blobs in the row's colour, the outer one fainter, while the photo
 * shrinks a little and pulses with the voice.
 */

import {ColorRgb} from '@helpers/color';
import GroupCallBlobs, {RadialBlob} from '@components/groupCall/blobs';

// macOS draws the blobs in a 55 pt square around a 35 pt photo, each blob's points 10/11..1 of the
// square's half away from its centre: in the photo's radii, this far.
const MACOS_REACH = 55 / 35;
// Here they reach a little less, so the loudest wobble stays inside a row only 14 px taller than
// its avatar.
const REACH = MACOS_REACH * 0.91;
const POINTS = 8;
// outer first: the inner one is painted over it
const BLOBS = [
  {alpha: 0.15, minScale: 0.8, maxScale: 0.9},
  {alpha: 0.3, minScale: 0.7, maxScale: 0.8}
];
// the photo's scale while its owner speaks, and how much the voice adds to it
const PHOTO_SCALE = 0.9;
const PHOTO_PULSE = 0.07;

export default class GroupCallAvatarBlobs extends GroupCallBlobs {
  private readonly avatar: HTMLElement;
  private fills: string[];

  /**
   * @param options.avatar the photo the waves come from behind, shrunk while they are shown
   * @param options.radius the photo's, known from its size class: reading it would lay out the list
   * @param options.readLevel the participant's level (linear) right now, read while the waves run
   * @param options.onGone once the waves are hidden and their exit is over
   */
  constructor(options: {
    avatar: HTMLElement,
    radius: number,
    readLevel: () => number | undefined,
    onGone?: () => void
  }) {
    const {avatar, readLevel, onGone} = options;
    const reach = options.radius * REACH;
    super({
      blobs: BLOBS.map(({minScale, maxScale}) => {
        return new RadialBlob(POINTS, minScale / maxScale, reach * maxScale / 1.1, reach * maxScale);
      }),
      size: Math.ceil(reach * BLOBS[0].maxScale * 2) + 2,
      className: 'group-call-participant-blobs',
      readLevel,
      onGone
    });

    this.avatar = avatar;
  }

  public setColor(color: ColorRgb) {
    this.switchColors([color]);
  }

  public destroy() {
    super.destroy();
    this.avatar.style.transform = '';
  }

  protected updateFills([color]: ColorRgb[]) {
    this.fills = BLOBS.map(({alpha}) => `rgba(${color.join()}, ${alpha})`);
  }

  protected paint(enter: number) {
    const {context} = this;
    this.blobs.forEach((blob, i) => {
      context.fillStyle = this.fills[i];
      blob.paint(context, enter);
    });
  }

  protected onFrame(enter: number) {
    const shrink = (1 - PHOTO_SCALE - PHOTO_PULSE * this.level) * Math.min(1, enter);
    this.avatar.style.transform = shrink > 0 ? `scale(${1 - shrink})` : '';
  }
}
