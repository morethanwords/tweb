import type {MyMessage} from '@appManagers/appMessagesManager';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import {ButtonMenuItemOptions, setButtonMenuItemLoading} from '@components/buttonMenu';
import {toastNew} from '@components/toast';
import copyMediaToClipboard, {CopyableMedia} from '@helpers/copyMediaToClipboard';
import contextMenuController from '@helpers/contextMenuController';

export default function copyMessageMediaWithFeedback(options: {
  message?: MyMessage,
  /** What to copy, when it is not the message's own media — a rich message's is its page's */
  media?: CopyableMedia,
  button: ButtonMenuItemOptions,
  index?: number,
  cleanup?: () => void
}) {
  const {message, button, index, cleanup} = options;
  const media = options.media ?? getMediaFromMessage(message, true, index);
  const buttonElement = button.element;
  setButtonMenuItemLoading(button, true, buttonElement);

  copyMediaToClipboard(media).then(() => {
    toastNew({langPackKey: 'MediaCopied'});
    if(buttonElement?.closest('.btn-menu')?.classList.contains('active')) {
      contextMenuController.close();
    }
  }).catch((error) => {
    console.error('media copy failed', error);
    toastNew({langPackKey: 'MediaCopyFailed'});
  }).finally(() => {
    cleanup?.();
    setButtonMenuItemLoading(button, false, buttonElement);
  });
}
