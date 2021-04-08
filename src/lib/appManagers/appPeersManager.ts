/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import { isObject } from "../../helpers/object";
import { ChatPhoto, DialogPeer, InputDialogPeer, InputNotifyPeer, InputPeer, Peer, Update, UserProfilePhoto } from "../../layer";
import { LangPackKey } from "../langPack";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";

// https://github.com/eelcohn/Telegram-API/wiki/Calculating-color-for-a-Telegram-user-on-IRC
/*
  HTML-color  IRC-color  Description
  #c03d33     4          red
  #4fad2d     3          green
  #d09306     7          yellow
  #168acd     10         blue
  #8544d6     6          purple
  #cd4073     13         pink
  #2996ad     11         sea
  #ce671b     5          orange
  */
const DialogColorsFg = ['#fc5c51', '#0fb297', '#d09306', '#3d72ed', '#895dd5', '#cd4073', '#00c1a6', '#fa790f'];
const DialogColors = ['red', 'green', 'yellow', 'blue', 'violet', 'pink', 'cyan', 'orange'];
const DialogColorsMap = [0, 7, 4, 1, 6, 3, 5];

export type PeerType = 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';
export class AppPeersManager {
  constructor() {
    rootScope.on('apiUpdate', (e) => {
      const update = e as Update;
      //console.log('on apiUpdate', update);
      switch(update._) {
        case 'updatePeerBlocked': {
          rootScope.broadcast('peer_block', {peerId: this.getPeerId(update.peer_id), blocked: update.blocked});
          break;
        }
      }
    });
  }
  /* public savePeerInstance(peerId: number, instance: any) {
    if(peerId < 0) appChatsManager.saveApiChat(instance);
    else appUsersManager.saveApiUser(instance);
  } */

  public canPinMessage(peerId: number) {
    return peerId > 0 || appChatsManager.hasRights(-peerId, 'pin_messages');
  }

  public getPeerPhoto(peerId: number): UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto {
    const photo = peerId > 0
      ? appUsersManager.getUserPhoto(peerId)
      : appChatsManager.getChatPhoto(-peerId);

    return photo._ !== 'chatPhotoEmpty' && photo._ !== 'userProfilePhotoEmpty' ? photo : null;
  }

  public getPeerMigratedTo(peerId: number) {
    if(peerId >= 0) {
      return false;
    }

    let chat = appChatsManager.getChat(-peerId);
    if(chat && chat.migrated_to && chat.pFlags.deactivated) {
      return this.getPeerId(chat.migrated_to);
    }
    
    return false;
  }

  public getPeerTitle(peerId: number | any, plainText = false, onlyFirstName = false) {
    if(!peerId) {
      peerId = rootScope.myId;
    }
    
    let peer: any = {}; 
    if(!isObject(peerId)) {
      peer = this.getPeer(peerId);
    } else peer = peerId;

    let title = '';
    if(peerId > 0) {
      if(peer.first_name) title += peer.first_name;
      if(peer.last_name) title += ' ' + peer.last_name;
  
      if(!title) title = peer.pFlags.deleted ? 'Deleted Account' : peer.username;
      else title = title.trim();
    } else {
      title = peer.title;
    }

    if(onlyFirstName) {
      title = title.split(' ')[0];
    }
    
    return plainText ? title : RichTextProcessor.wrapEmojiText(title);
  }
  
  public getOutputPeer(peerId: number): Peer {
    if(peerId > 0) {
      return {_: 'peerUser', user_id: peerId};
    }

    let chatId = -peerId;
    if(appChatsManager.isChannel(chatId)) {
      return {_: 'peerChannel', channel_id: chatId};
    }

    return {_: 'peerChat', chat_id: chatId};
  }

  public getPeerString(peerId: number) {
    if(peerId > 0) {
      return appUsersManager.getUserString(peerId);
    }
    return appChatsManager.getChatString(-peerId);
  }

  public getPeerUsername(peerId: number): string {
    if(peerId > 0) {
      return appUsersManager.getUser(peerId).username || '';
    }
    return appChatsManager.getChat(-peerId).username || '';
  }

  public getPeer(peerId: number) {
    return peerId > 0
      ? appUsersManager.getUser(peerId)
      : appChatsManager.getChat(-peerId)
  }

  public getPeerId(peerId: Peer | InputPeer | number | string): number {
    if(typeof(peerId) === 'number') return peerId;
    else if(isObject(peerId)) return (peerId as Peer.peerUser).user_id || -((peerId as Peer.peerChannel).channel_id || (peerId as Peer.peerChat).chat_id);
    else if(!peerId) return 0;
    
    const isUser = (peerId as string).charAt(0) === 'u';
    const peerParams = (peerId as string).substr(1).split('_');

    return isUser ? +peerParams[0] : -peerParams[0] || 0;
  }

  public getDialogPeer(peerId: number): DialogPeer {
    return {
      _: 'dialogPeer',
      peer: this.getOutputPeer(peerId)
    };
  }

  public isChannel(peerId: number): boolean {
    return (peerId < 0) && appChatsManager.isChannel(-peerId);
  }

  public isMegagroup(peerId: number) {
    return (peerId < 0) && appChatsManager.isMegagroup(-peerId);
  }

  public isAnyGroup(peerId: number): boolean {
    return (peerId < 0) && !appChatsManager.isBroadcast(-peerId);
  }

  public isBroadcast(peerId: number): boolean {
    return this.isChannel(peerId) && !this.isMegagroup(peerId);
  }

  public isBot(peerId: number): boolean {
    return (peerId > 0) && appUsersManager.isBot(peerId);
  }

  /* public getInputPeer(peerString: string): InputPeer {
    var firstChar = peerString.charAt(0);
    var peerParams = peerString.substr(1).split('_');
    let id = +peerParams[0];

    if(firstChar === 'u') {
      //appUsersManager.saveUserAccess(id, peerParams[1]);

      return {
        _: 'inputPeerUser',
        user_id: id,
        access_hash: peerParams[1]
      };
    } else if(firstChar === 'c' || firstChar === 's') {
      //appChatsManager.saveChannelAccess(id, peerParams[1]);
      if(firstChar === 's') {
        appChatsManager.saveIsMegagroup(id);
      }

      return {
        _: 'inputPeerChannel',
        channel_id: id,
        access_hash: peerParams[1] || '0'
      };
    } else {
      return {
        _: 'inputPeerChat',
        chat_id: id
      };
    }
  } */

  public getInputNotifyPeerById(peerId: number, ignorePeerId: true): Exclude<InputNotifyPeer, InputNotifyPeer.inputNotifyPeer>;
  public getInputNotifyPeerById(peerId: number, ignorePeerId?: false): InputNotifyPeer.inputNotifyPeer;
  public getInputNotifyPeerById(peerId: number, ignorePeerId?: boolean): InputNotifyPeer {
    if(ignorePeerId) {
      if(peerId > 0) {
        return {_: 'inputNotifyUsers'};
      } else {
        if(appPeersManager.isBroadcast(peerId)) {
          return {_: 'inputNotifyBroadcasts'};
        } else {
          return {_: 'inputNotifyChats'};
        }
      }
    } else {
      return {
        _: 'inputNotifyPeer', 
        peer: this.getInputPeerById(peerId)
      };
    }
  }

  public getInputPeerById(peerId: number): InputPeer {
    if(!peerId) {
      return {_: 'inputPeerEmpty'};
    }

    if(peerId < 0) {
      const chatId = -peerId;
      if(!appChatsManager.isChannel(chatId)) {
        return appChatsManager.getChatInputPeer(chatId);
      } else {
        return appChatsManager.getChannelInputPeer(chatId);
      }
    }

    return {
      _: 'inputPeerUser',
      user_id: peerId,
      access_hash: appUsersManager.getUser(peerId).access_hash
    };
  }

  public getInputDialogPeerById(peerId: number): InputDialogPeer {
    return {
      _: 'inputDialogPeer',
      peer: this.getInputPeerById(peerId)
    }
  }

  public getPeerColorById(peerId: number, pic = true) {
    if(!peerId) return '';

    const idx = DialogColorsMap[(peerId < 0 ? -peerId : peerId) % 7];
    const color = (pic ? DialogColors : DialogColorsFg)[idx];
    return color;
  }

  public getPeerSearchText(peerId: number) {
    let text;
    if(peerId > 0) {
      text = '%pu ' + appUsersManager.getUserSearchText(peerId);
    } else if(peerId < 0) {
      const chat = appChatsManager.getChat(-peerId);
      text = '%pg ' + (chat.title || '');
    }
    return text;
  }

  public getDialogType(peerId: number): PeerType {
    if(appPeersManager.isMegagroup(peerId)) {
      return 'megagroup';
    } else if(appPeersManager.isChannel(peerId)) {
      return 'channel';
    } else if(peerId < 0) {
      return 'group';
    } else {
      return peerId === rootScope.myId ? 'saved' : 'chat';
    }
  }

  public getDeleteButtonText(peerId: number): LangPackKey {
    switch(this.getDialogType(peerId)) {
      case 'channel':
        return 'ChatList.Context.LeaveChannel';

      case 'megagroup':
        return 'ChatList.Context.LeaveGroup';

      case 'group':
        return 'ChatList.Context.DeleteAndExit';
      
      default:
        return 'ChatList.Context.DeleteChat';
    }
  }
}

const appPeersManager = new AppPeersManager();
MOUNT_CLASS_TO.appPeersManager = appPeersManager;
export default appPeersManager;
