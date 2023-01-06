/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Chat, User} from '../../layer';
import wrapAbbreviation from '../../lib/richTextProcessor/wrapAbbreviation';

export default function getPeerInitials(peer: Chat | User) {
  let str = '';
  if(peer) {
    str = (peer as Chat.chat).title ?? [
      (peer as User.user).first_name,
      (peer as User.user).last_name
    ].filter(Boolean).join(' ');
  }

  return wrapAbbreviation(str);
}
