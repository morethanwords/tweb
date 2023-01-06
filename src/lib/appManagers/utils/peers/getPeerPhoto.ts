import {Chat, ChatPhoto, User, UserProfilePhoto} from '../../../../layer';
import isPeerRestricted from './isPeerRestricted';

export default function getPeerPhoto(peer: User | Chat) {
  if(!peer || isPeerRestricted(peer)) {
    return;
  }

  return (peer as User.user | Chat.channel)?.photo as UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto;
}
