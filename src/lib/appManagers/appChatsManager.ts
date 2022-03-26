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
import copy from "../../helpers/object/copy";
import deepEqual from "../../helpers/object/deepEqual";
import isObject from "../../helpers/object/isObject";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import { ChannelParticipant, ChannelsCreateChannel, Chat, ChatAdminRights, ChatBannedRights, ChatParticipant, ChatPhoto, InputChannel, InputChatPhoto, InputFile, InputPeer, Update, Updates } from "../../layer";
import apiManagerProxy from "../mtproto/mtprotoworker";
import apiManager from '../mtproto/mtprotoworker';
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appPeersManager from "./appPeersManager";
import appStateManager from "./appStateManager";
import appUsersManager from "./appUsersManager";
import { isRestricted } from "../../helpers/restrictions";
import findAndSplice from "../../helpers/array/findAndSplice";

export type Channel = Chat.channel;
export type ChatRights = keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags'] | 'change_type' | 'change_permissions' | 'delete_chat' | 'view_participants';

export class AppChatsManager {
  private storage = appStateManager.storages.chats;
  
  private chats: {[id: ChatId]: Chat.channel | Chat.chat | any};
  //private usernames: any;
  //private channelAccess: any;
  //private megagroups: {[id: number]: true};

  constructor() {
    this.clear(true);

    rootScope.addMultipleEventsListeners({
      /* updateChannel: (update) => {
        const channelId = update.channel_id;
        //console.log('updateChannel:', update);
        rootScope.broadcast('channel_settings', {channelId});
      }, */

      updateChannelParticipant: (update) => {
        apiManagerProxy.clearCache('channels.getParticipants', (params) => {
          return (params.channel as InputChannel.inputChannel).channel_id === update.channel_id;
        });
      },

      updateChatDefaultBannedRights: (update) => {
        const chatId = appPeersManager.getPeerId(update.peer).toChatId();
        const chat: Chat.chat = this.chats[chatId];
        if(chat) {
          chat.default_banned_rights = update.default_banned_rights;
          rootScope.dispatchEvent('chat_update', chatId);
        }
      }
    });

    appStateManager.getState().then((state) => {
      const chats = appStateManager.storagesResults.chats;
      if(chats.length) {
        for(let i = 0, length = chats.length; i < length; ++i) {
          const chat = chats[i];
          if(chat) {
            this.chats[chat.id] = chat;
          }
        }
      }

      appStateManager.addEventListener('peerNeeded', (peerId) => {
        if(peerId.isUser() || this.storage.getFromCache(peerId.toChatId())) {
          return;
        }

        this.storage.set({
          [peerId.toChatId()]: this.getChat(peerId.toChatId())
        });
      });

      appStateManager.addEventListener('peerUnneeded', (peerId) => {
        if(peerId.isUser() || !this.storage.getFromCache(peerId.toChatId())) {
          return;
        }

        this.storage.delete(peerId.toChatId());
      });
    });
  }

  public clear(init = false) {
    if(!init) {
      const chats = appStateManager.storagesResults.chats;
      for(const chatId in this.chats) {
        if(!chatId) continue;
        if(!appStateManager.isPeerNeeded(chatId.toPeerId(true))) {
          /* const chat = this.chats[chatId];
          if(chat.username) {
            delete this.usernames[cleanUsername(chat.username)];
          } */
          
          findAndSplice(chats, (chat) => chat.id === chatId);
          this.storage.delete(chatId);
          delete this.chats[chatId];
        }
      }
    } else {
      this.chats = {};
    }
  }

  public saveApiChats(apiChats: any[], override?: boolean) {
    if((apiChats as any).saved) return;
    (apiChats as any).saved = true;
    apiChats.forEach(chat => this.saveApiChat(chat, override));
  }

  public saveApiChat(chat: Chat, override?: boolean) {
    if(chat._ === 'chatEmpty') return;
    /* if(chat._ !== 'chat' && chat._ !== 'channel') {
      return;
    } */
    
    // * exclude from state
    // defineNotNumerableProperties(chat, ['rTitle', 'initials']);

    const oldChat: Exclude<Chat, Chat.chatEmpty> = this.chats[chat.id];

    /* if(oldChat && !override) {
      return;
    } */

    if((chat as Chat.chat).pFlags === undefined) {
      (chat as Chat.chat).pFlags = {};
    }

    if((chat as Chat.channel).pFlags.min && oldChat !== undefined) {
      return;
    }

    chat.initials = RichTextProcessor.getAbbreviation(chat.title);

    if(chat._ === 'channel' &&
        chat.participants_count === undefined &&
        oldChat !== undefined &&
        (oldChat as Chat.channel).participants_count) {
      chat.participants_count = (oldChat as Chat.channel).participants_count;
    }

    /* if(chat.username) {
      let searchUsername = searchIndexManager.cleanUsername(chat.username);
      this.usernames[searchUsername] = chat.id;
    } */

    let changedPhoto = false, changedTitle = false;
    if(oldChat === undefined) {
      this.chats[chat.id] = chat;
    } else {
      const oldPhotoId = ((oldChat as Chat.chat).photo as ChatPhoto.chatPhoto)?.photo_id;
      const newPhotoId = ((chat as Chat.chat).photo as ChatPhoto.chatPhoto)?.photo_id;
      if(oldPhotoId !== newPhotoId) {
        changedPhoto = true;
      }

      if(oldChat.title !== chat.title) {
        changedTitle = true;
      }

      safeReplaceObject(oldChat, chat);
      rootScope.dispatchEvent('chat_update', chat.id);
    }

    const peerId = chat.id.toPeerId(true);
    if(changedPhoto) {
      rootScope.dispatchEvent('avatar_update', peerId);
    }

    if(changedTitle) {
      rootScope.dispatchEvent('peer_title_edit', peerId);
    }

    if(appStateManager.isPeerNeeded(peerId)) {
      this.storage.set({
        [chat.id]: chat
      });
    }
  }

  public getChat(id: ChatId) {
    return this.chats[id] || {_: 'chatEmpty', id, deleted: true, access_hash: '', pFlags: {}/* this.channelAccess[id] */};
  }

  public getChatTyped(id: ChatId): Chat {
    return this.getChat(id);
  }

  public combineParticipantBannedRights(id: ChatId, rights: ChatBannedRights) {
    const chat: Chat.channel = this.getChat(id);

    if(chat.default_banned_rights) {
      rights = copy(rights);
      const defaultRights = chat.default_banned_rights.pFlags;
      for(let i in defaultRights) {
        // @ts-ignore
        rights.pFlags[i] = defaultRights[i];
      }
    }

    return rights;
  }

  /**
   * Check the user's ability to do an action in chat
   * @param id 
   * @param action creator can still send messages to left channel. so this function shows server rights. see canSendToPeer for local rights in messages manager.
   * @param rights do not provide this parameter when checking rights for self
   * @param isThread 
   * @returns 
   */
  public hasRights(id: ChatId, action: ChatRights, rights?: ChatAdminRights | ChatBannedRights, isThread?: boolean) {
    const chat: Chat = this.getChat(id);
    if(chat._ === 'chatEmpty') return false;

    if((chat as Chat.chat).pFlags.deactivated && action !== 'view_messages') {
      return false;
    }

    const isCheckingRightsForSelf = rights === undefined;
    if((chat as Chat.chat).pFlags.creator && isCheckingRightsForSelf) {
      return true;
    }

    if(chat._ === 'chatForbidden' ||
        chat._ === 'channelForbidden' ||
        (chat as Chat.chat).pFlags.kicked ||
        (chat.pFlags.left && !(chat as Chat.channel).pFlags.megagroup)) {
      return false;
    }

    // const adminRights = chat.admin_rights;
    // const bannedRights = (chat as Chat.channel).banned_rights || chat.default_banned_rights;

    if(!rights) {
      rights = chat.admin_rights || (chat as Chat.channel).banned_rights || chat.default_banned_rights;

      if(!rights) {
        return false;
      }
    }

    let myFlags: Partial<{[flag in keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags']]: true}> = {};
    if(rights) {
      myFlags = rights.pFlags as any;
    }

    // const adminFlags = adminRights?.pFlags || {};
    // const bannedFlags = bannedRights?.pFlags || {};

    switch(action) {
      case 'embed_links':
      case 'send_games':
      case 'send_gifs':
      case 'send_inline':
      case 'send_media':
      case 'send_messages':
      case 'send_polls':
      case 'send_stickers': {
        if(!isThread && chat.pFlags.left) {
          return false;
        }

        if(rights._ === 'chatBannedRights' && myFlags[action]) {
          return false;
        }

        if(chat._ === 'channel') {
          if(!chat.pFlags.megagroup && !myFlags.post_messages) {
            return false;
          }
        }

        break;
      }

      // * revoke foreign messages
      case 'delete_messages':
      case 'manage_call': {
        return !!myFlags[action];
      }

      case 'pin_messages': {
        return rights._ === 'chatAdminRights' ? myFlags[action] || !!myFlags.post_messages : !myFlags[action];
      }

      // case 'change_info': {
        // return adminRights || isCheckingRightsForSelf ? adminFlags[action] : !myFlags[action];
      // }

      case 'change_info':
      case 'invite_users': {
        return rights._ === 'chatAdminRights' ? myFlags[action] : !myFlags[action];
      }

      // * only creator can do that
      case 'change_type':
      case 'delete_chat': {
        return false;
      }

      case 'ban_users':
      case 'change_permissions': {
        return rights._ === 'chatAdminRights' && !!myFlags['ban_users'];
      }

      case 'view_participants': {
        return !!(chat._ === 'chat' || !chat.pFlags.broadcast || chat.pFlags.creator || chat.admin_rights);
      }
    }

    return true;
  }

  public editChatDefaultBannedRights(id: ChatId, banned_rights: ChatBannedRights) {
    const chat: Chat.chat = this.getChat(id);
    if(chat.default_banned_rights) {
      if(chat.default_banned_rights.until_date === banned_rights.until_date && deepEqual(chat.default_banned_rights.pFlags, banned_rights.pFlags)) {
        return Promise.resolve();
      }
    }
    
    return apiManager.invokeApi('messages.editChatDefaultBannedRights', {
      peer: appPeersManager.getInputPeerById(id.toPeerId(true)),
      banned_rights
    }).then(this.onChatUpdated.bind(this, id));
  }

  /* public resolveUsername(username: string) {
    return this.usernames[username] || 0;
  } */

  /* public saveChannelAccess(id: ChatId, accessHash: string) {
    this.channelAccess[id] = accessHash;
  } */

  /* public saveIsMegagroup(id: ChatId) {
    this.megagroups[id] = true;
  } */

  public isChannel(id: ChatId) {
    const chat = this.chats[id];
    return !!(chat && (chat._ === 'channel' || chat._ === 'channelForbidden')/*  || this.channelAccess[id] */);
  }

  public isMegagroup(id: ChatId) {
    /* if(this.megagroups[id]) {
      return true;
    } */

    const chat: Chat = this.chats[id];
    return !!(chat && chat._ === 'channel' && chat.pFlags.megagroup);
  }

  public isBroadcast(id: ChatId) {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public isInChat(id: ChatId) {
    let good = true;
    const chat: Chat = this.getChat(id);
    if(chat._ === 'channelForbidden' 
      || chat._ === 'chatForbidden' 
      || chat._ === 'chatEmpty' 
      || (chat as Chat.chat).pFlags.left 
      || (chat as Chat.chat).pFlags.kicked 
      || (chat as Chat.chat).pFlags.deactivated) {
      good = false;
    }

    return good;
  }

  public getChannelInput(id: ChatId): InputChannel {
    const chat: Chat = this.getChat(id);
    if(chat._ === 'chatEmpty' || !(chat as Chat.channel).access_hash) {
      return {
        _: 'inputChannelEmpty'
      };
    } else {
      return {
        _: 'inputChannel',
        channel_id: id,
        access_hash: (chat as Chat.channel).access_hash/*  || this.channelAccess[id] */ || '0'
      };
    }
  }

  public getInputPeer(id: ChatId) {
    return this.isChannel(id) ? this.getChannelInputPeer(id) : this.getChatInputPeer(id);
  }

  public getChatInputPeer(id: ChatId): InputPeer.inputPeerChat {
    return {
      _: 'inputPeerChat',
      chat_id: id
    };
  }

  public getChannelInputPeer(id: ChatId): InputPeer.inputPeerChannel {
    return {
      _: 'inputPeerChannel',
      channel_id: id,
      access_hash: this.getChat(id).access_hash/*  || this.channelAccess[id] */ || 0
    };
  }

  public hasChat(id: ChatId, allowMin?: true) {
    const chat = this.chats[id];
    return isObject(chat) && (allowMin || !chat.pFlags.min);
  }

  public getChatPhoto(id: ChatId) {
    const chat: Chat.chat = this.getChat(id);

    return chat && chat.photo || {
      _: 'chatPhotoEmpty'
    };
  }

  public getChatString(id: ChatId) {
    const chat = this.getChat(id);
    if(this.isChannel(id)) {
      return (this.isMegagroup(id) ? 's' : 'c') + id + '_' + chat.access_hash;
    }
    return 'g' + id;
  }

  /* public wrapForFull(id: number, fullChat: any) {
    const chatFull = copy(fullChat);
    const chat = this.getChat(id);

    if(!chatFull.participants_count) {
      chatFull.participants_count = chat.participants_count;
    }

    if(chatFull.participants &&
        chatFull.participants._ === 'chatParticipants') {
      chatFull.participants.participants = this.wrapParticipants(id, chatFull.participants.participants);
    }

    if(chatFull.about) {
      chatFull.rAbout = RichTextProcessor.wrapRichText(chatFull.about, {noLinebreaks: true});
    }

    //chatFull.peerString = this.getChatString(id);
    chatFull.chat = chat;

    return chatFull;
  }

  public wrapParticipants(id: number, participants: any[]) {
    const chat = this.getChat(id);
    const myId = appUsersManager.getSelf().id;
    if(this.isChannel(id)) {
      const isAdmin = chat.pFlags.creator;
      participants.forEach((participant) => {
        participant.canLeave = myId === participant.user_id;
        participant.canKick = isAdmin && participant._ === 'channelParticipant';

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    } else {
      const isAdmin = chat.pFlags.creator || chat.pFlags.admins_enabled && chat.pFlags.admin;
      participants.forEach((participant) => {
        participant.canLeave = myId === participant.user_id;
        participant.canKick = !participant.canLeave && (
          chat.pFlags.creator ||
          participant._ === 'chatParticipant' && (isAdmin || myId === participant.inviter_id)
        );

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    }

    return participants;
  } */

  public createChannel(options: ChannelsCreateChannel): Promise<ChatId> {
    return apiManager.invokeApi('channels.createChannel', options).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);

      const channelId = (updates as any).chats[0].id;
      rootScope.dispatchEvent('history_focus', {peerId: channelId.toPeerId(true)});

      return channelId;
    });
  }

  public inviteToChannel(id: ChatId, userIds: UserId[]) {
    const input = this.getChannelInput(id);
    const usersInputs = userIds.map(u => appUsersManager.getUserInput(u));

    return apiManager.invokeApi('channels.inviteToChannel', {
      channel: input,
      users: usersInputs
    }).then(this.onChatUpdated.bind(this, id));
  }

  public createChat(title: string, userIds: UserId[]): Promise<ChatId> {
    return apiManager.invokeApi('messages.createChat', {
      users: userIds.map(u => appUsersManager.getUserInput(u)),
      title
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);

      const chatId = (updates as any as Updates.updates).chats[0].id;
      rootScope.dispatchEvent('history_focus', {peerId: chatId.toPeerId(true)});

      return chatId;
    });
  }

  private onChatUpdated = (chatId: ChatId, updates?: any) => {
    //console.log('onChatUpdated', chatId, updates);

    apiUpdatesManager.processUpdateMessage(updates);
    if(updates?.updates?.length && this.isChannel(chatId)) {
      rootScope.dispatchEvent('invalidate_participants', chatId);
    }
  };

  public leaveChannel(id: ChatId) {
    return apiManager.invokeApi('channels.leaveChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public joinChannel(id: ChatId) {
    return apiManager.invokeApi('channels.joinChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public addChatUser(id: ChatId, userId: UserId, fwdLimit = 100) {
    return apiManager.invokeApi('messages.addChatUser', {
      chat_id: id,
      user_id: appUsersManager.getUserInput(userId),
      fwd_limit: fwdLimit
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChatUser(id: ChatId, userId: UserId) {
    return apiManager.invokeApi('messages.deleteChatUser', {
      chat_id: id,
      user_id: appUsersManager.getUserInput(userId)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public leaveChat(id: ChatId) {
    return this.deleteChatUser(id, appUsersManager.getSelf().id);
  }

  public leave(id: ChatId) {
    return this.isChannel(id) ? this.leaveChannel(id) : this.leaveChat(id);
  }

  public delete(id: ChatId) {
    return this.isChannel(id) ? this.deleteChannel(id) : this.deleteChat(id);
  }

  public deleteChannel(id: ChatId) {
    return apiManager.invokeApi('channels.deleteChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChat(id: ChatId) {
    //return this.leaveChat(id).then(() => {
      return apiManager.invokeApi('messages.deleteChat', {
        chat_id: id
      });
    //});
  }

  public migrateChat(id: ChatId): Promise<ChatId> {
    const chat: Chat = this.getChat(id);
    if(chat._ === 'channel') return Promise.resolve(chat.id);
    return apiManager.invokeApi('messages.migrateChat', {
      chat_id: id
    }).then((updates) => {
      this.onChatUpdated(id, updates);
      const update: Update.updateChannel = (updates as Updates.updates).updates.find(u => u._ === 'updateChannel') as any;
      return update.channel_id;
    });
  }

  public updateUsername(id: ChatId, username: string) {
    return apiManager.invokeApi('channels.updateUsername', {
      channel: this.getChannelInput(id),
      username
    }).then((bool) => {
      if(bool) {
        const chat: Chat.channel = this.getChat(id);
        chat.username = username;
      }

      return bool;
    });
  }

  public editPhoto(id: ChatId, inputFile: InputFile) {
    const inputChatPhoto: InputChatPhoto = {
      _: 'inputChatUploadedPhoto',
      file: inputFile
    };

    let promise: any;
    if(this.isChannel(id)) {
      promise = apiManager.invokeApi('channels.editPhoto', {
        channel: this.getChannelInput(id),
        photo: inputChatPhoto
      });
    } else {
      promise = apiManager.invokeApi('messages.editChatPhoto', {
        chat_id: id,
        photo: inputChatPhoto
      });
    }

    return promise.then((updates: any) => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public editTitle(id: ChatId, title: string) {
    let promise: any;

    if(this.isChannel(id)) {
      promise = apiManager.invokeApi('channels.editTitle', {
        channel: this.getChannelInput(id),
        title
      });
    } else {
      promise = apiManager.invokeApi('messages.editChatTitle', {
        chat_id: id,
        title
      });
    }

    return promise.then((updates: any) => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public editAbout(id: ChatId, about: string) {
    const peerId = id.toPeerId(true);
    return apiManager.invokeApi('messages.editChatAbout', {
      peer: appPeersManager.getInputPeerById(peerId),
      about
    }).then(bool => {
      if(bool) {
        rootScope.dispatchEvent('peer_bio_edit', peerId);
      }

      return bool;
    });
  }

  public getParticipantPeerId(participant: ChannelParticipant | ChatParticipant): PeerId {
    const peerId = (participant as ChannelParticipant.channelParticipantBanned).peer ? 
      appPeersManager.getPeerId((participant as ChannelParticipant.channelParticipantBanned).peer) : 
      (participant as ChatParticipant.chatParticipant).user_id.toPeerId();
    return peerId;
  }

  public editBanned(id: ChatId, participant: PeerId | ChannelParticipant, banned_rights: ChatBannedRights) {
    const peerId = typeof(participant) !== 'object' ? participant : this.getParticipantPeerId(participant);
    return apiManager.invokeApi('channels.editBanned', {
      channel: this.getChannelInput(id),
      participant: appPeersManager.getInputPeerById(peerId),
      banned_rights
    }).then((updates) => {
      this.onChatUpdated(id, updates);

      if(typeof(participant) === 'object') {
        const timestamp = Date.now() / 1000 | 0;
        apiUpdatesManager.processLocalUpdate({
          _: 'updateChannelParticipant',
          channel_id: id,
          date: timestamp,
          actor_id: undefined,
          qts: undefined,
          user_id: peerId,
          prev_participant: participant,
          new_participant: Object.keys(banned_rights.pFlags).length ? {
            _: 'channelParticipantBanned',
            date: timestamp,
            banned_rights,
            kicked_by: appUsersManager.getSelf().id,
            peer: appPeersManager.getOutputPeer(peerId),
            pFlags: {}
          } : undefined
        });
      }
    });
  }

  public clearChannelParticipantBannedRights(id: ChatId, participant: PeerId | ChannelParticipant) {
    return this.editBanned(id, participant, {
      _: 'chatBannedRights',
      until_date: 0,
      pFlags: {}
    });
  }
  
  public kickFromChannel(id: ChatId, participant: PeerId | ChannelParticipant) {
    return this.editBanned(id, participant, {
      _: 'chatBannedRights',
      until_date: 0,
      pFlags: {
        view_messages: true
      }
    });
  }

  public kickFromChat(id: ChatId, participant: PeerId | ChannelParticipant) {
    if(this.isChannel(id)) return this.kickFromChannel(id, participant);
    else return this.deleteChatUser(id, (participant as PeerId).toUserId());
  }

  public resolveChannel(id: ChatId) {
    return apiManager.invokeApiSingle('channels.getChannels', {
      id: [{
        _: 'inputChannel',
        channel_id: id,
        access_hash: '0'
      }]
    }).then(messagesChats => {
      this.saveApiChats(messagesChats.chats);
    });
  }

  public togglePreHistoryHidden(id: ChatId, enabled: boolean) {
    return this.migrateChat(id).then(channelId => {
      return apiManager.invokeApi('channels.togglePreHistoryHidden', {
        channel: this.getChannelInput(channelId),
        enabled
      });
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleSignatures(id: ChatId, enabled: boolean) {
    return apiManager.invokeApi('channels.toggleSignatures', {
      channel: this.getChannelInput(id),
      enabled
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleNoForwards(id: ChatId, enabled: boolean) {
    return apiManager.invokeApi('messages.toggleNoForwards', {
      peer: this.getInputPeer(id),
      enabled
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public setChatAvailableReactions(id: ChatId, reactions: Array<string>) {
    return apiManager.invokeApi('messages.setChatAvailableReactions', {
      peer: this.getInputPeer(id),
      available_reactions: reactions
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public isRestricted(chatId: ChatId) {
    const chat: Chat.channel = this.getChat(chatId);
    const restrictionReasons = chat.restriction_reason;

    return !!(chat.pFlags.restricted && restrictionReasons && isRestricted(restrictionReasons));
  }

  public getSendAs(channelId: ChatId) {
    return apiManager.invokeApiSingleProcess({
      method: 'channels.getSendAs', 
      params: {
        peer: this.getChannelInputPeer(channelId)
      },
      processResult: (sendAsPeers) => {
        appUsersManager.saveApiUsers(sendAsPeers.users);
        appChatsManager.saveApiChats(sendAsPeers.chats);

        return sendAsPeers.peers;
      }
    });
  }
}

const appChatsManager = new AppChatsManager();
MOUNT_CLASS_TO.appChatsManager = appChatsManager;
export default appChatsManager;
