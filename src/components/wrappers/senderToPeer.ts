import {MyMessage} from '@appManagers/appMessagesManager';
import getMessageSenderPeerIdOrName from '@appManagers/utils/messages/getMessageSenderPeerIdOrName';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapPeerTitle from '@components/wrappers/peerTitle';

export default async function wrapSenderToPeer(message: MyMessage) {
  const senderTitle: HTMLElement = document.createElement('span');
  senderTitle.classList.add('sender-title');

  const fromMe = message.fromId === rootScope.myId && message.peerId !== rootScope.myId;
  senderTitle.append(
    fromMe ?
      i18n('FromYou') :
      await wrapPeerTitle({
        ...getMessageSenderPeerIdOrName(message),
        dialog: message.peerId === rootScope.myId
      })
  );

  if(await rootScope.managers.appPeersManager.isAnyGroup(message.peerId) || fromMe) {
    const peerTitle = await wrapPeerTitle({peerId: message.peerId});
    senderTitle.append(' ➝ ', peerTitle);
  }

  return senderTitle;
}
