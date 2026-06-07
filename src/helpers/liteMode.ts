import {MOUNT_CLASS_TO} from '@config/debug';
import {useAppSettings} from '@stores/appSettings';

export type LiteModeKey = 'all' | 'gif' | 'video' |
  'emoji' | 'emoji_panel' | 'emoji_messages' | 'emoji_appear' |
  'effects' | 'effects_reactions' | 'effects_premiumstickers' | 'effects_emoji' |
  'stickers' | 'stickers_panel' | 'stickers_chat' |
  'chat' | 'chat_background' | 'chat_spoilers' | 'animations' | 'blur';

export class LiteMode {
  public isEnabled() {
    const [appSettings] = useAppSettings();
    return !!appSettings.liteMode?.all;
  }

  public isAvailable(key: LiteModeKey) {
    const [appSettings] = useAppSettings();
    return !!(appSettings.liteMode && !appSettings.liteMode.all && !appSettings.liteMode[key]);
  }
}

const liteMode = new LiteMode();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.liteMode = liteMode);
export default liteMode;
