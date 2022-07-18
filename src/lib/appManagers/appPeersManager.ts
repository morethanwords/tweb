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
import { getRestrictionReason } from "../../helpers/restrictions";
import isObject from "../../helpers/object/isObject";
import { AppManager } from "./manager";
import getPeerId from "./utils/peers/getPeerId";
import isUser from "./utils/peers/isUser";
import isAnyChat from "./utils/peers/isAnyChat";

export type PeerType = 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';
export class AppPeersManager extends AppManager {
  public get peerId() {
    return this.appUsersManager.userId.toPeerId();
  }
  /* public savePeerInstance(peerId: PeerId, instance: any) {
    if(peerId < 0) appChatsManager.saveApiChat(instance);
    else appUsersManager.saveApiUser(instance);
  } */

  public canPinMessage(peerId: PeerId) {
    return peerId.isUser() || this.appChatsManager.hasRights(peerId.toChatId(), 'pin_messages');
  }

  public getPeerPhoto(peerId: PeerId): UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto {
    if(this.isRestricted(peerId)) {
      return;
    }

    const photo = peerId.isUser() 
      ? this.appUsersManager.getUserPhoto(peerId.toUserId())
      : this.appChatsManager.getChatPhoto(peerId.toChatId());

    return photo._ !== 'chatPhotoEmpty' && photo._ !== 'userProfilePhotoEmpty' ? photo : undefined;
  }

  public getPeerMigratedTo(peerId: PeerId) {
    if(peerId.isUser()) {
      return false;
    }

    const chat: Chat.chat = this.appChatsManager.getChat(peerId.toChatId());
    if(chat && chat.migrated_to && chat.pFlags.deactivated) {
      return getPeerId(chat.migrated_to as InputChannel.inputChannel);
    }
    
    return false;
  }

  public getOutputPeer(peerId: PeerId): Peer {
    if(peerId.isUser()) {
      return {_: 'peerUser', user_id: peerId.toUserId()};
    }

    const chatId = peerId.toChatId();
    if(this.appChatsManager.isChannel(chatId)) {
      return {_: 'peerChannel', channel_id: chatId};
    }

    return {_: 'peerChat', chat_id: chatId};
  }

  public getPeerString(peerId: PeerId) {
    if(peerId.isUser()) {
      return this.appUsersManager.getUserString(peerId.toUserId());
    }
    return this.appChatsManager.getChatString(peerId.toChatId());
  }

  public getPeerUsername(peerId: PeerId): string {
    return this.getPeer(peerId).username || '';
  }

  public getPeer(peerId: PeerId) {
    return peerId.isUser()
      ? this.appUsersManager.getUser(peerId.toUserId())
      : this.appChatsManager.getChat(peerId.toChatId());
  }

  public getDialogPeer(peerId: PeerId): DialogPeer {
    return {
      _: 'dialogPeer',
      peer: this.getOutputPeer(peerId)
    };
  }

  public isChannel(peerId: PeerId): boolean {
    return !peerId.isUser() && this.appChatsManager.isChannel(peerId.toChatId());
  }

  public isMegagroup(peerId: PeerId) {
    return !peerId.isUser() && this.appChatsManager.isMegagroup(peerId.toChatId());
  }

  public isAnyGroup(peerId: PeerId): boolean {
    return !peerId.isUser() && !this.appChatsManager.isBroadcast(peerId.toChatId());
  }

  public isBroadcast(peerId: PeerId): boolean {
    return this.isChannel(peerId) && !this.isMegagroup(peerId);
  }

  public isBot(peerId: PeerId): boolean {
    return peerId.isUser() && this.appUsersManager.isBot(peerId.toUserId());
  }

  public isContact(peerId: PeerId): boolean {
    return peerId.isUser() && this.appUsersManager.isContact(peerId.toUserId());
  }

  public isUser(peerId: PeerId)/* : peerId is UserId */ {
    return isUser(peerId);
  }
  
  public isAnyChat(peerId: PeerId) {
    return isAnyChat(peerId);
  }

  public isRestricted(peerId: PeerId) {
    return peerId.isUser() ? this.appUsersManager.isRestricted(peerId.toUserId()) : this.appChatsManager.isRestricted(peerId.toChatId());
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
      return this.appChatsManager.getInputPeer(chatId);
    }

    const userId = peerId.toUserId();
    return this.appUsersManager.getUserInputPeer(userId);
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

  public getPeerSearchText(peerId: PeerId) {
    let text: string;
    if(this.isUser(peerId)) {
      text = '%pu ' + this.appUsersManager.getUserSearchText(peerId.toUserId());
    } else {
      const chat = this.appChatsManager.getChat(peerId.toChatId());
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
      return peerId === this.peerId ? 'saved' : 'chat';
    }
  }

  public getDeleteButtonText(peerId: PeerId): Extract<LangPackKey, 'ChannelDelete' | 'ChatList.Context.LeaveChannel' | 'DeleteMega' | 'ChatList.Context.LeaveGroup' | 'ChatList.Context.DeleteChat'> {
    switch(this.getDialogType(peerId)) {
      case 'channel':
        return this.appChatsManager.hasRights(peerId.toChatId(), 'delete_chat') ? 'ChannelDelete' : 'ChatList.Context.LeaveChannel';

      case 'megagroup':
      case 'group':
        return this.appChatsManager.hasRights(peerId.toChatId(), 'delete_chat') ? 'DeleteMega' : 'ChatList.Context.LeaveGroup';
      
      default:
        return 'ChatList.Context.DeleteChat';
    }
  }

  public noForwards(peerId: PeerId) {
    if(peerId.isUser()) return false;
    else {
      const chat = this.appChatsManager.getChatTyped(peerId.toChatId());
      return !!(chat as Chat.chat).pFlags?.noforwards;
    }
  }
}

export type IsPeerType = 'isChannel' | 'isMegagroup' | 'isAnyGroup' | 'isBroadcast' | 'isBot' | 'isContact' | 'isUser' | 'isAnyChat';
