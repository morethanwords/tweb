import {Chat, User} from '@layer';
import isPeerRestricted from '@appManagers/utils/peers/isPeerRestricted';

export default function getPeerPhoto(peer: User | Chat) {
  if(!peer || isPeerRestricted(peer, false)) {
    return;
  }

  const photo = (peer as User.user | Chat.chat | Chat.channel | Chat.community)?.photo;
  if(photo?._ === 'userProfilePhoto' || photo?._ === 'chatPhoto') {
    return photo;
  }
}
