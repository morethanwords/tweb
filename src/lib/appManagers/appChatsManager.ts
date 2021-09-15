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
import { isObject, safeReplaceObject, copy, deepEqual } from "../../helpers/object";
import { ChannelParticipant, Chat, ChatAdminRights, ChatBannedRights, ChatParticipant, ChatPhoto, InputChannel, InputChatPhoto, InputFile, InputPeer, Update, Updates } from "../../layer";
import apiManagerProxy from "../mtproto/mtprotoworker";
import apiManager from '../mtproto/mtprotoworker';
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appPeersManager from "./appPeersManager";
import appStateManager from "./appStateManager";
import appUsersManager from "./appUsersManager";

export type Channel = Chat.channel;

export type ChatRights = keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags'] | 'change_type' | 'change_permissions' | 'delete_chat' | 'view_participants';

export class AppChatsManager {
  private storage = appStateManager.storages.chats;
  
  private chats: {[id: number]: Chat.channel | Chat.chat | any};
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
        const chatId = -appPeersManager.getPeerId(update.peer);
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

      appStateManager.addEventListener('peerNeeded', (peerId: number) => {
        if(peerId > 0 || this.storage.getFromCache(-peerId)) {
          return;
        }

        this.storage.set({
          [-peerId]: this.getChat(-peerId)
        });
      });

      appStateManager.addEventListener('peerUnneeded', (peerId: number) => {
        if(peerId > 0 || !this.storage.getFromCache(-peerId)) {
          return;
        }

        this.storage.delete(-peerId);
      });
    });
  }

  public clear(init = false) {
    if(!init) {
      const chats = appStateManager.storagesResults.chats;
      for(const _chatId in this.chats) {
        const chatId = +_chatId;
        if(!chatId) continue;
        if(!appStateManager.isPeerNeeded(-chatId)) {
          /* const chat = this.chats[chatId];
          if(chat.username) {
            delete this.usernames[cleanUsername(chat.username)];
          } */
          
          chats.findAndSplice((chat) => chat.id === chatId);
          this.storage.delete(chatId);
          delete this.chats[chatId];
        }
      }
    } else {
      this.chats = {};
    }
  }

  public saveApiChats(apiChats: any[], override?: boolean) {
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

    if(changedPhoto) {
      rootScope.dispatchEvent('avatar_update', -chat.id);
    }

    if(changedTitle) {
      rootScope.dispatchEvent('peer_title_edit', -chat.id);
    }

    if(appStateManager.isPeerNeeded(-chat.id)) {
      this.storage.set({
        [chat.id]: chat
      });
    }
  }

  public getChat(id: number) {
    if(id < 0) id = -id;
    return this.chats[id] || {_: 'chatEmpty', id, deleted: true, access_hash: '', pFlags: {}/* this.channelAccess[id] */};
  }

  public combineParticipantBannedRights(id: number, rights: ChatBannedRights) {
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

  public hasRights(id: number, action: ChatRights, rights?: ChatAdminRights | ChatBannedRights, isThread?: boolean) {
    const chat: Chat = this.getChat(id);
    if(chat._ === 'chatEmpty') return false;

    if(chat._ === 'chatForbidden' ||
        chat._ === 'channelForbidden' ||
        (chat as Chat.chat).pFlags.kicked ||
        (chat.pFlags.left && !(chat as Chat.channel).pFlags.megagroup)) {
      return false;
    }

    if((chat as Chat.chat).pFlags.deactivated && action !== 'view_messages') {
      return false;
    }

    if(chat.pFlags.creator && rights === undefined) {
      return true;
    }

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
      case 'delete_messages': {
        return !!myFlags.delete_messages;
      }

      case 'pin_messages': {
        return rights._ === 'chatAdminRights' ? myFlags[action] || !!myFlags.post_messages : !myFlags[action];
      }

      case 'invite_users':
      case 'change_info': {
        return rights._ === 'chatAdminRights' ? myFlags[action] : !myFlags[action];
      }

      // * only creator can do that
      case 'change_type':
      case 'delete_chat': {
        return false;
      }

      case 'change_permissions': {
        return rights._ === 'chatAdminRights' && myFlags['ban_users'];
      }

      case 'view_participants': {
        return !!(chat._ === 'chat' || !chat.pFlags.broadcast || chat.pFlags.creator || chat.admin_rights);
      }
    }

    return true;
  }

  public editChatDefaultBannedRights(id: number, banned_rights: ChatBannedRights) {
    const chat: Chat.chat = this.getChat(id);
    if(chat.default_banned_rights) {
      if(chat.default_banned_rights.until_date === banned_rights.until_date && deepEqual(chat.default_banned_rights.pFlags, banned_rights.pFlags)) {
        return Promise.resolve();
      }
    }
    
    return apiManager.invokeApi('messages.editChatDefaultBannedRights', {
      peer: appPeersManager.getInputPeerById(-id),
      banned_rights
    }).then(this.onChatUpdated.bind(this, id));
  }

  /* public resolveUsername(username: string) {
    return this.usernames[username] || 0;
  } */

  /* public saveChannelAccess(id: number, accessHash: string) {
    this.channelAccess[id] = accessHash;
  } */

  /* public saveIsMegagroup(id: number) {
    this.megagroups[id] = true;
  } */

  public isChannel(id: number) {
    const chat = this.chats[id];
    return chat && (chat._ === 'channel' || chat._ === 'channelForbidden')/*  || this.channelAccess[id] */;
  }

  public isMegagroup(id: number) {
    /* if(this.megagroups[id]) {
      return true;
    } */

    const chat = this.chats[id];
    return chat && chat._ === 'channel' && chat.pFlags.megagroup;
  }

  public isBroadcast(id: number) {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public isInChat(id: number) {
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

  public getChannelInput(id: number): InputChannel {
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

  public getChatInputPeer(id: number): InputPeer.inputPeerChat {
    return {
      _: 'inputPeerChat',
      chat_id: id
    };
  }

  public getChannelInputPeer(id: number): InputPeer.inputPeerChannel {
    return {
      _: 'inputPeerChannel',
      channel_id: id,
      access_hash: this.getChat(id).access_hash/*  || this.channelAccess[id] */ || 0
    };
  }

  public hasChat(id: number, allowMin?: true) {
    const chat = this.chats[id]
    return isObject(chat) && (allowMin || !chat.pFlags.min);
  }

  public getChatPhoto(id: number) {
    const chat: Chat.chat = this.getChat(id);

    return chat && chat.photo || {
      _: 'chatPhotoEmpty'
    };
  }

  public getChatString(id: number) {
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

  public createChannel(title: string, about: string): Promise<number> {
    return apiManager.invokeApi('channels.createChannel', {
      broadcast: true,
      title,
      about
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);

      const channelId = (updates as any).chats[0].id;
      rootScope.dispatchEvent('history_focus', {peerId: -channelId});

      return channelId;
    });
  }

  public inviteToChannel(id: number, userIds: number[]) {
    const input = this.getChannelInput(id);
    const usersInputs = userIds.map(u => appUsersManager.getUserInput(u));

    return apiManager.invokeApi('channels.inviteToChannel', {
      channel: input,
      users: usersInputs
    }).then(this.onChatUpdated.bind(this, id));
  }

  public createChat(title: string, userIds: number[]): Promise<number> {
    return apiManager.invokeApi('messages.createChat', {
      users: userIds.map(u => appUsersManager.getUserInput(u)),
      title
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);

      const chatId = (updates as any as Updates.updates).chats[0].id;
      rootScope.dispatchEvent('history_focus', {peerId: -chatId});

      return chatId;
    });
  }

  private onChatUpdated = (chatId: number, updates?: any) => {
    //console.log('onChatUpdated', chatId, updates);

    apiUpdatesManager.processUpdateMessage(updates);
    if(updates?.updates?.length && this.isChannel(chatId)) {
      rootScope.dispatchEvent('invalidate_participants', chatId);
    }
  };

  public leaveChannel(id: number) {
    return apiManager.invokeApi('channels.leaveChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public joinChannel(id: number) {
    return apiManager.invokeApi('channels.joinChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public addChatUser(id: number, userId: number, fwdLimit = 100) {
    return apiManager.invokeApi('messages.addChatUser', {
      chat_id: id,
      user_id: appUsersManager.getUserInput(userId),
      fwd_limit: fwdLimit
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChatUser(id: number, userId: number) {
    return apiManager.invokeApi('messages.deleteChatUser', {
      chat_id: id,
      user_id: appUsersManager.getUserInput(userId)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public leaveChat(id: number) {
    return this.deleteChatUser(id, appUsersManager.getSelf().id);
  }

  public leave(id: number) {
    return this.isChannel(id) ? this.leaveChannel(id) : this.leaveChat(id);
  }

  public delete(id: number) {
    return this.isChannel(id) ? this.deleteChannel(id) : this.deleteChat(id);
  }

  public deleteChannel(id: number) {
    return apiManager.invokeApi('channels.deleteChannel', {
      channel: this.getChannelInput(id)
    }).then(this.onChatUpdated.bind(this, id));
  }

  public deleteChat(id: number) {
    //return this.leaveChat(id).then(() => {
      return apiManager.invokeApi('messages.deleteChat', {
        chat_id: id
      });
    //});
  }

  public migrateChat(id: number): Promise<number> {
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

  public updateUsername(id: number, username: string) {
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

  public editPhoto(id: number, inputFile: InputFile) {
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

  public editTitle(id: number, title: string) {
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

  public editAbout(id: number, about: string) {
    return apiManager.invokeApi('messages.editChatAbout', {
      peer: appPeersManager.getInputPeerById(-id),
      about
    }).then(bool => {
      //apiUpdatesManager.processUpdateMessage(updates);
      rootScope.dispatchEvent('peer_bio_edit', -id);
    });
  }

  public getParticipantPeerId(participant: ChannelParticipant | ChatParticipant) {
    const peerId = (participant as ChannelParticipant.channelParticipantBanned).peer ? 
      appPeersManager.getPeerId((participant as ChannelParticipant.channelParticipantBanned).peer) : 
      (participant as ChatParticipant.chatParticipant).user_id;
    return peerId;
  }

  public editBanned(id: number, participant: number | ChannelParticipant, banned_rights: ChatBannedRights) {
    const peerId = typeof(participant) === 'number' ? participant : this.getParticipantPeerId(participant);
    return apiManager.invokeApi('channels.editBanned', {
      channel: this.getChannelInput(id),
      participant: appPeersManager.getInputPeerById(peerId),
      banned_rights
    }).then((updates) => {
      this.onChatUpdated(id, updates);

      if(typeof(participant) !== 'number') {
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

  public clearChannelParticipantBannedRights(id: number, participant: number | ChannelParticipant) {
    return this.editBanned(id, participant, {
      _: 'chatBannedRights',
      until_date: 0,
      pFlags: {}
    });
  }
  
  public kickFromChannel(id: number, participant: number | ChannelParticipant) {
    return this.editBanned(id, participant, {
      _: 'chatBannedRights',
      until_date: 0,
      pFlags: {
        view_messages: true
      }
    });
  }

  public resolveChannel(id: number) {
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

  public togglePreHistoryHidden(id: number, enabled: boolean) {
    return this.migrateChat(id).then(channelId => {
      return apiManager.invokeApi('channels.togglePreHistoryHidden', {
        channel: this.getChannelInput(channelId),
        enabled
      });
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleSignatures(id: number, enabled: boolean) {
    return apiManager.invokeApi('channels.toggleSignatures', {
      channel: this.getChannelInput(id),
      enabled
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }
}

const appChatsManager = new AppChatsManager();
MOUNT_CLASS_TO.appChatsManager = appChatsManager;
export default appChatsManager;
