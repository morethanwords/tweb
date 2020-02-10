import appUsersManager from "./appUsersManager";
import appChatsManager from "./appChatsManager";
import { isObject } from "../utils";
import { RichTextProcessor } from "../richtextprocessor";

const AppPeersManager = {
  getPeerPhoto: (peerID: number) => {
    return peerID > 0
      ? appUsersManager.getUserPhoto(peerID)
      : appChatsManager.getChatPhoto(-peerID);
  },

  getPeerMigratedTo: (peerID: number) => {
    if(peerID >= 0) {
      return false;
    }
    var chat = appChatsManager.getChat(-peerID);
    if(chat && chat.migrated_to && chat.pFlags.deactivated) {
      return AppPeersManager.getPeerID(chat.migrated_to);
    }
    return false;
  },

  getPeerTitle: (peerID: number | any, plainText = false) => {
    let peer: any = {}; 
    if(!isObject(peerID)) {
      peer = AppPeersManager.getPeer(peerID);
    } else peer = peerID;

    let title = '';
    if(peerID > 0) {
      if(peer.first_name) title += peer.first_name;
      if(peer.last_name) title += ' ' + peer.last_name;
  
      if(!title) title = peer.pFlags.deleted ? 'Deleted account' : peer.username;
      else title = title.trim();
    } else {
      title = peer.title;
    }
    
    return plainText ? title : RichTextProcessor.wrapEmojiText(title);
  },

  getOutputPeer: (peerID: number) => {
    if(peerID > 0) {
      return {_: 'peerUser', user_id: peerID};
    }

    var chatID = -peerID;
    if(appChatsManager.isChannel(chatID)) {
      return {_: 'peerChannel', channel_id: chatID};
    }
    return {_: 'peerChat', chat_id: chatID};
  },

  getPeerString: (peerID: number) => {
    if(peerID > 0) {
      return appUsersManager.getUserString(peerID);
    }
    return appChatsManager.getChatString(-peerID);
  },

  getPeerUsername: (peerID: number): string => {
    if(peerID > 0) {
      return appUsersManager.getUser(peerID).username || '';
    }
    return appChatsManager.getChat(-peerID).username || '';
  },

  getPeer: (peerID: number) => {
    return peerID > 0
      ? appUsersManager.getUser(peerID)
      : appChatsManager.getChat(-peerID)
  },

  getPeerID: (peerString: any): number => {
    if(isObject(peerString)) {
      return peerString.user_id
        ? peerString.user_id
        : -(peerString.channel_id || peerString.chat_id);
    }
    var isUser = peerString.charAt(0) == 'u';
    var peerParams = peerString.substr(1).split('_');

    return isUser ? peerParams[0] : -peerParams[0] || 0;
  },

  isChannel: (peerID: number): boolean => {
    return (peerID < 0) && appChatsManager.isChannel(-peerID);
  },

  getInputPeerByID: (peerID: number) => {
    if (!peerID) {
      return {_: 'inputPeerEmpty'}
    }
    if (peerID < 0) {
      var chatID = -peerID
      if (!appChatsManager.isChannel(chatID)) {
        return {
          _: 'inputPeerChat',
          chat_id: chatID
        };
      } else {
        return {
          _: 'inputPeerChannel',
          channel_id: chatID,
          access_hash: appChatsManager.getChat(chatID).access_hash || 0
        };
      }
    }
    return {
      _: 'inputPeerUser',
      user_id: peerID,
      access_hash: appUsersManager.getUser(peerID).access_hash || 0
    };
  },

  isMegagroup: (peerID: number) => {
    return (peerID < 0) && appChatsManager.isMegagroup(-peerID);
  },

  getPeerSearchText: (peerID: number) => {
    var text
    if(peerID > 0) {
      text = '%pu ' + appUsersManager.getUserSearchText(peerID);
    } else if(peerID < 0) {
      var chat = appChatsManager.getChat(-peerID);
      text = '%pg ' + (chat.title || '');
    }
    return text;
  }
};

export default AppPeersManager;
