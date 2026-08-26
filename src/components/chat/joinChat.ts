import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import handleCommunityChatJoinError
from '@components/communities/handleCommunityChatJoinError';
import apiManagerProxy from '@lib/apiManagerProxy';
import defaultAppImManager, {type AppImManager} from '@lib/appImManager';
import type {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';


export default async function joinChat(options: {
  peerId: PeerId,
  managers: AppManagers,
  appImManager?: AppImManager,
  communityId?: ChatId
}) {
  const {peerId, managers} = options;
  const chatId = peerId.toChatId();

  try {
    const isChannel = await managers.appChatsManager.isChannel(chatId);
    const result = await handleChannelsTooMuch(() => {
      return isChannel ?
        managers.appChatsManager.joinChannel(chatId) :
        managers.appChatsManager.addChatUser(chatId, rootScope.myId);
    });
    if(result?._ === 'chatInviteJoinWebView') {
      void (options.appImManager ?? defaultAppImManager).openJoinChatWebView(result);
    }
  } catch(error) {
    const chat = apiManagerProxy.getChat(chatId);
    const isBroadcast = (
      chat?._ === 'channel' ||
      chat?._ === 'channelForbidden'
    ) && !!chat.pFlags.broadcast;
    if(handleCommunityChatJoinError({
      error: error as ApiError,
      isBroadcast,
      communityId: options.communityId ?? (
        chat?._ === 'channel' && chat.linked_community_id ?
          chat.linked_community_id.toChatId() :
          undefined
      ),
      managers
    })) {
      return;
    }

    throw error;
  }
}
