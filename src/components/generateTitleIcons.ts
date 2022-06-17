/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Chat, User } from "../layer";
import rootScope from "../lib/rootScope";
import generateFakeIcon from "./generateFakeIcon";
// import generatePremiumIcon from "./generatePremiumIcon";
import generateVerifiedIcon from "./generateVerifiedIcon";

export default async function generateTitleIcons(peerId: PeerId) {
  const elements: Element[] = [];
  const peer: Chat | User = await rootScope.managers.appPeersManager.getPeer(peerId);
  if((peer as Chat.channel)?.pFlags?.verified) {
    elements.push(generateVerifiedIcon());
  }

  if((peer as Chat.channel).pFlags.fake || (peer as User.user).pFlags.scam) {
    elements.push(generateFakeIcon((peer as User.user).pFlags.scam));
  }

  // if((peer as User.user).pFlags.premium) {
  //   elements.push(generatePremiumIcon());
  // }

  return elements;
}
