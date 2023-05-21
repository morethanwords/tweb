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

import type {MyTopPeer} from './appUsersManager';
import tsNow from '../../helpers/tsNow';
import {ChannelParticipantsFilter, ChannelsChannelParticipants, ChannelParticipant, Chat, ChatFull, ChatParticipants, ChatPhoto, ExportedChatInvite, InputChannel, InputFile, SendMessageAction, Update, UserFull, Photo, PhotoSize, Updates, ChatParticipant} from '../../layer';
import SearchIndex from '../searchIndex';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import getPhotoInput from './utils/photos/getPhotoInput';
import getParticipantPeerId from './utils/chats/getParticipantPeerId';
import ctx from '../../environment/ctx';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import assumeType from '../../helpers/assumeType';
import makeError from '../../helpers/makeError';
import callbackify from '../../helpers/callbackify';

export type UserTyping = Partial<{userId: UserId, action: SendMessageAction, timeout: number}>;

const PEER_FULL_TTL = 3 * 60e3;

export class AppProfileManager extends AppManager {
  // private botInfos: any = {};
  private usersFull: {[id: UserId]: UserFull.userFull} = {};
  private chatsFull: {[id: ChatId]: ChatFull} = {};
  private fullExpiration: {[peerId: PeerId]: number} = {};
  private typingsInPeer: {[key: string]: UserTyping[]};

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateChatParticipants: this.onUpdateChatParticipants,

      updateChatParticipantAdd: this.onUpdateChatParticipantAdd,

      updateChatParticipantDelete: this.onUpdateChatParticipantDelete,

      updateUserTyping: this.onUpdateUserTyping,
      updateChatUserTyping: this.onUpdateUserTyping,
      updateChannelUserTyping: this.onUpdateUserTyping,

      updatePeerBlocked: this.onUpdatePeerBlocked
    });

    this.rootScope.addEventListener('chat_update', (chatId) => {
      const fullChat = this.chatsFull[chatId];
      const chat: Chat.chat | Chat.channel | Chat.chatForbidden | Chat.channelForbidden = this.appChatsManager.getChat(chatId);
      if(!fullChat || !chat) {
        return;
      }

      let updated = false;
      if(!!fullChat.call !== !!(chat as Chat.chat).pFlags?.call_active) {
        updated = true;
      }

      const {photo} = chat as Chat.chat;
      if(photo) {
        const hasChatPhoto = photo._ !== 'chatPhotoEmpty';
        const hasFullChatPhoto = !!(fullChat.chat_photo && fullChat.chat_photo._ !== 'photoEmpty'); // chat_photo can be missing
        if(
          hasChatPhoto !== hasFullChatPhoto || (
            hasChatPhoto &&
            photo.photo_id !== fullChat.chat_photo?.id
          )
        ) {
          updated = true;
        }
      }

      if(updated) {
        this.refreshFullPeer(chatId.toPeerId(true));
      }
    });

    this.rootScope.addEventListener('channel_update', (chatId) => {
      this.refreshFullPeer(chatId.toPeerId(true));
    });

    // * genius
    this.rootScope.addEventListener('chat_full_update', (chatId) => {
      this.rootScope.dispatchEvent('peer_full_update', chatId.toPeerId(true));
    });

    // * genius
    this.rootScope.addEventListener('user_full_update', (userId) => {
      this.rootScope.dispatchEvent('peer_full_update', userId.toPeerId(false));
    });

    this.rootScope.addEventListener('invalidate_participants', (chatId) => {
      this.invalidateChannelParticipants(chatId);
    });

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

  public getProfile(id: UserId, override?: true) {
    if(this.usersFull[id] && !override && Date.now() < this.fullExpiration[id.toPeerId()]) {
      return this.usersFull[id];
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'users.getFullUser',
      params: {
        id: this.appUsersManager.getUserInput(id)
      },
      processResult: (usersUserFull) => {
        this.appChatsManager.saveApiChats(usersUserFull.chats, true);
        this.appUsersManager.saveApiUsers(usersUserFull.users);

        const userFull = usersUserFull.full_user;
        const peerId = id.toPeerId(false);
        if(userFull.profile_photo) {
          userFull.profile_photo = this.appPhotosManager.savePhoto(userFull.profile_photo, {type: 'profilePhoto', peerId});
        }

        const botInfo = userFull.bot_info;
        if(botInfo) {
          const referenceContext: ReferenceContext = {type: 'userFull', userId: id};
          botInfo.description_document = this.appDocsManager.saveDoc(botInfo.description_document, referenceContext);
          botInfo.description_photo = this.appPhotosManager.savePhoto(botInfo.description_photo, referenceContext);
        }

        this.appNotificationsManager.savePeerSettings({
          peerId,
          settings: userFull.notify_settings
        });

        this.usersFull[id] = userFull;
        this.fullExpiration[peerId] = Date.now() + PEER_FULL_TTL;

        /* if(userFull.bot_info) {
          userFull.bot_info = this.saveBotInfo(userFull.bot_info) as any;
        } */

        // appMessagesManager.savePinnedMessage(id, userFull.pinned_msg_id);

        this.rootScope.dispatchEvent('user_full_update', id);
        return userFull;
      }
    });
  }

  public getProfileByPeerId(peerId: PeerId, override?: true) {
    if(this.appPeersManager.isAnyChat(peerId)) return this.getChatFull(peerId.toChatId(), override);
    else return this.getProfile(peerId.toUserId(), override);
  }

  public getCachedFullChat(chatId: ChatId) {
    return this.chatsFull[chatId];
  }

  public getCachedFullUser(userId: UserId) {
    return this.usersFull[userId];
  }

  public getCachedProfileByPeerId(peerId: PeerId) {
    return peerId.isUser() ? this.getCachedFullUser(peerId.toUserId()) : this.getCachedFullChat(peerId.toChatId());
  }

  public async getFullPhoto(peerId: PeerId) {
    const profile = await this.getProfileByPeerId(peerId);
    switch(profile._) {
      case 'userFull':
        return profile.profile_photo;
      case 'channelFull':
      case 'chatFull':
        return profile.chat_photo;
    }
  }

  /* public getPeerBots(peerId: PeerId) {
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

    return this.getChatFull(peerId.toChatId()).then((chatFull: any) => {
      chatFull.bot_info.forEach((botInfo: any) => {
        peerBots.push(this.saveBotInfo(botInfo))
      });
      return peerBots;
    });
  } */

  public getChatFull(id: ChatId, override?: true) {
    if(this.appChatsManager.isChannel(id)) {
      return this.getChannelFull(id, override);
    }

    const peerId = id.toPeerId(true);
    const fullChat = this.chatsFull[id] as ChatFull.chatFull;
    if(fullChat && !override && Date.now() < this.fullExpiration[peerId]) {
      const chat = this.appChatsManager.getChat(id) as Chat.chat;
      if(
        chat.pFlags.left ||
        chat.pFlags.deactivated ||
        chat.version === (fullChat.participants as ChatParticipants.chatParticipants).version
      ) {
        return fullChat as ChatFull;
      }
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getFullChat',
      params: {
        chat_id: id
      },
      processResult: (result) => {
        this.appChatsManager.saveApiChats(result.chats, true);
        this.appUsersManager.saveApiUsers(result.users);
        const chatFull = result.full_chat as ChatFull.chatFull;
        if(chatFull && chatFull.chat_photo && chatFull.chat_photo.id) {
          chatFull.chat_photo = this.appPhotosManager.savePhoto(chatFull.chat_photo, {type: 'profilePhoto', peerId});
        }

        if(chatFull.call) {
          this.appGroupCallsManager.saveGroupCall(chatFull.call, id);
        }

        // appMessagesManager.savePinnedMessage(peerId, fullChat.pinned_msg_id);
        this.appNotificationsManager.savePeerSettings({
          peerId,
          settings: chatFull.notify_settings
        });

        this.chatsFull[id] = chatFull;
        this.fullExpiration[peerId] = Date.now() + PEER_FULL_TTL;
        this.rootScope.dispatchEvent('chat_full_update', id);

        return chatFull;
      }
    });
  }

  public async getChatInviteLink(id: ChatId, force?: boolean) {
    const chatFull = await this.getChatFull(id);
    if(!force &&
      chatFull.exported_invite &&
      chatFull.exported_invite._ == 'chatInviteExported') {
      return chatFull.exported_invite.link;
    }

    return this.apiManager.invokeApi('messages.exportChatInvite', {
      peer: this.appPeersManager.getInputPeerById(id.toPeerId(true))
    }).then((exportedInvite) => {
      if(this.chatsFull[id] !== undefined) {
        this.chatsFull[id].exported_invite = exportedInvite;
      }

      return (exportedInvite as ExportedChatInvite.chatInviteExported).link;
    });
  }

  private filterParticipantsByQuery(participants: (ChannelParticipant | ChatParticipant)[], q: string) {
    const index = this.appUsersManager.createSearchIndex();
    participants.forEach((chatParticipant) => {
      const peerId = getParticipantPeerId(chatParticipant);
      index.indexObject(peerId, this.appUsersManager.getUserSearchText(peerId));
    });

    const found = index.search(q);
    const filteredParticipants = participants.filter((chatParticipant) => {
      const peerId = getParticipantPeerId(chatParticipant);
      return found.has(peerId);
    });

    return filteredParticipants;
  }

  public getParticipants(
    id: ChatId,
    filter: ChannelParticipantsFilter = {_: 'channelParticipantsRecent'},
    limit = 200,
    offset = 0
  ) {
    if(this.appChatsManager.isChannel(id)) {
      return this.getChannelParticipants(id, filter, limit, offset);
    }

    return callbackify(this.getChatFull(id), (chatFull) => {
      const chatParticipants = (chatFull as ChatFull.chatFull).participants;
      if(chatParticipants._ !== 'chatParticipants') {
        throw makeError('CHAT_PRIVATE');
      }

      if(filter._ === 'channelParticipantsSearch' && filter.q.trim()) {
        return {
          ...chatParticipants,
          participants: this.filterParticipantsByQuery(chatParticipants.participants, filter.q)
        };
      }

      return chatParticipants;
    });
  }

  public getParticipant(id: ChatId, peerId: PeerId) {
    if(this.appChatsManager.isChannel(id)) {
      return this.getChannelParticipant(id, peerId);
    }

    return Promise.resolve(this.getParticipants(id)).then((chatParticipants) => {
      assumeType<ChatParticipants.chatParticipants>(chatParticipants);
      const found = chatParticipants.participants.find((chatParticipant) => {
        if(getParticipantPeerId(chatParticipant) === peerId) {
          return chatParticipant;
        }
      });

      if(!found) {
        throw makeError('USER_NOT_PARTICIPANT');
      }

      return found;
    });
  }

  public getChannelParticipants(
    id: ChatId,
    filter: ChannelParticipantsFilter = {_: 'channelParticipantsRecent'},
    limit = 200,
    offset = 0
  ) {
    if(!this.appChatsManager.hasRights(id, 'view_participants')) {
      throw makeError('CHAT_ADMIN_REQUIRED');
    }

    const MANUALLY_FILTER: Set<ChannelParticipantsFilter['_']> = new Set([
      'channelParticipantsAdmins'
    ]);

    const result = this.apiManager.invokeApiCacheable('channels.getParticipants', {
      channel: this.appChatsManager.getChannelInput(id),
      filter,
      offset,
      limit,
      hash: '0'
    }, {cacheSeconds: 60, syncIfHasResult: true});

    return callbackify(result, (result) => {
      this.appUsersManager.saveApiUsers((result as ChannelsChannelParticipants.channelsChannelParticipants).users);
      this.appChatsManager.saveApiChats((result as ChannelsChannelParticipants.channelsChannelParticipants).chats);

      const q = (filter as ChannelParticipantsFilter.channelParticipantsAdmins).q;
      if(MANUALLY_FILTER.has(filter._) && q?.trim()) {
        return {
          ...result,
          participants: this.filterParticipantsByQuery((result as ChannelsChannelParticipants.channelsChannelParticipants).participants, q)
        } as ChannelsChannelParticipants.channelsChannelParticipants;
      }

      return result as ChannelsChannelParticipants.channelsChannelParticipants;
    });
  }

  public getChannelParticipant(id: ChatId, peerId: PeerId) {
    return this.apiManager.invokeApiSingle('channels.getParticipant', {
      channel: this.appChatsManager.getChannelInput(id),
      participant: this.appPeersManager.getInputPeerById(peerId)
    }).then((channelParticipant) => {
      this.appUsersManager.saveApiUsers(channelParticipant.users);
      return channelParticipant.participant;
    });
  }

  public getChannelFull(id: ChatId, override?: true) {
    const peerId = id.toPeerId(true);
    if(this.chatsFull[id] !== undefined && !override && Date.now() < this.fullExpiration[peerId]) {
      return this.chatsFull[id] as ChatFull.channelFull;
    }

    return this.apiManager.invokeApiSingleProcess({
      method: 'channels.getFullChannel',
      params: {
        channel: this.appChatsManager.getChannelInput(id)
      },
      processResult: (result) => {
        this.appChatsManager.saveApiChats(result.chats, true);
        this.appUsersManager.saveApiUsers(result.users);
        const fullChannel = result.full_chat as ChatFull.channelFull;
        if(fullChannel && fullChannel.chat_photo.id) {
          fullChannel.chat_photo = this.appPhotosManager.savePhoto(fullChannel.chat_photo, {type: 'profilePhoto', peerId});
          // appPhotosManager.savePhoto(fullChannel.chat_photo);
        }

        if(fullChannel.call) {
          this.appGroupCallsManager.saveGroupCall(fullChannel.call, id);
        }

        this.appNotificationsManager.savePeerSettings({
          peerId,
          settings: fullChannel.notify_settings
        });

        this.chatsFull[id] = fullChannel;
        this.fullExpiration[peerId] = Date.now() + PEER_FULL_TTL;
        this.rootScope.dispatchEvent('chat_full_update', id);

        return fullChannel;
      },
      processError: (error) => {
        switch(error.type) {
          case 'CHANNEL_PRIVATE':
            const channel = this.appChatsManager.getChat(id) as Chat.channel | Chat.channelForbidden;
            this.apiUpdatesManager.processUpdateMessage({
              _: 'updates',
              updates: [{
                _: 'updateChannel',
                channel_id: id
              }],
              chats: [channel._ === 'channelForbidden' ? channel : {
                _: 'channelForbidden',
                id,
                access_hash: channel.access_hash,
                title: channel.title,
                pFlags: channel.pFlags
              }],
              users: []
            } as Updates.updates);
            break;
        }

        throw error;
      }
    });
  }

  public getMentions(chatId: ChatId, query: string, threadId?: number): Promise<PeerId[]> {
    const processUserIds = (topPeers: MyTopPeer[]) => {
      const startsWithAt = query.charAt(0) === '@';
      if(startsWithAt) query = query.slice(1);
      /* const startsWithAt = query.charAt(0) === '@';
      if(startsWithAt) query = query.slice(1);

      const index = new SearchIndex<number>(!startsWithAt, !startsWithAt); */
      const index = new SearchIndex<PeerId>({
        ignoreCase: true
      });

      const ratingMap: Map<PeerId, number> = new Map();
      topPeers.forEach((peer) => {
        index.indexObject(peer.id, this.appUsersManager.getUserSearchText(peer.id));
        ratingMap.set(peer.id, peer.rating);
      });

      const peerIds = Array.from(index.search(query));
      peerIds.sort((a, b) => ratingMap.get(b) - ratingMap.get(a));
      return peerIds;
    };

    let promise: Promise<PeerId[]>;
    if(this.appChatsManager.isChannel(chatId)) {
      promise = Promise.resolve(this.getChannelParticipants(chatId, {
        _: 'channelParticipantsMentions',
        q: query,
        top_msg_id: getServerMessageId(threadId)
      }, 50, 0)).then((cP) => {
        return cP.participants.map((p) => getParticipantPeerId(p));
      });
    } else if(chatId) {
      promise = Promise.resolve(this.getChatFull(chatId)).then((chatFull) => {
        return ((chatFull as ChatFull.chatFull).participants as ChatParticipants.chatParticipants).participants.map((p) => p.user_id.toPeerId());
      });
    } else {
      promise = Promise.resolve([]);
    }

    return Promise.all([
      // [],
      this.appUsersManager.getTopPeers('bots_inline').catch(() => [] as MyTopPeer[]),
      promise
    ]).then((results) => {
      const peers = results[0].concat(results[1].map((peerId) => ({id: peerId, rating: 0})));

      return processUserIds(peers);
    });
  }

  public invalidateChannelParticipants(id: ChatId) {
    this.apiManager.clearCache('channels.getParticipants', (params) => (params.channel as InputChannel.inputChannel).channel_id === id);

    if(!this.getCachedFullChat(id)) {
      return;
    }

    this.refreshFullPeer(id.toPeerId(true));
  }

  private refreshFullPeer(peerId: PeerId) {
    if(peerId.isUser()) {
      const userId = peerId.toUserId();
      delete this.usersFull[userId];
      this.rootScope.dispatchEvent('user_full_update', userId);
    } else {
      const chatId = peerId.toChatId();
      delete this.chatsFull[chatId];
      this.rootScope.dispatchEvent('chat_full_update', chatId);
    }

    // ! эта строчка будет создавать race condition:
    // ! запрос вернёт chat с установленным флагом call_not_empty, хотя сам апдейт уже будет применён
    // this.getProfileByPeerId(peerId, true);
  }

  public updateProfile(first_name?: string, last_name?: string, about?: string) {
    return this.apiManager.invokeApi('account.updateProfile', {
      first_name,
      last_name,
      about
    }).then((user) => {
      this.appUsersManager.saveApiUser(user);

      if(about !== undefined) {
        const peerId = user.id.toPeerId();
        const userFull = this.usersFull[user.id];
        if(userFull) {
          userFull.about = about;
        }

        this.rootScope.dispatchEvent('peer_bio_edit', peerId);
      }

      return this.getProfile(user.id, true);
    });
  }

  public setBotInfo(botId: BotId, name?: string, about?: string) {
    return this.apiManager.invokeApi('bots.setBotInfo', {
      lang_code: '',
      bot: this.appUsersManager.getUserInput(botId),
      name,
      about
    }).then(() => {
      const user = this.appUsersManager.getUser(botId);
      if(name !== undefined) {
        this.appUsersManager.saveApiUser({
          ...user,
          first_name: name
        });
      }

      const userFull = this.getCachedFullUser(botId);
      if(about !== undefined) {
        if(userFull) {
          userFull.about = about;
        }

        this.rootScope.dispatchEvent('peer_bio_edit', botId.toPeerId());
      }

      return this.getProfile(botId, true);
    });
  }

  public getBotInfo(botId: BotId) {
    return this.apiManager.invokeApiSingle('bots.getBotInfo', {
      bot: this.appUsersManager.getUserInput(botId),
      lang_code: ''
    });
  }

  public uploadProfilePhoto(inputFile: InputFile, botId?: BotId) {
    return this.apiManager.invokeApi('photos.uploadProfilePhoto', {
      file: inputFile,
      bot: botId ? this.appUsersManager.getUserInput(botId) : undefined
    }).then((updateResult) => {
      // ! sometimes can have no user in users
      const photo = updateResult.photo as Photo.photo;
      if(!updateResult.users.length) {
        const strippedThumb = photo.sizes.find((size) => size._ === 'photoStrippedSize') as PhotoSize.photoStrippedSize;
        updateResult.users.push({
          ...(botId ? this.appUsersManager.getUser(botId) : this.appUsersManager.getSelf()),
          photo: {
            _: 'userProfilePhoto',
            dc_id: photo.dc_id,
            photo_id: photo.id,
            stripped_thumb: strippedThumb?.bytes,
            pFlags: {

            }
          }
        });
      }
      this.appUsersManager.saveApiUsers(updateResult.users);

      const peerId = botId ? botId.toPeerId() : this.appPeersManager.peerId;
      this.appPhotosManager.savePhoto(updateResult.photo, {
        type: 'profilePhoto',
        peerId
      });

      const userId = peerId.toUserId();
      // this.apiUpdatesManager.processLocalUpdate({
      //   _: 'updateUserPhoto',
      //   user_id: userId,
      //   date: tsNow(true),
      //   photo: this.appUsersManager.getUser(userId).photo,
      //   previous: true
      // });
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateUser',
        user_id: userId
      });
    });
  }

  public deletePhotos(photoIds: string[]) {
    return this.apiManager.invokeApiSingle('photos.deletePhotos', {
      id: photoIds.map((photoId) => {
        const photo = this.appPhotosManager.getPhoto(photoId);
        return getPhotoInput(photo);
      })
    }).then((deletedList) => {

    });
  }

  private verifyParticipantForOnlineCount(participant: {user_id: UserId}) {
    const user = this.appUsersManager.getUser(participant.user_id);
    return !!(user && user.status && user.status._ === 'userStatusOnline');
  }

  private reduceParticipantsForOnlineCount(participants: {user_id: UserId}[]) {
    return participants.reduce((acc, participant) => {
      return acc + +this.verifyParticipantForOnlineCount(participant);
    }, 0);
  }

  public async getOnlines(id: ChatId): Promise<number> {
    const minOnline = 1;
    if(this.appChatsManager.isBroadcast(id)) {
      return minOnline;
    }

    const chatInfo = await this.getChatFull(id);
    if(this.appChatsManager.isMegagroup(id)) {
      if((chatInfo as ChatFull.channelFull).participants_count <= 100) {
        const channelParticipants = await this.getChannelParticipants(id, {_: 'channelParticipantsRecent'}, 100);
        return this.reduceParticipantsForOnlineCount(channelParticipants.participants as ChannelParticipant.channelParticipant[]);
      }

      const res = await this.apiManager.invokeApiCacheable('messages.getOnlines', {
        peer: this.appChatsManager.getChannelInputPeer(id)
      }, {cacheSeconds: 60});

      const onlines = res.onlines ?? minOnline;
      return onlines;
    }

    const _participants = (chatInfo as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
    if(_participants?.participants) {
      return this.reduceParticipantsForOnlineCount(_participants.participants);
    } else {
      return minOnline;
    }
  }

  private getTypingsKey(peerId: PeerId, threadId?: number) {
    return peerId + (threadId ? `_${threadId}` : '');
  }

  public getPeerTypings(peerId: PeerId, threadId?: number) {
    return this.typingsInPeer[this.getTypingsKey(peerId, threadId)];
  }

  public canGiftPremium(userId: UserId) {
    const user = this.appUsersManager.getUser(userId);
    if(user?.pFlags?.premium) {
      return false;
    }

    return callbackify(this.getProfile(userId), (userFull) => {
      const user = this.appUsersManager.getUser(userId);
      return !!userFull.premium_gifts && !user?.pFlags?.premium;
    });
  }

  private onUpdateChatParticipants = (update: Update.updateChatParticipants) => {
    const participants = update.participants;
    if(participants._ !== 'chatParticipants') {
      return;
    }

    const chatId = participants.chat_id;
    const chatFull = this.chatsFull[chatId] as ChatFull.chatFull;
    if(chatFull !== undefined) {
      chatFull.participants = participants;
      this.rootScope.dispatchEvent('chat_full_update', chatId);
    }
  };

  private onUpdateChatParticipantAdd = (update: Update.updateChatParticipantAdd) => {
    const chatFull = this.chatsFull[update.chat_id] as ChatFull.chatFull;
    if(chatFull === undefined) {
      return;
    }

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
    this.rootScope.dispatchEvent('chat_full_update', update.chat_id);
  };

  private onUpdateChatParticipantDelete = (update: Update.updateChatParticipantDelete) => {
    const chatFull = this.chatsFull[update.chat_id] as ChatFull.chatFull;
    if(chatFull === undefined) {
      return;
    }

    const _participants = chatFull.participants as ChatParticipants.chatParticipants;
    const participants = _participants.participants || [];
    for(let i = 0, length = participants.length; i < length; i++) {
      if(participants[i].user_id === update.user_id) {
        participants.splice(i, 1);
        _participants.version = update.version;
        this.rootScope.dispatchEvent('chat_full_update', update.chat_id);
        return;
      }
    }
  };

  private onUpdateUserTyping = (update: Update.updateUserTyping | Update.updateChatUserTyping | Update.updateChannelUserTyping) => {
    const fromId = (update as Update.updateUserTyping).user_id ?
      (update as Update.updateUserTyping).user_id.toPeerId() :
      this.appPeersManager.getPeerId((update as Update.updateChatUserTyping).from_id);
    if(this.appPeersManager.peerId === fromId || update.action._ === 'speakingInGroupCallAction') {
      return;
    }

    const topMsgId = (update as Update.updateChannelUserTyping).top_msg_id;
    const threadId = topMsgId ? this.appMessagesIdsManager.generateMessageId(topMsgId, (update as Update.updateChannelUserTyping).channel_id) : undefined;
    const peerId = this.appPeersManager.getPeerId(update);
    const key = this.getTypingsKey(peerId, threadId);
    const typings = this.typingsInPeer[key] ??= [];
    const action = update.action;
    let typing = typings.find((t) => t.userId === fromId);

    if((action as SendMessageAction.sendMessageEmojiInteraction).msg_id) {
      (action as SendMessageAction.sendMessageEmojiInteraction).msg_id = this.appMessagesIdsManager.generateMessageId((action as SendMessageAction.sendMessageEmojiInteraction).msg_id, (update as Update.updateChannelUserTyping).channel_id);
    }

    const cancelAction = () => {
      delete typing.timeout;
      // typings.findAndSplice((t) => t === typing);
      const idx = typings.indexOf(typing);
      if(idx !== -1) {
        typings.splice(idx, 1);
      }

      this.rootScope.dispatchEvent('peer_typings', {peerId, threadId, typings});

      if(!typings.length) {
        delete this.typingsInPeer[key];
      }
    };

    if(typing?.timeout !== undefined) {
      clearTimeout(typing.timeout);
    }

    if(action._ === 'sendMessageCancelAction') {
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

    // console.log('updateChatUserTyping', update, typings);

    typing.action = action;

    const hasUser = this.appUsersManager.hasUser(fromId);
    if(!hasUser) {
      // let's load user here
      if(update._ === 'updateChatUserTyping') {
        if(update.chat_id && this.appChatsManager.hasChat(update.chat_id) && !this.appChatsManager.isChannel(update.chat_id)) {
          Promise.resolve(this.getChatFull(update.chat_id)).then(() => {
            if(typing.timeout !== undefined && this.appUsersManager.hasUser(fromId)) {
              this.rootScope.dispatchEvent('peer_typings', {peerId, threadId, typings});
            }
          });
        }
      }

      // return;
    } else {
      this.appUsersManager.forceUserOnline(fromId);
    }

    typing.timeout = ctx.setTimeout(cancelAction, 6000);
    if(hasUser) {
      this.rootScope.dispatchEvent('peer_typings', {peerId, threadId, typings});
    }
  };

  private onUpdatePeerBlocked = (update: Update.updatePeerBlocked) => {
    const peerId = this.appPeersManager.getPeerId(update.peer_id);
    if(this.appPeersManager.isUser(peerId)) {
      const userId = peerId.toUserId();
      const userFull = this.usersFull[userId];
      if(userFull) {
        if(update.blocked) userFull.pFlags.blocked = true;
        else delete userFull.pFlags.blocked;
      }

      this.rootScope.dispatchEvent('user_full_update', userId);
    }

    this.rootScope.dispatchEvent('peer_block', {peerId, blocked: update.blocked});
  };
}
