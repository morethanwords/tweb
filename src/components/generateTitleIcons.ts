import { Chat, User } from "../layer";
import appPeersManager from "../lib/appManagers/appPeersManager";
import generateFakeIcon from "./generateFakeIcon";
import generateVerifiedIcon from "./generateVerifiedIcon";

export default function generateTitleIcons(peerId: PeerId) {
  const elements: Element[] = [];
  const peer = appPeersManager.getPeer(peerId);
  if(peer?.pFlags?.verified) {
    elements.push(generateVerifiedIcon());
  }

  if((peer as Chat.channel).pFlags.fake || (peer as User.user).pFlags.scam) {
    elements.push(generateFakeIcon((peer as User.user).pFlags.scam));
  }

  return elements;
}
