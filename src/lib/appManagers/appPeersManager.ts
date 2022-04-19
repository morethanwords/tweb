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

import type { Chat, ChatPhoto, DialogPeer, InputChannel, InputDialogPeer, InputNotifyPeer, InputPeer, Peer, Update, User, UserProfilePhoto } from "../../layer";
import type { LangPackKey } from "../langPack";
import { MOUNT_CLASS_TO } from "../../config/debug";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";
import I18n from '../langPack';
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import { getRestrictionReason } from "../../helpers/restrictions";
import isObject from "../../helpers/object/isObject";
import limitSymbols from "../../helpers/string/limitSymbols";

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
  /* public savePeerInstance(peerId: PeerId, instance: any) {
    if(peerId < 0) appChatsManager.saveApiChat(instance);
    else appUsersManager.saveApiUser(instance);
  } */

  public canPinMessage(peerId: PeerId) {
    return peerId.isUser() || appChatsManager.hasRights(peerId.toChatId(), 'pin_messages');
  }

  public getPeerPhoto(peerId: PeerId): UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto {
    if(this.isRestricted(peerId)) {
      return;
    }

    const photo = peerId.isUser() 
      ? appUsersManager.getUserPhoto(peerId.toUserId())
      : appChatsManager.getChatPhoto(peerId.toChatId());

    return photo._ !== 'chatPhotoEmpty' && photo._ !== 'userProfilePhotoEmpty' ? photo : undefined;
  }

  public getPeerMigratedTo(peerId: PeerId) {
    if(peerId.isUser()) {
      return false;
    }

    const chat: Chat.chat = appChatsManager.getChat(peerId.toChatId());
    if(chat && chat.migrated_to && chat.pFlags.deactivated) {
      return this.getPeerId(chat.migrated_to as InputChannel.inputChannel);
    }
    
    return false;
  }

  public getPeerTitle(peerId: PeerId, plainText: true, onlyFirstName?: boolean, _limitSymbols?: number): string;
  public getPeerTitle(peerId: PeerId, plainText?: false, onlyFirstName?: boolean, _limitSymbols?: number): DocumentFragment;
  public getPeerTitle(peerId: PeerId, plainText: boolean, onlyFirstName?: boolean, _limitSymbols?: number): DocumentFragment | string;
  public getPeerTitle(peerId: PeerId, plainText = false, onlyFirstName = false, _limitSymbols?: number): DocumentFragment | string {
    if(!peerId) {
      peerId = rootScope.myId;
    }
    
    let title = '';
    if(peerId.isUser()) {
      const user = appUsersManager.getUser(peerId.toUserId());
      if(user.first_name) title += user.first_name;
      if(user.last_name && (!onlyFirstName || !title)) title += ' ' + user.last_name;
  
      if(!title) title = user.pFlags.deleted ? I18n.format('HiddenName', true) : user.username;
      else title = title.trim();
    } else {
      const chat: Chat.chat = appChatsManager.getChat(peerId.toChatId());
      title = chat.title;

      if(onlyFirstName) {
        title = title.split(' ')[0];
      }
    }

    if(_limitSymbols !== undefined) {
      title = limitSymbols(title, _limitSymbols, _limitSymbols);
    }
    
    return plainText ? title : RichTextProcessor.wrapEmojiText(title);
  }

  public getOutputPeer(peerId: PeerId): Peer {
    if(peerId.isUser()) {
      return {_: 'peerUser', user_id: peerId.toUserId()};
    }

    const chatId = peerId.toChatId();
    if(appChatsManager.isChannel(chatId)) {
      return {_: 'peerChannel', channel_id: chatId};
    }

    return {_: 'peerChat', chat_id: chatId};
  }

  public getPeerString(peerId: PeerId) {
    if(peerId.isUser()) {
      return appUsersManager.getUserString(peerId.toUserId());
    }
    return appChatsManager.getChatString(peerId.toChatId());
  }

  public getPeerUsername(peerId: PeerId): string {
    return this.getPeer(peerId).username || '';
  }

  public getPeer(peerId: PeerId) {
    return peerId.isUser()
      ? appUsersManager.getUser(peerId.toUserId())
      : appChatsManager.getChat(peerId.toChatId());
  }

  public getPeerInitials(peerId: PeerId) {
    const peer: Chat | User = this.getPeer(peerId);
    return RichTextProcessor.getAbbreviation(
      (peer as Chat.chat).title ?? [(peer as User.user).first_name, (peer as User.user).last_name].filter(Boolean).join(' ')
    );
  }

  public getPeerId(peerId: {user_id: UserId} | {channel_id: ChatId} | {chat_id: ChatId} | InputPeer | PeerId | string): PeerId {
    if(peerId !== undefined && ((peerId as string).isPeerId ? (peerId as string).isPeerId() : false)) return peerId as PeerId;
    // if(typeof(peerId) === 'string' && /^[uc]/.test(peerId)) return peerId as PeerId;
    // if(typeof(peerId) === 'number') return peerId;
    else if(isObject(peerId)) {
      const userId = (peerId as Peer.peerUser).user_id;
      if(userId !== undefined) {
        return userId.toPeerId(false);
      }

      const chatId = (peerId as Peer.peerChannel).channel_id || (peerId as Peer.peerChat).chat_id;
      if(chatId !== undefined) {
        return chatId.toPeerId(true);
      }

      return rootScope.myId; // maybe it is an inputPeerSelf
    // } else if(!peerId) return 'u0';
    } else if(!peerId) return NULL_PEER_ID;
    
    const isUser = (peerId as string).charAt(0) === 'u';
    const peerParams = (peerId as string).substr(1).split('_');

    return isUser ? peerParams[0].toPeerId() : (peerParams[0] || '').toPeerId(true);
  }

  public getDialogPeer(peerId: PeerId): DialogPeer {
    return {
      _: 'dialogPeer',
      peer: this.getOutputPeer(peerId)
    };
  }

  public isChannel(peerId: PeerId): boolean {
    return !peerId.isUser() && appChatsManager.isChannel(peerId.toChatId());
  }

  public isMegagroup(peerId: PeerId) {
    return !peerId.isUser() && appChatsManager.isMegagroup(peerId.toChatId());
  }

  public isAnyGroup(peerId: PeerId): boolean {
    return !peerId.isUser() && !appChatsManager.isBroadcast(peerId.toChatId());
  }

  public isBroadcast(peerId: PeerId): boolean {
    return this.isChannel(peerId) && !this.isMegagroup(peerId);
  }

  public isBot(peerId: PeerId): boolean {
    return peerId.isUser() && appUsersManager.isBot(peerId.toUserId());
  }

  public isContact(peerId: PeerId): boolean {
    return peerId.isUser() && appUsersManager.isContact(peerId.toUserId());
  }

  public isUser(peerId: PeerId)/* : peerId is UserId */ {
    return +peerId >= 0;
  }
  
  public isAnyChat(peerId: PeerId) {
    return !this.isUser(peerId);
  }

  public isRestricted(peerId: PeerId) {
    return peerId.isUser() ? appUsersManager.isRestricted(peerId.toUserId()) : appChatsManager.isRestricted(peerId.toChatId());
  }

  public getRestrictionReasonText(peerId: PeerId) {
    const peer: Chat.channel | User.user = this.getPeer(peerId);
    const reason = peer.restriction_reason ? getRestrictionReason(peer.restriction_reason) : undefined;
    if(reason) {
      return reason.text;
    } else {
      return peerId.isUser() ? 'This user is restricted' : 'This chat is restricted';
    }
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

  public getInputNotifyPeerById(peerId: PeerId, ignorePeerId: true): Exclude<InputNotifyPeer, InputNotifyPeer.inputNotifyPeer>;
  public getInputNotifyPeerById(peerId: PeerId, ignorePeerId?: false): InputNotifyPeer.inputNotifyPeer;
  public getInputNotifyPeerById(peerId: PeerId, ignorePeerId?: boolean): InputNotifyPeer {
    if(ignorePeerId) {
      if(peerId.isUser()) {
        return {_: 'inputNotifyUsers'};
      } else {
        if(this.isBroadcast(peerId)) {
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

  public getInputPeerById(peerId: PeerId): InputPeer {
    if(!peerId) {
      return {_: 'inputPeerEmpty'};
    }

    if(!peerId.isUser()) {
      const chatId = peerId.toChatId();
      return appChatsManager.getInputPeer(chatId);
    }

    const userId = peerId.toUserId();
    return appUsersManager.getUserInputPeer(userId);
  }

  public getInputPeerSelf(): InputPeer.inputPeerSelf {
    return {_: 'inputPeerSelf'};
  }

  public getInputDialogPeerById(peerId: PeerId | InputPeer): InputDialogPeer {
    return {
      _: 'inputDialogPeer',
      peer: isObject<InputPeer>(peerId) ? peerId : this.getInputPeerById(peerId)
    };
  }

  public getPeerColorById(peerId: PeerId, pic = true) {
    if(!peerId) return '';

    const idx = DialogColorsMap[Math.abs(+peerId) % 7];
    const color = (pic ? DialogColors : DialogColorsFg)[idx];
    return color;
  }

  public getPeerSearchText(peerId: PeerId) {
    let text: string;
    if(this.isUser(peerId)) {
      text = '%pu ' + appUsersManager.getUserSearchText(peerId.toUserId());
    } else {
      const chat = appChatsManager.getChat(peerId.toChatId());
      text = '%pg ' + (chat.title || '');
    }

    return text;
  }

  public getDialogType(peerId: PeerId): PeerType {
    if(this.isMegagroup(peerId)) {
      return 'megagroup';
    } else if(this.isChannel(peerId)) {
      return 'channel';
    } else if(!this.isUser(peerId)) {
      return 'group';
    } else {
      return peerId === rootScope.myId ? 'saved' : 'chat';
    }
  }

  public getDeleteButtonText(peerId: PeerId): LangPackKey {
    switch(this.getDialogType(peerId)) {
      case 'channel':
        return appChatsManager.hasRights(peerId.toChatId(), 'delete_chat') ? 'ChannelDelete' : 'ChatList.Context.LeaveChannel';

      case 'megagroup':
      case 'group':
        return appChatsManager.hasRights(peerId.toChatId(), 'delete_chat') ? 'DeleteMega' : 'ChatList.Context.LeaveGroup';
      
      default:
        return 'ChatList.Context.DeleteChat';
    }
  }

  public noForwards(peerId: PeerId) {
    if(peerId.isUser()) return false;
    else {
      const chat = appChatsManager.getChatTyped(peerId.toChatId());
      return !!(chat as Chat.chat).pFlags?.noforwards;
    }
  }
}

export type IsPeerType = 'isChannel' | 'isMegagroup' | 'isAnyGroup' | 'isBroadcast' | 'isBot' | 'isContact' | 'isUser' | 'isAnyChat';

[
  'isChannel',
  'isMegagroup',
  'isAnyGroup',
  'isBroadcast',
  'isBot',
  'isContact',
  'isUser',
  'isAnyChat',
].forEach((value) => {
  const newMethod = Array.isArray(value) ? value[0] : value;
  const originMethod = Array.isArray(value) ? value[1] : value;
  // @ts-ignore
  String.prototype[newMethod] = function() {
    // @ts-ignore
    return appPeersManager[originMethod](this.toString());
  };

  // @ts-ignore
  Number.prototype[newMethod] = function() {
    // @ts-ignore
    return appPeersManager[originMethod](this);
  };
});

declare global {
  interface String {
    isChannel(): boolean;
    isMegagroup(): boolean;
    isAnyGroup(): boolean;
    isBroadcast(): boolean;
    isBot(): boolean;
    isContact(): boolean;
    isUser(): boolean;
    isAnyChat(): boolean;
  }

  interface Number {
    isChannel(): boolean;
    isMegagroup(): boolean;
    isAnyGroup(): boolean;
    isBroadcast(): boolean;
    isBot(): boolean;
    isContact(): boolean;
    isUser(): boolean;
    isAnyChat(): boolean;
  }
}

const appPeersManager = new AppPeersManager();
MOUNT_CLASS_TO.appPeersManager = appPeersManager;
export default appPeersManager;
