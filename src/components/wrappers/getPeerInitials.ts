import {Chat, User} from '@layer';
import wrapAbbreviation from '@lib/richTextProcessor/wrapAbbreviation';

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
