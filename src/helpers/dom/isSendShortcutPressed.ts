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

export function isNewLineShortcutPressed(e: KeyboardEvent) {
  if(e.key !== 'Enter' || IS_MOBILE || e.isComposing || e.altKey) return false;

  const [appSettings] = useAppSettings();
  if(appSettings.sendShortcut === 'enter') {
    return e.shiftKey && !e.ctrlKey && !e.metaKey;
  }

  return !e.shiftKey && !e.ctrlKey && !e.metaKey;
}

const SEND_SHORTCUT_LEFT = Symbol('sendShortcutLeft');
type LeftSendShortcutEvent = KeyboardEvent & {[SEND_SHORTCUT_LEFT]?: true};

/**
 * A message field whose popup sends on the shortcut keeps its editor from breaking the line on it,
 * which prevents the event's default — so it marks the event for the popup to still send on
 * (`PopupElement`'s confirm-on-Enter) rather than read it as handled by someone else.
 */
export function leaveSendShortcut(e: KeyboardEvent) {
  (e as LeftSendShortcutEvent)[SEND_SHORTCUT_LEFT] = true;
}

export function isSendShortcutLeft(e: KeyboardEvent) {
  return !!(e as LeftSendShortcutEvent)[SEND_SHORTCUT_LEFT];
}
