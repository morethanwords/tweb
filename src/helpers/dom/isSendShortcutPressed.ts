/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../../lib/rootScope';
import {IS_MOBILE, IS_APPLE} from '../../environment/userAgent';

export default function isSendShortcutPressed(e: KeyboardEvent) {
  if(e.key === 'Enter' && !IS_MOBILE && !e.isComposing) {
    /* if(e.ctrlKey || e.metaKey) {
      this.messageInput.innerHTML += '<br>';
      placeCaretAtEnd(this.message)
      return;
    } */

    if(rootScope.settings.sendShortcut === 'enter') {
      if(e.shiftKey || e.ctrlKey || e.metaKey) {
        return;
      }

      return true;
    } else {
      const secondaryKey = IS_APPLE ? e.metaKey : e.ctrlKey;
      if(e.shiftKey || (IS_APPLE ? e.ctrlKey : e.metaKey)) {
        return;
      }

      if(secondaryKey) {
        return true;
      }
    }
  }

  return false;
}
