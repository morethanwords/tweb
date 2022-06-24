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

import deepEqual from "../../helpers/object/deepEqual";
import isObject from "../../helpers/object/isObject";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import { ChannelParticipant, ChannelsCreateChannel, Chat, ChatAdminRights, ChatBannedRights, ChatInvite, ChatPhoto, InputChannel, InputChatPhoto, InputFile, InputPeer, SponsoredMessage, Update, Updates } from "../../layer";
import { isRestricted } from "../../helpers/restrictions";
import { AppManager } from "./manager";
import getPeerId from "./utils/peers/getPeerId";
import hasRights from "./utils/chats/hasRights";
import getParticipantPeerId from "./utils/chats/getParticipantPeerId";
import { AppStoragesManager } from "./appStoragesManager";

export type Channel = Chat.channel;
export type ChatRights = keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags'] | 'change_type' | 'change_permissions' | 'delete_chat' | 'view_participants';

export class AppChatsManager extends AppManager {
  private storage: AppStoragesManager['storages']['chats'];
  
  private chats: {[id: ChatId]: Chat.channel | Chat.chat | any};
  //private usernames: any;
  //private channelAccess: any;
  //private megagroups: {[id: number]: true};

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      /* updateChannel: (update) => {
        const channelId = update.channel_id;
        //console.log('updateChannel:', update);
        rootScope.broadcast('channel_settings', {channelId});
      }, */

      updateChannelParticipant: (update) => {
        this.apiManager.clearCache('channels.getParticipants', (params) => {
          return (params.channel as InputChannel.inputChannel).channel_id === update.channel_id;
        });
      },

      updateChatDefaultBannedRights: (update) => {
        const chatId = getPeerId(update.peer).toChatId();
        const chat: Chat.chat = this.chats[chatId];
        if(chat) {
          chat.default_banned_rights = update.default_banned_rights;
          this.rootScope.dispatchEvent('chat_update', chatId);
        }
      }
    });

    return Promise.all([
      this.appStateManager.getState(),
      this.appStoragesManager.loadStorage('chats')
    ]).then(([state, {results: chats, storage}]) => {
      this.storage = storage;

      if(chats.length) {
        for(let i = 0, length = chats.length; i < length; ++i) {
          const chat = chats[i];
          if(chat) {
            this.chats[chat.id] = chat;
          }
        }
      }

      this.peersStorage.addEventListener('peerNeeded', (peerId) => {
        if(peerId.isUser() || this.storage.getFromCache(peerId.toChatId())) {
          return;
        }

        this.storage.set({
          [peerId.toChatId()]: this.getChat(peerId.toChatId())
        });
      });

      this.peersStorage.addEventListener('peerUnneeded', (peerId) => {
        if(peerId.isUser() || !this.storage.getFromCache(peerId.toChatId())) {
          return;
        }

        this.storage.delete(peerId.toChatId());
      });
    });
  }

  public clear = (init = false) => {
    if(!init) {
      for(const chatId in this.chats) {
        if(!chatId) continue;
        if(!this.peersStorage.isPeerNeeded(chatId.toPeerId(true))) {
          /* const chat = this.chats[chatId];
          if(chat.username) {
            delete this.usernames[cleanUsername(chat.username)];
          } */
          
          this.storage.delete(chatId);
          delete this.chats[chatId];
        }
      }
    } else {
      this.chats = {};
    }
  };

  public saveApiChats(apiChats: any[], override?: boolean) {
    if((apiChats as any).saved) return;
    (apiChats as any).saved = true;
    apiChats.forEach((chat) => this.saveApiChat(chat, override));
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
      this.rootScope.dispatchEvent('chat_update', chat.id);
    }

    const peerId = chat.id.toPeerId(true);
    if(changedPhoto) {
      this.rootScope.dispatchEvent('avatar_update', peerId);
    }

    if(changedTitle) {
      this.rootScope.dispatchEvent('peer_title_edit', peerId);
    }

    if(this.peersStorage.isPeerNeeded(peerId)) {
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

  /**
   * Check the user's ability to do an action in chat
   * @param id 
   * @param action creator can still send messages to left channel. so this function shows server rights. see canSendToPeer for local rights in messages manager.
   * @param rights do not provide this parameter when checking rights for self
   * @param isThread 
   * @returns 
   */
  public hasRights(id: ChatId, action: ChatRights, rights?: ChatAdminRights | ChatBannedRights, isThread?: boolean) {
    return hasRights(this.getChat(id), action, rights, isThread);
  }

  public editChatDefaultBannedRights(id: ChatId, banned_rights: ChatBannedRights) {
    const chat: Chat.chat = this.getChat(id);
    if(chat.default_banned_rights) {
      if(chat.default_banned_rights.until_date === banned_rights.until_date && deepEqual(chat.default_banned_rights.pFlags, banned_rights.pFlags)) {
        return Promise.resolve();
      }
    }
    
    return this.apiManager.invokeApi('messages.editChatDefaultBannedRights', {
      peer: this.appPeersManager.getInputPeerById(id.toPeerId(true)),
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
    return !!(chat as Chat.channel)?.pFlags?.megagroup;
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
      // || (chat as any).pFlags.kicked 
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
      chatFull.rAbout = wrapRichText(chatFull.about, {noLinebreaks: true});
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
    return this.apiManager.invokeApi('channels.createChannel', options).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);

      const channelId = (updates as any).chats[0].id;
      return channelId;
    });
  }

  public inviteToChannel(id: ChatId, userIds: UserId[]) {
    const input = this.getChannelInput(id);
    const usersInputs = userIds.map((u) => this.appUsersManager.getUserInput(u));

    return this.apiManager.invokeApi('channels.inviteToChannel', {
      channel: input,
      users: usersInputs
    }).then(this.onChatUpdated.bind(this, id));
  }

  public createChat(title: string, userIds: UserId[]): Promise<ChatId> {
    return this.apiManager.invokeApi('messages.createChat', {
      users: userIds.map((u) => this.appUsersManager.getUserInput(u)),
      title
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);

      const chatId = (updates as any as Updates.updates).chats[0].id;
      return chatId;
    });
  }

  private onChatUpdated = (chatId: ChatId, updates?: any) => {
    //console.log('onChatUpdated', chatId, updates);

    this.apiUpdatesManager.processUpdateMessage(updates);
    if(updates?.updates?.length && this.isChannel(chatId)) {
      this.rootScope.dispatchEvent('invalidate_participants', chatId);
    }
  };

  public leaveChannel(id: ChatId) {
    return this.apiManager.invokeApi('channels.leaveChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public joinChannel(id: ChatId) {
    return this.apiManager.invokeApi('channels.joinChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public addChatUser(id: ChatId, userId: UserId, fwdLimit = 100) {
    return this.apiManager.invokeApi('messages.addChatUser', {
      chat_id: id,
      user_id: this.appUsersManager.getUserInput(userId),
      fwd_limit: fwdLimit
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChatUser(id: ChatId, userId: UserId) {
    return this.apiManager.invokeApi('messages.deleteChatUser', {
      chat_id: id,
      user_id: this.appUsersManager.getUserInput(userId)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public leaveChat(id: ChatId) {
    return this.deleteChatUser(id, this.appUsersManager.getSelf().id);
  }

  public leave(id: ChatId) {
    return this.isChannel(id) ? this.leaveChannel(id) : this.leaveChat(id);
  }

  public delete(id: ChatId) {
    return this.isChannel(id) ? this.deleteChannel(id) : this.deleteChat(id);
  }

  public deleteChannel(id: ChatId) {
    return this.apiManager.invokeApi('channels.deleteChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChat(id: ChatId) {
    //return this.leaveChat(id).then(() => {
      return this.apiManager.invokeApi('messages.deleteChat', {
        chat_id: id
      });
    //});
  }

  public migrateChat(id: ChatId): Promise<ChatId> {
    const chat: Chat = this.getChat(id);
    if(chat._ === 'channel') return Promise.resolve(chat.id);
    return this.apiManager.invokeApi('messages.migrateChat', {
      chat_id: id
    }).then((updates) => {
      this.onChatUpdated(id, updates);
      const update: Update.updateChannel = (updates as Updates.updates).updates.find((u) => u._ === 'updateChannel') as any;
      return update.channel_id;
    });
  }

  public updateUsername(id: ChatId, username: string) {
    return this.apiManager.invokeApi('channels.updateUsername', {
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
      promise = this.apiManager.invokeApi('channels.editPhoto', {
        channel: this.getChannelInput(id),
        photo: inputChatPhoto
      });
    } else {
      promise = this.apiManager.invokeApi('messages.editChatPhoto', {
        chat_id: id,
        photo: inputChatPhoto
      });
    }

    return promise.then((updates: any) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public editTitle(id: ChatId, title: string) {
    let promise: any;

    if(this.isChannel(id)) {
      promise = this.apiManager.invokeApi('channels.editTitle', {
        channel: this.getChannelInput(id),
        title
      });
    } else {
      promise = this.apiManager.invokeApi('messages.editChatTitle', {
        chat_id: id,
        title
      });
    }

    return promise.then((updates: any) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public editAbout(id: ChatId, about: string) {
    const peerId = id.toPeerId(true);
    return this.apiManager.invokeApi('messages.editChatAbout', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      about
    }).then((bool) => {
      if(bool) {
        this.rootScope.dispatchEvent('peer_bio_edit', peerId);
      }

      return bool;
    });
  }

  public editBanned(id: ChatId, participant: PeerId | ChannelParticipant, banned_rights: ChatBannedRights) {
    const peerId = typeof(participant) !== 'object' ? participant : getParticipantPeerId(participant);
    return this.apiManager.invokeApi('channels.editBanned', {
      channel: this.getChannelInput(id),
      participant: this.appPeersManager.getInputPeerById(peerId),
      banned_rights
    }).then((updates) => {
      this.onChatUpdated(id, updates);

      if(typeof(participant) === 'object') {
        const timestamp = Date.now() / 1000 | 0;
        this.apiUpdatesManager.processLocalUpdate({
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
            kicked_by: this.appUsersManager.getSelf().id,
            peer: this.appPeersManager.getOutputPeer(peerId),
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
    return this.apiManager.invokeApiSingle('channels.getChannels', {
      id: [{
        _: 'inputChannel',
        channel_id: id,
        access_hash: '0'
      }]
    }).then((messagesChats) => {
      this.saveApiChats(messagesChats.chats);
    });
  }

  public togglePreHistoryHidden(id: ChatId, enabled: boolean) {
    return this.migrateChat(id).then((channelId) => {
      return this.apiManager.invokeApi('channels.togglePreHistoryHidden', {
        channel: this.getChannelInput(channelId),
        enabled
      });
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleSignatures(id: ChatId, enabled: boolean) {
    return this.apiManager.invokeApi('channels.toggleSignatures', {
      channel: this.getChannelInput(id),
      enabled
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleNoForwards(id: ChatId, enabled: boolean) {
    return this.apiManager.invokeApi('messages.toggleNoForwards', {
      peer: this.getInputPeer(id),
      enabled
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public setChatAvailableReactions(id: ChatId, reactions: Array<string>) {
    return this.apiManager.invokeApi('messages.setChatAvailableReactions', {
      peer: this.getInputPeer(id),
      available_reactions: reactions
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public isRestricted(chatId: ChatId) {
    const chat: Chat.channel = this.getChat(chatId);
    const restrictionReasons = chat.restriction_reason;

    return !!(chat.pFlags.restricted && restrictionReasons && isRestricted(restrictionReasons));
  }

  public getSendAs(channelId: ChatId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'channels.getSendAs', 
      params: {
        peer: this.getChannelInputPeer(channelId)
      },
      processResult: (sendAsPeers) => {
        this.appUsersManager.saveApiUsers(sendAsPeers.users);
        this.saveApiChats(sendAsPeers.chats);

        return sendAsPeers.peers;
      }
    });
  }

  public importChatInvite(hash: string) {
    return this.apiManager.invokeApi('messages.importChatInvite', {hash})
    .then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
      const chat = (updates as Updates.updates).chats[0];
      return chat.id;
    });
  }

  public checkUsername(chatId: ChatId, username: string) {
    return this.apiManager.invokeApi('channels.checkUsername', {
      channel: this.getChannelInput(chatId),
      username
    });
  }

  public getSponsoredMessage(chatId: ChatId) {
    return this.apiManager.invokeApiCacheable('channels.getSponsoredMessages', {
      channel: this.getChannelInput(chatId)
    }, {cacheSeconds: 300}).then((sponsoredMessages) => {
      this.appUsersManager.saveApiUsers(sponsoredMessages.users);
      this.appChatsManager.saveApiChats(sponsoredMessages.chats);

      const sponsoredMessage = sponsoredMessages.messages.shift();
      sponsoredMessages.messages.push(sponsoredMessage);

      return sponsoredMessages;
    });
  }

  public viewSponsoredMessage(chatId: ChatId, randomId: SponsoredMessage['random_id']) {
    return this.apiManager.invokeApiSingle('channels.viewSponsoredMessage', {
      channel: this.getChannelInput(chatId),
      random_id: randomId
    });
  }

  public checkChatInvite(hash: string) {
    return this.apiManager.invokeApi('messages.checkChatInvite', {
      hash: hash
    }).then((chatInvite) => {
      if((chatInvite as ChatInvite.chatInvitePeek).chat) {
        this.saveApiChat((chatInvite as ChatInvite.chatInvitePeek).chat, true);
      }

      return chatInvite;
    });
  }
}
