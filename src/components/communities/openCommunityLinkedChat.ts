import type {CommunityPeer} from '@layer';
import type {Dialog} from '@appManagers/appMessagesManager';
import type {AppManagers} from '@lib/managers';
import apiManagerProxy from '@lib/apiManagerProxy';
import appImManager from '@lib/appImManager';
import confirmationPopup from '@components/confirmationPopup';
import {i18n} from '@lib/langPack';
import {toast, toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {
  CommunityLinkedChatKind,
  getCommunityLinkedChatKind,
  getCommunityLinkedChatOpenAction
} from '@components/forumTab/communityChatsModel';
import joinChat from '@components/chat/joinChat';

type CommunityLinkedChatState =
  | {
    kind: CommunityLinkedChatKind,
    visible?: boolean
  }
  | {
    linked: CommunityPeer,
    dialog?: Dialog
  };

export default async function openCommunityLinkedChat(options: {
  communityId: ChatId,
  peerId: PeerId,
  managers: AppManagers,
  joiningPeerIds: Set<PeerId>,
  openPeer?: (peerId: PeerId) => MaybePromise<void>
} & CommunityLinkedChatState) {
  const peer = apiManagerProxy.getPeer(options.peerId);
  const kind = 'kind' in options ?
    options.kind :
    getCommunityLinkedChatKind(peer, options.linked, options.dialog);
  const visible = 'kind' in options ?
    options.visible :
    options.linked.visible;
  const action = getCommunityLinkedChatOpenAction({
    kind,
    peerType: peer?._,
    visible
  });

  if(action === 'open') {
    return options.openPeer ?
      options.openPeer(options.peerId) :
      appImManager.setInnerPeer({peerId: options.peerId});
  }

  if(action === 'hidden') {
    toast(i18n(
      peer?._ === 'user' && peer.pFlags.bot ?
        'Community.HiddenBotInfo' :
        (
          peer?._ === 'channel' && peer.pFlags.broadcast ?
            'Community.HiddenChannelInfo' :
            'Community.HiddenChatInfo'
        )
    ));
    return;
  }

  if(options.joiningPeerIds.has(options.peerId)) {
    return;
  }

  options.joiningPeerIds.add(options.peerId);
  try {
    try {
      await confirmationPopup({
        descriptionLangKey: 'Community.RequestJoinConfirm',
        descriptionLangArgs: [
          await getPeerTitle({peerId: options.peerId, plainText: true})
        ],
        button: {
          langKey: 'RequestJoin.Button'
        }
      });
    } catch{
      return;
    }

    await joinChat({
      peerId: options.peerId,
      managers: options.managers,
      appImManager,
      communityId: options.communityId
    });
  } catch(error) {
    console.error('join Community chat error', error);
    toastNew({langPackKey: 'Error.AnError'});
  } finally {
    options.joiningPeerIds.delete(options.peerId);
  }
}
