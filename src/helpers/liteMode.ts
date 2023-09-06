/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import rootScope from '../lib/rootScope';

export type LiteModeKey = 'all' | 'gif' | 'video' |
  'emoji' | 'emoji_panel' | 'emoji_messages' |
  'effects' | 'effects_reactions' | 'effects_premiumstickers' | 'effects_emoji' |
  'stickers' | 'stickers_panel' | 'stickers_chat' |
  'chat' | 'chat_background' | 'chat_spoilers' | 'animations';

export class LiteMode {
  public isEnabled() {
    return !!(rootScope.settings && rootScope.settings.liteMode.all);
  }

  public isAvailable(key: LiteModeKey) {
    return !!(rootScope.settings && !rootScope.settings.liteMode.all && !rootScope.settings.liteMode[key]);
  }
}

const liteMode = new LiteMode();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.liteMode = liteMode);
export default liteMode;
