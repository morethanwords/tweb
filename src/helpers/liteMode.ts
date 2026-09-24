import {MOUNT_CLASS_TO} from '@config/debug';
import {useAppSettings} from '@stores/appSettings';

export type LiteModeKey = 'all' | 'gif' | 'video' |
  'emoji' | 'emoji_panel' | 'emoji_messages' | 'emoji_appear' |
  'effects' | 'effects_reactions' | 'effects_premiumstickers' | 'effects_emoji' |
  'stickers' | 'stickers_panel' | 'stickers_chat' |
  'chat' | 'chat_background' | 'chat_spoilers' | 'animations' | 'blur';

export class LiteMode {
  // OS-level "reduce motion" preference (WCAG 2.3.3).
  private prefersReducedMotion = typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)');

  public isEnabled() {
    const [appSettings] = useAppSettings();
    return !!appSettings.liteMode?.all;
  }

  public isReducedMotion() {
    return !!(this.prefersReducedMotion && this.prefersReducedMotion.matches);
  }

  public isAvailable(key: LiteModeKey) {
    // The OS reduce-motion preference disables UI animations app-wide. This
    // also flips the body `animation-level-0` class through appImManager's
    // setSettings, so every `@include animation-level()` SCSS block turns off.
    if(key === 'animations' && this.isReducedMotion()) {
      return false;
    }

    const [appSettings] = useAppSettings();
    return !!(appSettings.liteMode && !appSettings.liteMode.all && !appSettings.liteMode[key]);
  }
}

const liteMode = new LiteMode();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.liteMode = liteMode);
export default liteMode;
