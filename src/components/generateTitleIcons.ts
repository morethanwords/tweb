/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Chat, User} from '../layer';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import generateFakeIcon from './generateFakeIcon';
import generatePremiumIcon from './generatePremiumIcon';
import generateVerifiedIcon from './generateVerifiedIcon';
import wrapEmojiStatus from './wrappers/emojiStatus';

export default async function generateTitleIcons({
  peerId,
  noVerifiedIcon,
  noFakeIcon,
  noPremiumIcon,
  peer,
  wrapOptions
}: {
  peerId: PeerId,
  wrapOptions: WrapSomethingOptions,
  noVerifiedIcon?: boolean,
  noFakeIcon?: boolean,
  noPremiumIcon?: boolean,
  peer?: Chat | User
}) {
  peer ??= apiManagerProxy.getPeer(peerId);
  const elements: HTMLElement[] = [];
  if(!peer) {
    return elements;
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

      if(!middleware()) return elements;
      elements.push(container);
    } else if((peer as User.user).pFlags.premium && !isPremiumFeaturesHidden) {
      elements.push(generatePremiumIcon());
    }
  }

  if((peer as Chat.channel).pFlags.verified && !noVerifiedIcon) {
    elements.push(generateVerifiedIcon());
  }

  return elements;
}
