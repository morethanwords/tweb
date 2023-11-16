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
  if((peer as Chat.channel).pFlags.verified && !noVerifiedIcon) {
    elements.push(generateVerifiedIcon());
  }

  if(((peer as Chat.channel).pFlags.fake || (peer as User.user).pFlags.scam) && !noFakeIcon) {
    elements.push(generateFakeIcon((peer as User.user).pFlags.scam));
  }

  if((peer as User.user).pFlags.premium && !noPremiumIcon && wrapOptions?.middleware) {
    const emojiStatus = (peer as User.user).emoji_status;
    if(emojiStatus && emojiStatus._ !== 'emojiStatusEmpty') {
      const {middleware} = wrapOptions;
      const container = await wrapEmojiStatus({
        emojiStatus,
        wrapOptions
      });

      if(!middleware()) return elements;
      elements.push(container);
    } else {
      elements.push(generatePremiumIcon());
    }
  }

  return elements;
}
