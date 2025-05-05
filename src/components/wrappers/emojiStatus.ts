/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_WEBM_SUPPORTED} from '../../environment/videoSupport';
import {rgbIntToHex} from '../../helpers/color';
import {MediaSize} from '../../helpers/mediaSize';
import mediaSizes from '../../helpers/mediaSizes';
import {EmojiStatus, DocumentAttribute, Document} from '../../layer';
import rootScope from '../../lib/rootScope';
import {Sparkles} from '../sparkles';
import wrapSticker from './sticker';

export default async function wrapEmojiStatus({
  wrapOptions,
  emojiStatus,
  size = mediaSizes.active.emojiStatus
}: {
  wrapOptions: WrapSomethingOptions,
  emojiStatus: EmojiStatus.emojiStatus | EmojiStatus.emojiStatusCollectible,
  size?: MediaSize
}) {
  const {middleware, animationGroup, textColor} = wrapOptions;
  const container = document.createElement('span');
  container.classList.add('emoji-status');
  const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(emojiStatus.document_id);
  const wrap = async(doc: Document.document) => {
    if(!middleware()) return;
    const loadPromises: Promise<any>[] = [];

    const attribute = doc.attributes.find((attr) => attr._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
    if(attribute && attribute.pFlags.text_color) {
      container.classList.add('emoji-status-text-color');
    }

    await wrapSticker({
      doc,
      div: container,
      width: size.width,
      height: size.height,
      loop: 2,
      play: true,
      group: animationGroup || 'EMOJI-STATUS',
      loadPromises,
      middleware,
      static: doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED,
      textColor: textColor || 'primary-color'
      // group: 'none'
    });

    if(!middleware()) return;
    await Promise.all(loadPromises);
  };

  if(emojiStatus._ === 'emojiStatusCollectible') {
    container.appendChild(Sparkles({mode: 'button', isDiv: true}));
    container.style.setProperty('--sparkles-color', rgbIntToHex(emojiStatus.center_color));
  }

  if(!middleware()) {
    return container;
  }

  const p = result.result.then(wrap);
  if(result.cached) {
    await p;
  }

  return container;
}
