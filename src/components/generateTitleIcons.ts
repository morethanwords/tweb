/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Chat, User} from '../layer';
import {i18n} from '../lib/langPack';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import generateFakeIcon from './generateFakeIcon';
import generatePremiumIcon from './generatePremiumIcon';
import generateVerifiedIcon from './generateVerifiedIcon';
import {wrapAdaptiveCustomEmoji} from './wrappers/customEmojiSimple';
import wrapEmojiStatus from './wrappers/emojiStatus';

export default async function generateTitleIcons({
  peerId,
  noVerifiedIcon,
  noBotVerifiedIcon,
  noFakeIcon,
  noPremiumIcon,
  noDirectMessagesBadge,
  peer,
  wrapOptions
}: {
  peerId: PeerId,
  wrapOptions: WrapSomethingOptions,
  noVerifiedIcon?: boolean,
  noBotVerifiedIcon?: boolean,
  noFakeIcon?: boolean,
  noPremiumIcon?: boolean,
  noDirectMessagesBadge?: boolean,
  peer?: Chat | User
}): Promise<{ elements: HTMLElement[]; botVerification?: HTMLElement; }> {
  peer ??= apiManagerProxy.getPeer(peerId);
  const elements: HTMLElement[] = [];
  if(!peer) {
    return {elements};
  }

  if(((peer as Chat.channel).pFlags.fake || (peer as User.user).pFlags.scam) && !noFakeIcon) {
    elements.push(generateFakeIcon((peer as User.user).pFlags.scam));
  }

  if(!noPremiumIcon && wrapOptions?.middleware) {
    const emojiStatus = (peer as User.user | Chat.channel).emoji_status;
    const isPremiumFeaturesHidden = await apiManagerProxy.isPremiumFeaturesHidden();
    if(emojiStatus && 'document_id' in emojiStatus && !isPremiumFeaturesHidden) {
      const {middleware} = wrapOptions;
      const container = await wrapEmojiStatus({
        emojiStatus,
        wrapOptions
      });

      if(!middleware()) return {elements};
      elements.push(container);
    } else if((peer as User.user).pFlags.premium && !isPremiumFeaturesHidden) {
      elements.push(generatePremiumIcon());
    }
  }

  if((peer as Chat.channel).pFlags.verified && !noVerifiedIcon) {
    elements.push(generateVerifiedIcon());
  }

  if(peer?._ === 'channel' && peer.pFlags?.monoforum && !noDirectMessagesBadge) {
    const span = document.createElement('span');
    span.append(i18n('ChannelDirectMessages.Badge'));
    span.classList.add('peer-title-direct-badge');
    elements.push(span);
  }

  let botVerification: HTMLElement;
  if((peer as User.user | Chat.channel).bot_verification_icon && !noBotVerifiedIcon) {
    const {container} = wrapAdaptiveCustomEmoji({
      docId: (peer as User.user | Chat.channel).bot_verification_icon,
      size: 24,
      wrapOptions
    })
    botVerification = container;
    container.classList.add('peer-title-bot-verification');
  }

  return {elements, botVerification};
}
