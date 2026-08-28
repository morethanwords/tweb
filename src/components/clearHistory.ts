import type {AppManagers} from '@lib/managers';
import type {LangPackKey} from '@lib/langPack';
import type {PopupPeerCheckboxOptions} from '@components/popups/peer';
import confirmationPopup from '@components/confirmationPopup';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import canClearHistory from '@appManagers/utils/chats/canClearHistory';
import apiManagerProxy from '@lib/apiManagerProxy';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';

/**
 * The clear-history confirmation, shaped like tdesktop's `DeleteMessagesBox` in its
 * `justClear` mode. The checkbox is the `PeerData::canRevokeFullHistory` half: a plain
 * private chat (never a bot, never ourselves) and a group we created. A broadcast has no
 * checkbox at all — clearing it is always for everyone, which is why only someone who may
 * delete its messages is offered the item in the first place.
 */
export default async function clearHistoryWithConfirmation(options: {
  peerId: PeerId,
  managers: AppManagers
}) {
  const {peerId, managers} = options;
  const peer = apiManagerProxy.getPeer(peerId);
  if(!canClearHistory(peer)) {
    return false;
  }

  // `canClearHistory` has already ruled out everything else this peer could be
  const chat = peer._ === 'chat' || peer._ === 'channel' ? peer : undefined;
  const isBroadcast = chat?._ === 'channel' && !chat.pFlags.megagroup;

  let descriptionLangKey: LangPackKey,
    descriptionLangArgs: any[],
    checkbox: PopupPeerCheckboxOptions;
  if(peer._ === 'user') {
    if(peerId === rootScope.myId) {
      descriptionLangKey = 'AreYouSureClearHistorySavedMessages';
    } else {
      descriptionLangKey = 'AreYouSureClearHistoryWithUser';
      descriptionLangArgs = [await wrapPeerTitle({peerId})];

      if((!peer.pFlags.bot || peer.pFlags.support) && !peer.pFlags.deleted) {
        checkbox = {
          text: 'ClearHistoryOptionAlso',
          textArgs: [await getPeerTitle({peerId, plainText: true, onlyFirstName: true})]
        };
      }
    }
  } else if(isBroadcast) {
    descriptionLangKey = 'AreYouSureClearHistoryWithChannel';
    descriptionLangArgs = [await wrapPeerTitle({peerId})];
  } else {
    descriptionLangKey = 'AreYouSureClearHistory';

    if(chat.pFlags.creator) {
      checkbox = {text: 'DeleteMessagesOptionAlsoChat'};
    }
  }

  let revoke: boolean;
  try {
    revoke = await confirmationPopup({
      peerId,
      titleLangKey: 'AlertClearHistory',
      descriptionLangKey,
      descriptionLangArgs,
      checkbox,
      button: {
        langKey: 'AlertClearHistory',
        isDanger: true
      }
    });
  } catch{
    return false;
  }

  try {
    await managers.appMessagesManager.flushHistory({
      peerId,
      justClear: true,
      revoke: isBroadcast || !!revoke
    });
    return true;
  } catch(error) {
    console.error('clear history error', error);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}
