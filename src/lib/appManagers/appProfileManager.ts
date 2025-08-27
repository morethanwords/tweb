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
import {ChannelParticipantsFilter, ChannelsChannelParticipants, ChannelParticipant, Chat, ChatFull, ChatParticipants, ChatPhoto, ExportedChatInvite, InputChannel, InputFile, SendMessageAction, Update, UserFull, Photo, PhotoSize, Updates, ChatParticipant, PeerSettings, SendAsPeer, InputGroupCall} from '../../layer';
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
import getPeerActiveUsernames from './utils/peers/getPeerActiveUsernames';
import getParticipantsCount from './utils/chats/getParticipantsCount';
import callbackifyAll from '../../helpers/callbackifyAll';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';

export type UserTyping = Partial<{userId: UserId, action: SendMessageAction, timeout: number}>;

const PEER_FULL_TTL = 3 * 60e3;

type GetChannelParticipantsOptions = {
  id: ChatId,
  filter?: ChannelParticipantsFilter,
  limit?: number,
  offset?: number,
  forMessagesSearch?: boolean
};

const defaultGetChannelParticipantsOptions: Partial<GetChannelParticipantsOptions> = {
  filter: {_: 'channelParticipantsRecent'},
  limit: 200,
  offset: 0
};

export class AppProfileManager extends AppManager {
  // private botInfos: any = {};
  private usersFull: {[id: UserId]: UserFull.userFull} = {};
  private chatsFull: {[id: ChatId]: ChatFull} = {};
  private fullExpiration: {[peerId: PeerId]: number} = {};
  private typingsInPeer: {[key: string]: UserTyping[]};
  private peerSettings: {[peerId: PeerId]: PeerSettings};

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateChatParticipants: this.onUpdateChatParticipants,

      updateChatParticipantAdd: this.onUpdateChatParticipantAdd,

      updateChatParticipantDelete: this.onUpdateChatParticipantDelete,

      updateUserTyping: this.onUpdateUserTyping,
      updateChatUserTyping: this.onUpdateUserTyping,
      updateChannelUserTyping: this.onUpdateUserTyping,

      updatePeerBlocked: this.onUpdatePeerBlocked,

      updatePeerSettings: this.onUpdatePeerSettings
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

    this.rootScope.addEventListener('peer_bio_edit', (peerId) => {
      this.rootScope.dispatchEvent('user_full_update', peerId.toUserId());
    });

    this.typingsInPeer = {};
    this.peerSettings = {};
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

        userFull.wallpaper = this.appThemesManager.saveWallPaper(userFull.wallpaper);

        const botInfo = userFull.bot_info;
        if(botInfo) {
          const referenceContext: ReferenceContext = {type: 'userFull', userId: id};
          botInfo.description_document = this.appDocsManager.saveDoc(botInfo.description_document, referenceContext);
          botInfo.description_photo = this.appPhotosManager.savePhoto(botInfo.description_photo, referenceContext);
        }

        userFull.business_intro = this.appBusinessManager.saveBusinessIntro(id, userFull.business_intro);

        if(userFull.personal_channel_message) {
          userFull.personal_channel_message = this.appMessagesIdsManager.generateMessageId(
            userFull.personal_channel_message,
            userFull.personal_channel_id
          );
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

  public async hasBussinesIntro(id: UserId, override?: true) {
    const profile = await this.getProfile(id, override);

    const intro = profile?.business_intro;

    return intro && (intro.title || intro.description || intro.sticker);
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

  public modifyCachedFullChat<T extends ChatFull = ChatFull>(chatId: ChatId, modify: (fullChat: T) => boolean | void) {
    this.modifyCachedFullPeer(chatId.toPeerId(true), modify as any);
  }

  public modifyCachedFullUser(userId: UserId, modify: (fullUser: UserFull) => boolean | void) {
    this.modifyCachedFullPeer(userId.toPeerId(true), modify as any);
  }

  public modifyCachedFullPeer(peerId: PeerId, modify: (fullPeer: UserFull | ChatFull) => boolean | void) {
    const fullPeer = this.getCachedProfileByPeerId(peerId);
    if(fullPeer) {
      if(modify(fullPeer) === false) {
        return;
      }

      if(peerId.isUser()) {
        this.rootScope.dispatchEvent('user_full_update', peerId.toUserId());
      } else {
        this.rootScope.dispatchEvent('chat_full_update', peerId.toChatId());
      }
    }
  }

  public isUserBlocked(userId: UserId) {
    return callbackify(this.getProfile(userId), (userFull) => {
      return !!userFull.pFlags.blocked;
    });
  }

  public isCachedUserBlocked(userId: UserId) {
    const result = this.isUserBlocked(userId);
    return result instanceof Promise ? undefined : result;
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
          this.appGroupCallsManager.saveGroupCall(chatFull.call as InputGroupCall.inputGroupCall, id);
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

  private filterParticipantsByQuery<T extends Array<ChannelParticipant | ChatParticipant>>(participants: T, q: string): T {
    const index = this.appUsersManager.createSearchIndex();
    participants.forEach((chatParticipant) => {
      const peerId = getParticipantPeerId(chatParticipant);
      index.indexObject(peerId, this.appPeersManager.getPeerSearchText(peerId));
    });

    const found = index.search(q);
    const filteredParticipants = participants.filter((chatParticipant) => {
      const peerId = getParticipantPeerId(chatParticipant);
      return found.has(peerId);
    });

    return filteredParticipants as T;
  }

  public getParticipants(options: GetChannelParticipantsOptions) {
    options = {...defaultGetChannelParticipantsOptions, ...options};
    const {id, filter} = options;
    if(this.appChatsManager.isChannel(id)) {
      return this.getChannelParticipants(options);
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

    return Promise.resolve(this.getParticipants({id})).then((chatParticipants) => {
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

  public getChannelParticipants(options: GetChannelParticipantsOptions) {
    options = {...defaultGetChannelParticipantsOptions, ...options};
    const {id, filter, offset, limit} = options;
    if(!this.appChatsManager.hasRights(id, 'view_participants')) {
      throw makeError('CHAT_ADMIN_REQUIRED');
    }

    if(this.appPeersManager.isMonoforum(id?.toPeerId(true))) {
      return {
        _: 'channels.channelParticipants',
        chats: [],
        count: 0,
        participants: [],
        users: []
      } as ChannelsChannelParticipants.channelsChannelParticipants;
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

    let sendAsPeersResult: MaybePromise<SendAsPeer[]>;
    if(options.forMessagesSearch) {
      try {
        sendAsPeersResult = this.appChatsManager.getSendAs(id);
        if(sendAsPeersResult instanceof Promise) {
          sendAsPeersResult = sendAsPeersResult.catch(() => undefined as any);
        }
      } catch(err) {

      }
    }

    return callbackifyAll([result, sendAsPeersResult], ([result, sendAsPeers]) => {
      this.appPeersManager.saveApiPeers(result as ChannelsChannelParticipants.channelsChannelParticipants);

      const q = (filter as ChannelParticipantsFilter.channelParticipantsAdmins).q;
      if(sendAsPeers) { // * insert group and self if have send as peers
        const sendAsParticipants: ChannelParticipant.channelParticipant[] = sendAsPeers.map((sendAsPeer) => {
          return {
            _: 'channelParticipant',
            date: 0,
            user_id: 0,
            peer: sendAsPeer.peer
          };
        });

        const peerId = id.toPeerId(true);
        const channelParticipant: ChannelParticipant.channelParticipant = {
          _: 'channelParticipant',
          date: 0,
          user_id: 0,
          peer: this.appPeersManager.getOutputPeer(peerId)
        };

        const myPeerId = this.appPeersManager.peerId;
        const myParticipant: ChannelParticipant.channelParticipant = {
          _: 'channelParticipant',
          date: 0,
          user_id: myPeerId.toUserId()
        };

        sendAsParticipants.unshift(channelParticipant, myParticipant);

        const participants = (result as ChannelsChannelParticipants.channelsChannelParticipants).participants.slice();
        const sendAsFiltered = this.filterParticipantsByQuery(sendAsParticipants, q);
        if(
          (sendAsFiltered.includes(channelParticipant) || !q?.trim()) &&
          !participants.some((p) => getParticipantPeerId(p) === peerId)
        ) {
          indexOfAndSplice(sendAsFiltered, channelParticipant);
          participants.unshift(channelParticipant);
        }

        for(const participant of sendAsFiltered) {
          const peerId = getParticipantPeerId(participant);
          if(!participants.some((p) => getParticipantPeerId(p) === peerId) ||
            !participants.some((p) => getParticipantPeerId(p) === myPeerId)) {
            participants.unshift(myParticipant);
            break;
          }
        }

        return {
          ...result,
          participants
        } as ChannelsChannelParticipants.channelsChannelParticipants;
      }

      if(MANUALLY_FILTER.has(filter._) && q?.trim()) {
        return {
          ...result,
          participants: this.filterParticipantsByQuery(
            (result as ChannelsChannelParticipants.channelsChannelParticipants).participants,
            q
          )
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

    const chat = this.appChatsManager.getChat(id);
    if(chat._ === 'channelForbidden') {
      throw makeError('CHANNEL_PRIVATE') as any;
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

        fullChannel.wallpaper = this.appThemesManager.saveWallPaper(fullChannel.wallpaper);

        if(fullChannel.call) {
          this.appGroupCallsManager.saveGroupCall(fullChannel.call as InputGroupCall.inputGroupCall, id);
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
            const chat = this.appChatsManager.getChat(id) as Chat.channel | Chat.channelForbidden;
            if(chat._ !== 'channelForbidden') {
              this.appChatsManager.saveApiChats([{
                _: 'channelForbidden',
                id,
                access_hash: chat.access_hash,
                title: chat.title,
                pFlags: chat.pFlags
              }]);
            }

            this.apiUpdatesManager.processLocalUpdate({
              _: 'updateChannel',
              channel_id: id
            });
            break;
        }

        throw error;
      }
    });
  }

  public getMentions(
    chatId: ChatId,
    query: string,
    threadId?: number,
    global?: boolean
  ): Promise<PeerId[]> {
    const processUserIds = (topPeers: MyTopPeer[]) => {
      const startsWithAt = query.charAt(0) === '@';
      if(startsWithAt) query = query.slice(1);

      const hasQuery = !!query.trim();
      if(!hasQuery) {
        return topPeers.map((peer) => peer.id);
      }

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
      promise = Promise.resolve(this.getChannelParticipants({
        id: chatId,
        filter: {
          _: 'channelParticipantsMentions',
          q: query,
          top_msg_id: getServerMessageId(threadId)
        },
        limit: 50,
        offset: 0
      })).then((cP) => {
        return cP.participants.map((p) => getParticipantPeerId(p));
      });
    } else if(chatId) {
      promise = Promise.resolve(this.getChatFull(chatId)).then((chatFull) => {
        return ((chatFull as ChatFull.chatFull).participants as ChatParticipants.chatParticipants).participants.map((p) => p.user_id.toPeerId());
      });
    }

    return Promise.all([
      // [],
      global ? [] as MyTopPeer[] : this.appUsersManager.getTopPeers('bots_inline').catch(() => [] as MyTopPeer[]),
      promise,
      global && this.appUsersManager.getContactsPeerIds(query, false, 'rating', 30)
    ]).then(([botsInlineTopPeers, chatMembers, searchResults]) => {
      if(searchResults) {
        searchResults = searchResults.filter((peerId) => {
          const peer = this.appPeersManager.getPeer(peerId);
          return !!getPeerActiveUsernames(peer)[0];
        });
      }

      const convertPeerIds = (peerIds: PeerId[]) => peerIds ? peerIds.map((peerId) => ({id: peerId, rating: 0})) : [];
      const peers = botsInlineTopPeers.concat(
        convertPeerIds(chatMembers),
        convertPeerIds(searchResults)
      );

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

  public refreshFullPeerIfNeeded(peerId: PeerId) {
    const full = peerId.isUser() ? this.usersFull[peerId.toUserId()] : this.chatsFull[peerId.toChatId()];
    if(full) {
      this.refreshFullPeer(peerId);
    }
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

  public getOnlines(id: ChatId): MaybePromise<number> {
    const minOnline = 1;
    if(this.appChatsManager.isBroadcast(id)) {
      return minOnline;
    }

    return callbackify(this.getChatFull(id), (chatFull) => {
      if(getParticipantsCount(chatFull) < 2) {
        return minOnline;
      }

      if(this.appChatsManager.isMegagroup(id)) {
        if((chatFull as ChatFull.channelFull).participants_count <= 100) {
          const channelParticipantsResult = this.getChannelParticipants({
            id,
            filter: {_: 'channelParticipantsRecent'},
            limit: 100
          });
          return callbackify(channelParticipantsResult, (channelParticipants) => {
            return this.reduceParticipantsForOnlineCount(channelParticipants.participants as ChannelParticipant.channelParticipant[]);
          });
        }

        const chatOnlinesResult = this.apiManager.invokeApiCacheable('messages.getOnlines', {
          peer: this.appChatsManager.getChannelInputPeer(id)
        }, {cacheSeconds: 60, syncIfHasResult: true});

        return callbackify(chatOnlinesResult, (chatOnlines) => {
          const onlines = chatOnlines.onlines ?? minOnline;
          return onlines;
        });
      }

      const _participants = (chatFull as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
      if(_participants?.participants) {
        return this.reduceParticipantsForOnlineCount(_participants.participants);
      } else {
        return minOnline;
      }
    });
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

    return callbackify(
      this.appPaymentsManager.getPremiumGiftCodeOptions(),
      (premiumGiftCodeOptions) => {
        const user = this.appUsersManager.getUser(userId);
        return premiumGiftCodeOptions.some((p) => p.users === 1) && !user?.pFlags?.premium;
      }
    );
  }

  public canViewStatistics(peerId: PeerId) {
    if(peerId.isUser()) return false;

    const chatId = peerId.toChatId();
    const chatFull = this.getCachedFullChat(chatId);
    if(!chatFull) return false;

    return !!(
      (chatFull as ChatFull.channelFull).stats_dc &&
      (chatFull as ChatFull.channelFull).pFlags.can_view_stats
      /*  && this.appChatsManager.hasRights(chatId, 'view_statistics') */
    );
  }

  public refreshPeerSettingsIfNeeded(peerId: PeerId) {
    if(this.peerSettings[peerId]) {
      delete this.peerSettings[peerId];
      callbackify(this.getPeerSettings(peerId), (peerSettings) => {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updatePeerSettings',
          peer: this.appPeersManager.getOutputPeer(peerId),
          settings: peerSettings
        });
      });
    }
  }

  public getPeerSettings(peerId: PeerId) {
    if(this.appPeersManager.isMonoforum(peerId)) return this.peerSettings[peerId] ??= {
      _: 'peerSettings',
      pFlags: {}
    };

    if(this.peerSettings[peerId]) return this.peerSettings[peerId];
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getPeerSettings',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      },
      processResult: (messagesPeerSettings) => {
        this.appChatsManager.saveApiChats(messagesPeerSettings.chats, true);
        this.appUsersManager.saveApiUsers(messagesPeerSettings.users);

        return this.peerSettings[peerId] = messagesPeerSettings.settings;
      }
    });
  }

  public hidePeerSettingsBar(peerId: PeerId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.hidePeerSettingsBar',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId)
      },
      processResult: () => {
        this.refreshPeerSettingsIfNeeded(peerId);
      }
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
        if(update.pFlags.blocked) {
          userFull.pFlags.blocked = true;
        } else {
          delete userFull.pFlags.blocked;
        }

        if(update.pFlags.blocked_my_stories_from) {
          userFull.pFlags.blocked_my_stories_from = true;
        } else {
          delete userFull.pFlags.blocked_my_stories_from;
        }
      }

      this.rootScope.dispatchEvent('user_full_update', userId);
    }

    this.rootScope.dispatchEvent('peer_block', {
      peerId,
      blocked: update.pFlags.blocked,
      blockedMyStoriesFrom: update.pFlags.blocked_my_stories_from
    });
  };

  private onUpdatePeerSettings = (update: Update.updatePeerSettings) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    this.rootScope.dispatchEvent('peer_settings', {peerId, settings: update.settings});
  };
}
