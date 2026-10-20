import {MyMessage} from '@appManagers/appMessagesManager';
import getMessageSenderPeerIdOrName from '@appManagers/utils/messages/getMessageSenderPeerIdOrName';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export default async function wrapSenderToPeer(message: MyMessage) {
  const managers = bindManagersToSession(rootScope.managers);
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

  if(await managers.appPeersManager.isAnyGroup(message.peerId) || fromMe) {
    const peerTitle = await wrapPeerTitle({peerId: message.peerId});
    senderTitle.append(' ➝ ', peerTitle);
  }

  return senderTitle;
}
