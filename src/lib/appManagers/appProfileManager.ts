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
import { tsNow } from "../../helpers/date";
import { numberThousandSplitter } from "../../helpers/number";
import { ChannelParticipantsFilter, ChannelsChannelParticipants, Chat, ChatFull, ChatParticipants, ChatPhoto, ExportedChatInvite, InputChannel, InputFile, InputFileLocation, PhotoSize, SendMessageAction, Update, UserFull, UserProfilePhoto } from "../../layer";
import { LangPackKey, i18n } from "../langPack";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import SearchIndex from "../searchIndex";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appMessagesIdsManager from "./appMessagesIdsManager";
import appNotificationsManager from "./appNotificationsManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager from "./appPhotosManager";
import appUsersManager, { MyTopPeer, User } from "./appUsersManager";

export type UserTyping = Partial<{userId: number, action: SendMessageAction, timeout: number}>;

export class AppProfileManager {
  //private botInfos: any = {};
  private usersFull: {[id: string]: UserFull.userFull} = {};
  public chatsFull: {[id: string]: ChatFull} = {};
  private fullPromises: {[peerId: string]: Promise<ChatFull.chatFull | ChatFull.channelFull | UserFull>} = {};

  private megagroupOnlines: {[id: number]: {timestamp: number, onlines: number}};

  private typingsInPeer: {[peerId: number]: UserTyping[]};

  constructor() {
    rootScope.addMultipleEventsListeners({
      updateChatParticipants: (update) => {
        const participants = update.participants;
        if(participants._ === 'chatParticipants') {
          const chatId = participants.chat_id;
          const chatFull = this.chatsFull[chatId] as ChatFull.chatFull;
          if(chatFull !== undefined) {
            chatFull.participants = participants;
            rootScope.dispatchEvent('chat_full_update', chatId);
          }
        }
      },

      updateChatParticipantAdd: (update) => {
        const chatFull = this.chatsFull[update.chat_id] as ChatFull.chatFull;
        if(chatFull !== undefined) {
          const _participants = chatFull.participants as ChatParticipants.chatParticipants;
          const participants = _participants.participants || [];
          for(let i = 0, length = participants.length; i < length; i++) {
            if(participants[i].user_id === update.user_id) {
              return;
            }
          }

          participants.push({
            _: 'chatParticipant',
            user_id: update.user_id,
            inviter_id: update.inviter_id,
            date: tsNow(true)
          });

          _participants.version = update.version;
          rootScope.dispatchEvent('chat_full_update', update.chat_id);
        }
      },

      updateChatParticipantDelete: (update) => {
        const chatFull = this.chatsFull[update.chat_id] as ChatFull.chatFull;
        if(chatFull !== undefined) {
          const _participants = chatFull.participants as ChatParticipants.chatParticipants;
          const participants = _participants.participants || [];
          for(let i = 0, length = participants.length; i < length; i++) {
            if(participants[i].user_id === update.user_id) {
              participants.splice(i, 1);
              _participants.version = update.version;
              rootScope.dispatchEvent('chat_full_update', update.chat_id);
              return;
            }
          }
        }
      },

      updateUserTyping: this.onUpdateUserTyping,
      updateChatUserTyping: this.onUpdateUserTyping,
      updateChannelUserTyping: this.onUpdateUserTyping
    });

    rootScope.addEventListener('chat_update', (chatId) => {
      const fullChat = this.chatsFull[chatId];
      const chat: Chat.chat = appChatsManager.getChat(chatId);
      if(!chat.photo || !fullChat) {
        return;
      }

      const emptyPhoto = chat.photo._ === 'chatPhotoEmpty';
      //////console.log('chat_update:', fullChat);
      if(fullChat.chat_photo && emptyPhoto !== (fullChat.chat_photo._ === 'photoEmpty')) {
        delete this.chatsFull[chatId];
        rootScope.dispatchEvent('chat_full_update', chatId);
        return;
      }
      if(emptyPhoto) {
        return;
      }

      const photoId = (chat.photo as ChatPhoto.chatPhoto).photo_id;
      const chatFullPhotoId = fullChat.chat_photo?.id;
      if(chatFullPhotoId !== photoId) {
        delete this.chatsFull[chatId];
        rootScope.dispatchEvent('chat_full_update', chatId);
      }
    });

    rootScope.addEventListener('invalidate_participants', chatId => {
      this.invalidateChannelParticipants(chatId);
    });

    this.megagroupOnlines = {};
    this.typingsInPeer = {};
  }

  /* public saveBotInfo(botInfo: any) {
    const botId = botInfo && botInfo.user_id;
    if(!botId) {
      return null;
    }

    const commands: any = {};
    botInfo.commands.forEach((botCommand: any) => {
      commands[botCommand.command] = botCommand.description;
    });

    return this.botInfos[botId] = {
      id: botId,
      version: botInfo.version,
      shareText: botInfo.share_text,
      description: botInfo.description,
      commands: commands
    };
  } */

  public getProfile(id: number, override?: true): Promise<UserFull> {
    if(this.usersFull[id] && !override) {
      return Promise.resolve(this.usersFull[id]);
    }

    if(this.fullPromises[id]) {
      return this.fullPromises[id] as any;
    }

    return this.fullPromises[id] = apiManager.invokeApi('users.getFullUser', {
      id: appUsersManager.getUserInput(id)
    }).then((userFull) => {
      const user = userFull.user as User;
      appUsersManager.saveApiUser(user, true);

      if(userFull.profile_photo) {
        userFull.profile_photo = appPhotosManager.savePhoto(userFull.profile_photo, {type: 'profilePhoto', peerId: id});
      }

      if(userFull.about !== undefined) {
        userFull.rAbout = RichTextProcessor.wrapRichText(userFull.about, {noLinebreaks: true});
      }

      appNotificationsManager.savePeerSettings(id, userFull.notify_settings);

      /* if(userFull.bot_info) {
        userFull.bot_info = this.saveBotInfo(userFull.bot_info) as any;
      } */

      //appMessagesManager.savePinnedMessage(id, userFull.pinned_msg_id);

      delete this.fullPromises[id];

      return this.usersFull[id] = userFull;
    }) as any;
  }

  public getProfileByPeerId(peerId: number, override?: true): Promise<ChatFull.chatFull | ChatFull.channelFull | UserFull.userFull> {
    if(peerId < 0) return this.getChatFull(-peerId, override);
    else return this.getProfile(peerId, override);
  }

  public getFullPhoto(peerId: number) {
    return this.getProfileByPeerId(peerId).then(profile => {
      switch(profile._) {
        case 'userFull':
          return profile.profile_photo;
        case 'channelFull':
        case 'chatFull':
          return profile.chat_photo;
      }
    });
  }

  /* public getPeerBots(peerId: number) {
    var peerBots: any[] = [];
    if(peerId >= 0 && !appUsersManager.isBot(peerId) ||
      (appPeersManager.isChannel(peerId) && !appPeersManager.isMegagroup(peerId))) {
      return Promise.resolve(peerBots);
    }
    if(peerId >= 0) {
      return this.getProfile(peerId).then((userFull: any) => {
        var botInfo = userFull.bot_info;
        if(botInfo && botInfo._ !== 'botInfoEmpty') {
          peerBots.push(botInfo);
        }
        return peerBots;
      });
    }

    return this.getChatFull(-peerId).then((chatFull: any) => {
      chatFull.bot_info.forEach((botInfo: any) => {
        peerBots.push(this.saveBotInfo(botInfo))
      });
      return peerBots;
    });
  } */

  public getChatFull(id: number, override?: true): Promise<ChatFull.chatFull | ChatFull.channelFull> {
    if(appChatsManager.isChannel(id)) {
      return this.getChannelFull(id, override);
    }

    const fullChat = this.chatsFull[id] as ChatFull.chatFull;
    if(fullChat && !override) {
      const chat = appChatsManager.getChat(id);
      if(chat.version === (fullChat.participants as ChatParticipants.chatParticipants).version ||
        chat.pFlags.left) {
        return Promise.resolve(fullChat);
      }
    }

    const peerId = -id;
    if(this.fullPromises[peerId] !== undefined) {
      return this.fullPromises[peerId] as any;
    }

    // console.trace(dT(), 'Get chat full', id, appChatsManager.getChat(id))
    return this.fullPromises[peerId] = apiManager.invokeApi('messages.getFullChat', {
      chat_id: id
    }).then((result) => {
      appChatsManager.saveApiChats(result.chats, true);
      appUsersManager.saveApiUsers(result.users);
      const fullChat = result.full_chat as ChatFull.chatFull;
      if(fullChat && fullChat.chat_photo && fullChat.chat_photo.id) {
        fullChat.chat_photo = appPhotosManager.savePhoto(fullChat.chat_photo, {type: 'profilePhoto', peerId: peerId});
      }

      //appMessagesManager.savePinnedMessage(peerId, fullChat.pinned_msg_id);
      appNotificationsManager.savePeerSettings(peerId, fullChat.notify_settings);
      delete this.fullPromises[peerId];
      this.chatsFull[id] = fullChat;
      rootScope.dispatchEvent('chat_full_update', id);

      return fullChat;
    }) as any;
  }

  public getChatInviteLink(id: number, force?: boolean) {
    return this.getChatFull(id).then((chatFull) => {
      if(!force &&
        chatFull.exported_invite &&
        chatFull.exported_invite._ == 'chatInviteExported') {
        return chatFull.exported_invite.link;
      }
      
      return apiManager.invokeApi('messages.exportChatInvite', {
        peer: appPeersManager.getInputPeerById(-id)
      }).then((exportedInvite) => {
        if(this.chatsFull[id] !== undefined) {
          this.chatsFull[id].exported_invite = exportedInvite;
        }

        return (exportedInvite as ExportedChatInvite.chatInviteExported).link;
      });
    });
  }

  public getChannelParticipants(id: number, filter: ChannelParticipantsFilter = {_: 'channelParticipantsRecent'}, limit = 200, offset = 0) {
    if(filter._ === 'channelParticipantsRecent') {
      const chat = appChatsManager.getChat(id);
      if(chat &&
          chat.pFlags && (
            chat.pFlags.kicked ||
            chat.pFlags.broadcast && !chat.pFlags.creator && !chat.admin_rights
          )) {
        return Promise.reject();
      }
    }

    return apiManager.invokeApiCacheable('channels.getParticipants', {
      channel: appChatsManager.getChannelInput(id),
      filter,
      offset,
      limit,
      hash: 0
    }, {cacheSeconds: 60}).then(result => {
      appUsersManager.saveApiUsers((result as ChannelsChannelParticipants.channelsChannelParticipants).users);
      return result as ChannelsChannelParticipants.channelsChannelParticipants;
    });
    /* let maybeAddSelf = (participants: any[]) => {
      let chat = appChatsManager.getChat(id);
      let selfMustBeFirst = filter._ === 'channelParticipantsRecent' &&
                            !offset &&
                            !chat.pFlags.kicked &&
                            !chat.pFlags.left;

      if(selfMustBeFirst) {
        participants = copy(participants);
        let myID = appUsersManager.getSelf().id;
        let myIndex = participants.findIndex(p => p.user_id === myID);
        let myParticipant;

        if(myIndex !== -1) {
          myParticipant = participants[myIndex];
          participants.splice(myIndex, 1);
        } else {
          myParticipant = {_: 'channelParticipantSelf', user_id: myID};
        }

        participants.unshift(myParticipant);
      }

      return participants;
    } */
  }

  public getChannelParticipant(id: number, peerId: number) {
    return apiManager.invokeApiSingle('channels.getParticipant', {
      channel: appChatsManager.getChannelInput(id),
      participant: appPeersManager.getInputPeerById(peerId),
    }).then(channelParticipant => {
      appUsersManager.saveApiUsers(channelParticipant.users);
      return channelParticipant.participant;
    });
  }

  public getChannelFull(id: number, override?: true): Promise<ChatFull.channelFull> {
    if(this.chatsFull[id] !== undefined && !override) {
      return Promise.resolve(this.chatsFull[id] as ChatFull.channelFull);
    }

    const peerId = -id;
    if(this.fullPromises[peerId] !== undefined) {
      return this.fullPromises[peerId] as any;
    }

    return this.fullPromises[peerId] = apiManager.invokeApi('channels.getFullChannel', {
      channel: appChatsManager.getChannelInput(id)
    }).then((result) => {
      appChatsManager.saveApiChats(result.chats, true);
      appUsersManager.saveApiUsers(result.users);
      const fullChannel = result.full_chat as ChatFull.channelFull;
      if(fullChannel && fullChannel.chat_photo.id) {
        fullChannel.chat_photo = appPhotosManager.savePhoto(fullChannel.chat_photo, {type: 'profilePhoto', peerId});
        //appPhotosManager.savePhoto(fullChannel.chat_photo);
      }
      appNotificationsManager.savePeerSettings(peerId, fullChannel.notify_settings);

      delete this.fullPromises[peerId];
      this.chatsFull[id] = fullChannel;
      rootScope.dispatchEvent('chat_full_update', id);

      return fullChannel;
    }, (error) => {
      switch (error.type) {
        case 'CHANNEL_PRIVATE':
          let channel = appChatsManager.getChat(id);
          channel = {_: 'channelForbidden', access_hash: channel.access_hash, title: channel.title};
          apiUpdatesManager.processUpdateMessage({
            _: 'updates',
            updates: [{
              _: 'updateChannel',
              channel_id: id
            } as Update.updateChannel],
            chats: [channel],
            users: []
          });
          break;
      }

      return Promise.reject(error);
    }) as any;
  }

  public getMentions(chatId: number, query: string, threadId?: number): Promise<number[]> {
    const processUserIds = (topPeers: MyTopPeer[]) => {
      const startsWithAt = query.charAt(0) === '@';
      if(startsWithAt) query = query.slice(1);
      /* const startsWithAt = query.charAt(0) === '@';
      if(startsWithAt) query = query.slice(1);
      
      const index = new SearchIndex<number>(!startsWithAt, !startsWithAt); */
      const index = new SearchIndex<number>({
        ignoreCase: true
      });

      const ratingMap: Map<number, number> = new Map();
      topPeers.forEach(peer => {
        index.indexObject(peer.id, appUsersManager.getUserSearchText(peer.id));
        ratingMap.set(peer.id, peer.rating);
      });

      const peerIds = Array.from(index.search(query));
      peerIds.sort((a, b) => ratingMap.get(b) - ratingMap.get(a));
      return peerIds;
    };

    let promise: Promise<number[]>;
    if(appChatsManager.isChannel(chatId)) {
      promise = this.getChannelParticipants(chatId, {
        _: 'channelParticipantsMentions',
        q: query,
        top_msg_id: appMessagesIdsManager.getServerMessageId(threadId)
      }, 50, 0).then(cP => {
        return cP.participants.map(p => appChatsManager.getParticipantPeerId(p));
      });
    } else if(chatId) {
      promise = (this.getChatFull(chatId) as Promise<ChatFull.chatFull>).then(chatFull => {
        return (chatFull.participants as ChatParticipants.chatParticipants).participants.map(p => p.user_id);
      });
    } else {
      promise = Promise.resolve([]);
    }

    return Promise.all([
      // [],
      appUsersManager.getTopPeers('bots_inline').catch(() => [] as MyTopPeer[]), 
      promise
    ]).then(results => {
      const peers = results[0].concat(results[1].map(peerId => ({id: peerId, rating: 0})));

      return processUserIds(peers);
    });
  }

  public invalidateChannelParticipants(id: number) {
    delete this.chatsFull[id];
    delete this.fullPromises[-id];
    apiManager.clearCache('channels.getParticipants', (params) => (params.channel as InputChannel.inputChannel).channel_id === id);
    rootScope.dispatchEvent('chat_full_update', id);
  }

  public updateProfile(first_name: string, last_name: string, about: string) {
    return apiManager.invokeApi('account.updateProfile', {
      first_name,
      last_name,
      about
    }).then(user => {
      appUsersManager.saveApiUser(user);
      
      return this.getProfile(rootScope.myId, true);
    });
  }

  public uploadProfilePhoto(inputFile: InputFile) {
    return apiManager.invokeApi('photos.uploadProfilePhoto', {
      file: inputFile
    }).then((updateResult) => {
      appUsersManager.saveApiUsers(updateResult.users);

      const myId = rootScope.myId;
      appPhotosManager.savePhoto(updateResult.photo, {
        type: 'profilePhoto',
        peerId: myId
      });

      apiUpdatesManager.processLocalUpdate({
        _: 'updateUserPhoto',
        user_id: myId,
        date: tsNow(true),
        photo: appUsersManager.getUser(myId).photo,
        previous: true
      });
    });
  }

  public getChatMembersString(id: number) {
    const chat: Chat = appChatsManager.getChat(id);
    if(chat._ === 'chatForbidden') {
      return i18n('YouWereKicked');
    }

    const chatFull = this.chatsFull[id];
    let count: number;
    if(chatFull) {
      if(chatFull._ === 'channelFull') {
        count = chatFull.participants_count;
      } else {
        count = (chatFull.participants as ChatParticipants.chatParticipants).participants?.length;
      }
    } else {
      count = (chat as Chat.chat).participants_count || (chat as any).participants?.participants.length;
    }

    const isChannel = appChatsManager.isBroadcast(id);
    count = count || 1;

    let key: LangPackKey = isChannel ? 'Peer.Status.Subscribers' : 'Peer.Status.Member';
    return i18n(key, [numberThousandSplitter(count)]);
  }

  public async getOnlines(id: number): Promise<number> {
    if(appChatsManager.isMegagroup(id)) {
      const timestamp = Date.now() / 1000 | 0;
      const cached = this.megagroupOnlines[id] ?? (this.megagroupOnlines[id] = {timestamp: 0, onlines: 1});
      if((timestamp - cached.timestamp) < 60) {
        return cached.onlines;
      }

      const res = await apiManager.invokeApi('messages.getOnlines', {
        peer: appChatsManager.getChannelInputPeer(id)
      });

      const onlines = res.onlines ?? 1;
      cached.timestamp = timestamp;
      cached.onlines = onlines;

      return onlines;
    } else if(appChatsManager.isBroadcast(id)) {
      return 1;
    }

    const chatInfo = await this.getChatFull(id);
    const _participants = (chatInfo as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
    if(_participants && _participants.participants) {
      const participants = _participants.participants;

      return participants.reduce((acc: number, participant) => {
        const user = appUsersManager.getUser(participant.user_id);
        if(user && user.status && user.status._ === 'userStatusOnline') {
          return acc + 1;
        }

        return acc;
      }, 0);
    } else {
      return 1;
    }
  }

  private onUpdateUserTyping = (update: Update.updateUserTyping | Update.updateChatUserTyping | Update.updateChannelUserTyping) => {
    const fromId = (update as Update.updateUserTyping).user_id || appPeersManager.getPeerId((update as Update.updateChatUserTyping).from_id);
    if(rootScope.myId === fromId || update.action._ === 'speakingInGroupCallAction') {
      return;
    }
    
    const peerId = update._ === 'updateUserTyping' ? 
      fromId : 
      -((update as Update.updateChatUserTyping).chat_id || (update as Update.updateChannelUserTyping).channel_id);
    const typings = this.typingsInPeer[peerId] ?? (this.typingsInPeer[peerId] = []);
    let typing = typings.find(t => t.userId === fromId);

    const cancelAction = () => {
      delete typing.timeout;
      //typings.findAndSplice(t => t === typing);
      const idx = typings.indexOf(typing);
      if(idx !== -1) {
        typings.splice(idx, 1);
      }

      rootScope.dispatchEvent('peer_typings', {peerId, typings});

      if(!typings.length) {
        delete this.typingsInPeer[peerId];
      }
    };

    if(typing && typing.timeout !== undefined) {
      clearTimeout(typing.timeout);
    }

    if(update.action._ === 'sendMessageCancelAction') {
      if(!typing) {
        return;
      }

      cancelAction();
      return;
    }

    if(!typing) {
      typing = {
        userId: fromId
      };

      typings.push(typing);
    }

    //console.log('updateChatUserTyping', update, typings);
    
    typing.action = update.action;
    
    const hasUser = appUsersManager.hasUser(fromId);
    if(!hasUser) {
      // let's load user here
      if(update._ === 'updateChatUserTyping') {
        if(update.chat_id && appChatsManager.hasChat(update.chat_id) && !appChatsManager.isChannel(update.chat_id)) {
          appProfileManager.getChatFull(update.chat_id).then(() => {
            if(typing.timeout !== undefined && appUsersManager.hasUser(fromId)) {
              rootScope.dispatchEvent('peer_typings', {peerId, typings});
            }
          });
        }
      }
      
      //return;
    } else {
      appUsersManager.forceUserOnline(fromId);
    }

    typing.timeout = window.setTimeout(cancelAction, 6000);
    if(hasUser) {
      rootScope.dispatchEvent('peer_typings', {peerId, typings});
    }
  };

  public getPeerTypings(peerId: number) {
    return this.typingsInPeer[peerId];
  }
}

const appProfileManager = new AppProfileManager();
MOUNT_CLASS_TO.appProfileManager = appProfileManager;
export default appProfileManager;
