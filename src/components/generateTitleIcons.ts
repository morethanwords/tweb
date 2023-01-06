/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '../helpers/mediaSizes';
import {Middleware} from '../helpers/middleware';
import {Chat, Document, EmojiStatus, User} from '../layer';
import rootScope from '../lib/rootScope';
import generateFakeIcon from './generateFakeIcon';
import generatePremiumIcon from './generatePremiumIcon';
import generateVerifiedIcon from './generateVerifiedIcon';
import wrapSticker from './wrappers/sticker';

export default async function generateTitleIcons(
  peerId: PeerId,
  middleware?: Middleware,
  noVerifiedIcon?: boolean,
  noFakeIcon?: boolean,
  noPremiumIcon?: boolean
) {
  const elements: HTMLElement[] = [];
  const peer: Chat | User = await rootScope.managers.appPeersManager.getPeer(peerId);
  if((peer as Chat.channel).pFlags.verified && !noVerifiedIcon) {
    elements.push(generateVerifiedIcon());
  }

  if(((peer as Chat.channel).pFlags.fake || (peer as User.user).pFlags.scam) && !noFakeIcon) {
    elements.push(generateFakeIcon((peer as User.user).pFlags.scam));
  }

  if((peer as User.user).pFlags.premium && !noPremiumIcon) {
    const emojiStatus = (peer as User.user).emoji_status;
    if(emojiStatus && emojiStatus._ !== 'emojiStatusEmpty' && false) {
      const container = document.createElement('span');
      container.classList.add('emoji-status');
      const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument((emojiStatus as EmojiStatus.emojiStatus).document_id);
      const wrap = async(doc: Document.document) => {
        const size = mediaSizes.active.emojiStatus
        const loadPromises: Promise<any>[] = [];
        await wrapSticker({
          doc,
          div: container,
          width: size.width,
          height: size.height,
          loop: 2,
          play: true,
          group: 'EMOJI-STATUS',
          loadPromises,
          middleware
          // group: 'none'
        });

        await Promise.all(loadPromises);
      };

      const p = result.result.then(wrap);
      if(result.cached) {
        await p;
      }

      elements.push(container);
    } else {
      elements.push(generatePremiumIcon());
    }
  }

  return elements;
}
