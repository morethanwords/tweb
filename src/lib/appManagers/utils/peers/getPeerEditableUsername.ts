import {Chat, User} from '../../../../layer';

export default function getPeerEditableUsername(peer: User.user | Chat.channel) {
  if(peer.username) {
    return peer.username;
  }

  const usernames = peer.usernames;
  const username = usernames?.find((username) => username.pFlags.editable);
  return username?.username;
}
