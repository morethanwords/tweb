import {MOUNT_CLASS_TO} from '@config/debug';
import Modes from '@config/modes';
import {useAppSettings} from '@stores/appSettings';
import useReducedMotion from '@stores/reducedMotion';

export type LiteModeKey = 'all' | 'gif' | 'video' |
  'emoji' | 'emoji_panel' | 'emoji_messages' | 'emoji_appear' |
  'effects' | 'effects_reactions' | 'effects_premiumstickers' | 'effects_emoji' |
  'stickers' | 'stickers_panel' | 'stickers_chat' |
  'chat' | 'chat_background' | 'chat_spoilers' | 'animations' | 'motion' | 'blur';

/**
 * How much of the interface animates:
 * - 0 — nothing;
 * - 1 — reduced: control feedback, fades and growth in place, but nothing
 *   travels — slides and zooms become crossfades, positions and scroll change
 *   at once;
 * - 2 — full.
 *
 * `isAvailable('animations')` is level 1 and up, `isAvailable('motion')` level 2.
 * The body carries the matching classes for SCSS (`@include animation-level()`).
 */
export type AnimationLevel = 0 | 1 | 2;

export class LiteMode {
  public isEnabled() {
    const [appSettings] = useAppSettings();
    return !!appSettings.liteMode?.all;
  }

  // OS-level "reduce motion" preference (WCAG 2.3.3)
  public isReducedMotion() {
    return useReducedMotion()();
  }

  /**
   * The OS reduce-motion preference, which the a11y layer follows, holds the
   * movement off whatever the setting says: the fades stay, the way the
   * platforms' own "Reduce Motion" keeps them
   */
  public isMotionHeldBySystem() {
    return Modes.a11y && this.isReducedMotion();
  }

  public isAvailable(key: LiteModeKey): boolean {
    // movement is a part of the interface animations, so it goes with them
    if(key === 'motion' && (!this.isAvailable('animations') || this.isMotionHeldBySystem())) {
      return false;
    }

    const [appSettings] = useAppSettings();
    return !!(appSettings.liteMode && !appSettings.liteMode.all && !appSettings.liteMode[key]);
  }

  public getAnimationLevel(): AnimationLevel {
    return this.isAvailable('motion') ? 2 : (this.isAvailable('animations') ? 1 : 0);
  }
}

const liteMode = new LiteMode();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.liteMode = liteMode);
export default liteMode;
