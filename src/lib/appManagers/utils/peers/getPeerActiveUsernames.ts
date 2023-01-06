import {Chat, User} from '../../../../layer';

export default function getPeerActiveUsernames(peer: User | Chat) {
  if(!peer) {
    return [];
  }

  const usernames = (peer as Chat.channel).usernames;
  if(usernames) {
    return usernames
    .filter((username) => username.pFlags.active)
    // .sort((a, b) => +!!b.pFlags.editable - +!!a.pFlags.editable)
    .map((username) => username.username);
  }

  return (peer as Chat.channel).username ? [(peer as Chat.channel).username] : [];
}
