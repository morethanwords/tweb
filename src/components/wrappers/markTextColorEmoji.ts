import type {MyDocument} from '@appManagers/appDocsManager';
import {DocumentAttribute} from '@layer';

/**
 * Whether a custom emoji is drawn in the text's colour; the container of one that is gets the class a later
 * recolouring finds it by (a selected chat-list row, see changeTitleEmojiColor)
 */
export default function markTextColorEmoji(container: HTMLElement, doc: MyDocument) {
  const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
  const isTextColor = !!attribute?.pFlags.text_color;
  if(isTextColor) {
    container.classList.add('emoji-status-text-color');
  }

  return isTextColor;
}
