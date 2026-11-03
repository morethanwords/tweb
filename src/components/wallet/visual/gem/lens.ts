// What a grown gem shows through its facets (iOS's refraction source): its host draws it onto a canvas the size of
// the gem's own, and the gem bends it inside its silhouette for as long as it is grown.

import type {GemView} from '@components/wallet/visual/gem/stage';
import {gemAssets, gemHull} from '@components/wallet/visual/gem/geometry';
import type {Vec2} from '@components/wallet/visual/math';

/** a held gem's canvas, pt (iOS: the render size of an expanded diamond) */
export const GEM_EXPANDED_CANVAS = 220;

export class GemLensSource {
  private outline = gemAssets().outline;
  private on = false;
  private dirty = false;

  constructor(private gem: GemView) {}

  /** What it shows was drawn anew: it goes to the gem with the next update */
  public changed() {
    this.dirty = true;
  }

  /**
   * Every frame: `source` seen through the gem that stands at `center` of it, `width` points wide, as much as
   * `strength` (0…1) says. Without a source, or with no strength, the gem shows nothing through it.
   */
  public update(source: HTMLCanvasElement | undefined, center: Vec2, width: number, strength: number, opacity: number) {
    const gem = this.gem;
    if(!source || strength <= 0.002) {
      if(this.on) {
        gem.setLens(null);
        this.on = false;
      }

      return;
    }

    if(this.dirty) {
      this.dirty = false;
      gem.setText(source);
    }

    const pose = gem.pose;
    const hull = gemHull(this.outline, pose.yaw, pose.pitch, width / 2 * 0.96)
    .map((p): Vec2 => [center[0] + p[0], center[1] + p[1]]);
    gem.setLens({hull, center, strength: Math.min(1, strength), spin: pose.yaw, textScale: 1, textShift: 0, opacity});
    this.on = true;
  }
}
