import {useAppSettings} from '@stores/appSettings';
import {IS_MOBILE, IS_APPLE} from '@environment/userAgent';

export default function isSendShortcutPressed(e: KeyboardEvent) {
  if(e.key === 'Enter' && !IS_MOBILE && !e.isComposing) {
    /* if(e.ctrlKey || e.metaKey) {
      this.messageInput.innerHTML += '<br>';
      placeCaretAtEnd(this.message)
      return;
    } */

    const [appSettings] = useAppSettings();
    if(appSettings.sendShortcut === 'enter') {
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
