/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Chat, User } from "../../layer";
import getAbbreviation from "../../lib/richTextProcessor/getAbbreviation";
import rootScope from "../../lib/rootScope";

export default async function getPeerInitials(peerId: PeerId, managers = rootScope.managers) {
  const peer: Chat | User = await managers.appPeersManager.getPeer(peerId);
  return getAbbreviation(
    (peer as Chat.chat).title ?? [(peer as User.user).first_name, (peer as User.user).last_name].filter(Boolean).join(' ')
  );
}
