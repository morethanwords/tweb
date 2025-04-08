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

import deepEqual from '../../helpers/object/deepEqual';
import isObject from '../../helpers/object/isObject';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import {ChannelParticipant, ChannelsCreateChannel, ChannelsSendAsPeers, Chat, ChatAdminRights, ChatBannedRights, ChatFull, ChatInvite, ChatParticipant, ChatPhoto, ChatReactions, EmojiStatus, InputChannel, InputChatPhoto, InputFile, InputPeer, MessagesChats, MessagesSponsoredMessages, Peer, SponsoredMessage, Update, Updates} from '../../layer';
import {AppManager} from './manager';
import hasRights from './utils/chats/hasRights';
import getParticipantPeerId from './utils/chats/getParticipantPeerId';
import {AppStoragesManager} from './appStoragesManager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import {randomLong} from '../../helpers/random';
import tsNow from '../../helpers/tsNow';
import getPeerActiveUsernames from './utils/peers/getPeerActiveUsernames';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import getPeerId from './utils/peers/getPeerId';
import callbackify from '../../helpers/callbackify';

export type Channel = Chat.channel;
export type ChatRights = keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags'] |
  'change_type' | 'change_permissions' | 'delete_chat' | 'view_participants' |
  'invite_links' | 'create_giveaway'/*  | 'view_statistics' */;

const TEST_SPONSORED = false;

export class AppChatsManager extends AppManager {
  private storage: AppStoragesManager['storages']['chats'];

  private chats: {[id: ChatId]: Exclude<Chat, Chat.chatEmpty>};
  // private usernames: any;
  // private channelAccess: any;
  // private megagroups: {[id: number]: true};

  private recommendations: {[chatId: ChatId]: MaybePromise<MessagesChats>};

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateChannelParticipant: this.onUpdateChannelParticipant,

      updateChatDefaultBannedRights: this.onUpdateChatDefaultBannedRights
    });

    return Promise.all([
      this.appStateManager.getState(),
      this.appStoragesManager.loadStorage('chats')
    ]).then(([state, {results: chats, storage}]) => {
      this.storage = storage;

      this.saveApiChats(chats);

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

      this.rootScope.addEventListener('premium_toggle', () => {
        this.recommendations = {};
      });
    });
  }

  public clear = (init = false) => {
    if(!init) {
      for(const chatId in this.chats) {
        if(!chatId) continue;
        if(!this.peersStorage.isPeerNeeded(chatId.toPeerId(true))) {
          const chat = this.chats[chatId];
          this.appUsersManager.modifyUsernamesCache(chat, false);

          this.storage.delete(chatId);
          delete this.chats[chatId];
        }
      }
    } else {
      this.chats = {};
    }

    this.recommendations = {};
  };

  public saveApiChats(apiChats: any[], override?: boolean) {
    if(!apiChats || (apiChats as any).saved) return;
    (apiChats as any).saved = true;
    apiChats.forEach((chat) => this.saveApiChat(chat, override));
  }

  public saveApiChat(chat: Chat, override?: boolean) {
    if(!chat || chat._ === 'chatEmpty') return;
    /* if(chat._ !== 'chat' && chat._ !== 'channel') {
      return;
    } */

    // * exclude from state
    // defineNotNumerableProperties(chat, ['rTitle', 'initials']);

    const oldChat = this.chats[chat.id];

    /* if(oldChat && !override) {
      return;
    } */

    (chat as Chat.chat).pFlags ??= {};

    if((chat as Chat.channel).pFlags.min && oldChat !== undefined) {
      return;
    }

    if(chat._ === 'channel' &&
        chat.participants_count === undefined &&
        oldChat !== undefined &&
        (oldChat as Chat.channel).participants_count) {
      chat.participants_count = (oldChat as Chat.channel).participants_count;
    }

    if((chat as Chat.channel).photo?._ === 'chatPhotoEmpty') {
      delete (chat as Chat.channel).photo;
    }

    const changedUsername = this.appUsersManager.setUsernameToCache(chat, oldChat);

    /* if(chat.username) {
      let searchUsername = searchIndexManager.cleanUsername(chat.username);
      this.usernames[searchUsername] = chat.id;
    } */

    if((chat as Chat.channel).emoji_status?._ === 'emojiStatusEmpty') {
      delete (chat as Chat.channel).emoji_status;
    }

    const peerId = chat.id.toPeerId(true);
    if(oldChat === undefined) {
      this.chats[chat.id] = chat;
      this.mirrorChat(chat);
    } else {
      const oldPhotoId = ((oldChat as Chat.chat).photo as ChatPhoto.chatPhoto)?.photo_id;
      const newPhotoId = ((chat as Chat.chat).photo as ChatPhoto.chatPhoto)?.photo_id;
      const toggledForum = (oldChat as Chat.channel).pFlags.forum !== (chat as Chat.channel).pFlags.forum;
      const changedPhoto = oldPhotoId !== newPhotoId || toggledForum;
      const changedEmojiStatus = ((oldChat as Chat.channel).emoji_status as EmojiStatus.emojiStatus)?.document_id !==
        ((chat as Chat.channel).emoji_status as EmojiStatus.emojiStatus)?.document_id;

      const changedTitle = oldChat.title !== chat.title || changedUsername;

      const changedAnyBadge = changedEmojiStatus ||
        (oldChat as Chat.channel).pFlags.verified !== (chat as Chat.channel).pFlags.verified ||
        (oldChat as Chat.channel).pFlags.scam !== (chat as Chat.channel).pFlags.scam ||
        (oldChat as Chat.channel).pFlags.fake !== (chat as Chat.channel).pFlags.fake;

      const changedParticipation = (oldChat as Chat.channel).pFlags.left !== (chat as Chat.channel).pFlags.left;

      const changedProfileSignatures = (oldChat as Chat.channel).pFlags.signature_profiles !== (chat as Chat.channel).pFlags.signature_profiles;

      const storiesCallback = this.appStoriesManager.saveApiPeerStories(chat as Chat.channel, oldChat as Chat.channel);

      safeReplaceObject(oldChat, chat);
      this.mirrorChat(oldChat);
      this.rootScope.dispatchEvent('chat_update', chat.id);

      storiesCallback?.();

      if(changedParticipation) {
        this.rootScope.dispatchEvent('chat_participation', {chatId: chat.id, left: !!(chat as Chat.channel).pFlags.left});
      }

      if(changedPhoto) {
        this.rootScope.dispatchEvent('avatar_update', {peerId});
      }

      if(changedTitle || changedAnyBadge) {
        this.rootScope.dispatchEvent('peer_title_edit', {peerId});
      }

      if(toggledForum) {
        this.rootScope.dispatchEvent('chat_toggle_forum', {chatId: chat.id, enabled: !!(chat as Chat.channel).pFlags.forum});
      }

      if(changedProfileSignatures) {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateChannelReload',
          channel_id: chat.id
        });
      }
    }

    if(this.peersStorage.isPeerNeeded(peerId)) {
      this.storage.set({
        [chat.id]: chat
      });
    }
  }

  private mirrorChat(chat: Chat) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'peers',
      key: '' + chat.id.toPeerId(true),
      value: chat,
      accountNumber: this.getAccountNumber()
    });
  }

  public getChat(id: ChatId) {
    return this.chats[id];
  }

  public getChats() {
    return this.chats;
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
    const chat = this.getChat(id) as Chat.chat;
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

  public updateChannelPaidMessagesPrice(id: ChatId, stars: number) {
    return this.apiManager.invokeApi('channels.updatePaidMessagesPrice', {
      channel: this.getChannelInput(id),
      send_paid_messages_stars: stars
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

  public isForum(id: ChatId) {
    const chat = this.chats[id];
    return !!(chat as Chat.channel)?.pFlags?.forum;
  }

  public isBroadcast(id: ChatId) {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public isInChat(id: ChatId) {
    let good = true;
    const chat: Chat = this.getChat(id);
    if(!chat ||
      chat._ === 'channelForbidden' ||
      chat._ === 'chatForbidden' ||
      (chat as any as Chat.chatEmpty)._ === 'chatEmpty' ||
      (chat as Chat.chat).pFlags.left ||
      // || (chat as any).pFlags.kicked
      (chat as Chat.chat).pFlags.deactivated) {
      good = false;
    }

    return good;
  }

  /**
   * The amount of stars necessary to be paid for every message if the target chat had enabled it
   */
  public async getStarsAmount(chatId: ChatId): Promise<number | undefined> {
    const chat = this.getChat(chatId);
    if(chat?._ !== 'channel') return;

    return !chat.admin_rights && +chat.send_paid_messages_stars || undefined;
  }

  public isPublic(id: ChatId) {
    const chat: Chat = this.getChat(id);
    return !!getPeerActiveUsernames(chat)[0];
  }

  public getChannelInput(id: ChatId): InputChannel {
    const chat: Chat = this.getChat(id);
    if(!chat || !(chat as Chat.channel).access_hash) {
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
      access_hash: (this.getChat(id) as Chat.channel).access_hash/*  || this.channelAccess[id] */ || 0
    };
  }

  public hasChat(id: ChatId, allowMin?: true) {
    const chat = this.chats[id];
    return isObject(chat) && (allowMin || !(chat as Chat.channel).pFlags.min);
  }

  public getChatString(id: ChatId) {
    const chat = this.getChat(id);
    if(this.isChannel(id)) {
      return (this.isMegagroup(id) ? 's' : 'c') + id + '_' + (chat as Chat.channel).access_hash;
    }
    return 'g' + id;
  }

  public getChatSearchText(id: ChatId) {
    const chat = this.chats[id];
    if(!chat) {
      return '';
    }

    const arr: string[] = [
      chat.title,
      ...getPeerActiveUsernames(chat)
    ];

    return arr.filter(Boolean).join(' ');
  }

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
    }).then((messagesInvitedUsers) => {
      const timestamp = tsNow(true);
      const participantUpdates: Update.updateChannelParticipant[] = userIds.map((userId) => {
        return this.generateUpdateChannelParticipant({
          chatId: id,
          newParticipant: {
            _: 'channelParticipant',
            date: timestamp,
            user_id: userId
          }
        });
      });

      participantUpdates.forEach((update) => {
        this.apiUpdatesManager.processLocalUpdate(update);
      });

      this.onChatUpdatedForce(id, messagesInvitedUsers.updates);
      return messagesInvitedUsers.missing_invitees;
    });
  }

  public createChat(title: string, userIds: UserId[]): Promise<ChatId> {
    return this.apiManager.invokeApi('messages.createChat', {
      users: userIds.map((u) => this.appUsersManager.getUserInput(u)),
      title
    }).then((invitedUsers) => {
      this.apiUpdatesManager.processUpdateMessage(invitedUsers.updates);

      const chatId = (invitedUsers.updates as Updates.updates).chats[0].id;
      return chatId;
    });
  }

  private onChatUpdated = (chatId: ChatId, updates?: Updates, forceInvalidation?: boolean) => {
    // console.log('onChatUpdated', chatId, updates);

    this.apiUpdatesManager.processUpdateMessage(updates);
    // * can have no updates on editAdmin
    if((forceInvalidation || (updates as Updates.updates)?.updates?.length) && this.isChannel(chatId)) {
      this.rootScope.dispatchEvent('invalidate_participants', chatId);
    }
  };

  private onChatUpdatedForce = (chatId: ChatId, updates?: Updates) => {
    return this.onChatUpdated(chatId, updates, true);
  }

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

  public addToChat(id: ChatId, userId: UserId) {
    if(this.isChannel(id)) return this.inviteToChannel(id, [userId]);
    else return this.addChatUser(id, userId);
  }

  public addChatUser(id: ChatId, userId: UserId, fwdLimit = 100) {
    return this.apiManager.invokeApi('messages.addChatUser', {
      chat_id: id,
      user_id: this.appUsersManager.getUserInput(userId),
      fwd_limit: fwdLimit
    }).then((messagesInvitedUsers) => {
      this.onChatUpdated(id, messagesInvitedUsers.updates);
      return messagesInvitedUsers.missing_invitees;
    });
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
    // return this.leaveChat(id).then(() => {
    return this.apiManager.invokeApi('messages.deleteChat', {
      chat_id: id
    });
    // });
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

  public updateUsername(id: ChatId, username: string, doNotRefresh?: boolean) {
    const promise = this.apiManager.invokeApi('channels.updateUsername', {
      channel: this.getChannelInput(id),
      username
    });

    return this.refreshChatAfterRequest(id, promise, doNotRefresh);
  }

  public editAdmin(
    id: ChatId,
    participant: PeerId | ChannelParticipant | ChatParticipant,
    rights: ChatAdminRights,
    rank: string = ''
  ) {
    const wasChannel = this.isChannel(id);
    const peerId = getParticipantPeerId(participant);
    const userId = peerId.toUserId();
    return this.migrateChat(id).then((id) => {
      return this.apiManager.invokeApi('channels.editAdmin', {
        channel: this.getChannelInput(id),
        user_id: this.appUsersManager.getUserInput(userId),
        admin_rights: rights,
        rank
      }).then((updates) => {
        const timestamp = tsNow(true);
        const update = this.generateUpdateChannelParticipant({
          chatId: id,
          newParticipant: Object.keys(rights.pFlags).length ? {
            _: 'channelParticipantAdmin',
            date: timestamp,
            admin_rights: rights,
            promoted_by: this.appUsersManager.getSelf().id,
            user_id: userId,
            rank,
            pFlags: {}
          } : {
            _: 'channelParticipant',
            date: timestamp,
            user_id: userId
          },
          prevParticipant: participant,
          wasChannel
        });
        this.apiUpdatesManager.processLocalUpdate(update);

        this.onChatUpdatedForce(id, updates);
      });
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

    return promise.then(this.onChatUpdated.bind(this, id));
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

    return promise.then(this.onChatUpdated.bind(this, id));
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

  private generateUpdateChannelParticipant({
    chatId: id,
    prevParticipant: prevParticipant,
    newParticipant,
    wasChannel
  }: {
    chatId: ChatId,
    prevParticipant?: PeerId | ChannelParticipant | ChatParticipant,
    newParticipant: ChannelParticipant,
    wasChannel?: boolean
  }): Update.updateChannelParticipant {
    const timestamp = tsNow(true);
    const peerId = getParticipantPeerId(prevParticipant || newParticipant);
    return {
      _: 'updateChannelParticipant',
      channel_id: id,
      date: timestamp,
      actor_id: undefined,
      qts: undefined,
      user_id: peerId,
      prev_participant: wasChannel ? prevParticipant as ChannelParticipant : undefined,
      new_participant: newParticipant,
      pFlags: {}
    };
  }

  public async editBanned(
    id: ChatId,
    participant: PeerId | ChannelParticipant | ChatParticipant,
    bannedRights: ChatBannedRights
  ) {
    const peerId = getParticipantPeerId(participant);
    const wasChannel = this.isChannel(id);
    if(!wasChannel) {
      const channelId = await this.migrateChat(id);
      id = channelId;
    }

    return this.apiManager.invokeApi('channels.editBanned', {
      channel: this.getChannelInput(id),
      participant: this.appPeersManager.getInputPeerById(peerId),
      banned_rights: bannedRights
    }).then((updates) => {
      const timestamp = tsNow(true);
      const update = this.generateUpdateChannelParticipant({
        chatId: id,
        wasChannel,
        prevParticipant: participant,
        newParticipant: Object.keys(bannedRights.pFlags).length ? {
          _: 'channelParticipantBanned',
          date: timestamp,
          banned_rights: bannedRights,
          kicked_by: this.appUsersManager.getSelf().id,
          peer: this.appPeersManager.getOutputPeer(peerId),
          pFlags: bannedRights.pFlags.view_messages ? {left: true} : {}
        } : undefined
      });

      this.apiUpdatesManager.processLocalUpdate(update);

      this.onChatUpdated(id, updates);
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

  public kickFromChat(id: ChatId, participant: PeerId | ChannelParticipant | ChatParticipant) {
    if(this.isChannel(id)) return this.kickFromChannel(id, participant as ChannelParticipant);
    else return this.deleteChatUser(id, isObject(participant) ? getParticipantPeerId(participant) : (participant as PeerId).toUserId());
  }

  public resolveChannel(id: ChatId | InputChannel) {
    return this.apiManager.invokeApiSingle('channels.getChannels', {
      id: [isObject(id) ? id : {
        _: 'inputChannel',
        channel_id: id,
        access_hash: '0'
      }]
    }).then((messagesChats) => {
      this.saveApiChats(messagesChats.chats);
    });
  }

  public setChatAvailableReactions(id: ChatId, reactions: ChatReactions) {
    this.appProfileManager.modifyCachedFullChat(id, (chatFull) => {
      chatFull.available_reactions = reactions;
    });

    return this.apiManager.invokeApi('messages.setChatAvailableReactions', {
      peer: this.getInputPeer(id),
      available_reactions: reactions
    }).then(this.onChatUpdated.bind(this, id));
  }

  public getSendAs(channelId: ChatId, forPaidReactions: boolean = false) {
    const onResult = (sendAsPeers: ChannelsSendAsPeers) => {
      this.appUsersManager.saveApiUsers(sendAsPeers.users);
      this.saveApiChats(sendAsPeers.chats);

      return sendAsPeers.peers;
    };

    const inputPeer = this.getChannelInputPeer(channelId);
    const result = this.apiManager.invokeApiCacheable('channels.getSendAs', {
      for_paid_reactions: forPaidReactions,
      peer: inputPeer
    }, {cacheSeconds: 60, syncIfHasResult: true});
    return callbackify(result, onResult);
  }

  public checkUsername(chatId: ChatId, username: string) {
    return this.apiManager.invokeApi('channels.checkUsername', {
      channel: this.getChannelInput(chatId),
      username
    });
  }

  public deactivateAllUsernames(chatId: ChatId, doNotRefresh?: boolean) {
    const promise = this.apiManager.invokeApi('channels.deactivateAllUsernames', {
      channel: this.getChannelInput(chatId)
    });

    return this.refreshChatAfterRequest(chatId, promise, doNotRefresh);
  }

  public makeChannelPrivate(chatId: ChatId) {
    const promises: Promise<boolean>[] = [
      this.updateUsername(chatId, '', true),
      this.deactivateAllUsernames(chatId, true)
    ];

    const promise = Promise.all(promises).then(() => true);
    return this.refreshChatAfterRequest(chatId, promise);
  }

  public refreshChatAfterRequest<T extends Promise<any>>(chatId: ChatId, promise: T, doNotRefresh?: boolean): T {
    if(doNotRefresh) {
      return promise;
    }

    return promise.then((value) => {
      return this.getChannels([chatId]).then(() => value);
    }) as T;
  }

  public getChannels(chatIds: ChatId[]) {
    return this.apiManager.invokeApi('channels.getChannels', {
      id: chatIds.map((chatId) => this.getChannelInput(chatId))
    }).then((messagesChats) => {
      this.saveApiChats(messagesChats.chats);
    });
  }

  public toggleSomething(
    chatId: ChatId,
    what: 'toggleJoinToSend' | 'toggleJoinRequest' | 'toggleForum' | 'togglePreHistoryHidden' | 'toggleAntiSpam' | 'toggleViewForumAsMessages' | 'toggleParticipantsHidden',
    enabled: boolean,
    forceInvalidation?: boolean
  ) {
    return this.migrateChat(chatId).then((channelId) => {
      return this.apiManager.invokeApi(`channels.${what}`, {
        channel: this.getChannelInput(channelId),
        enabled
      }).then((forceInvalidation ? this.onChatUpdatedForce : this.onChatUpdated).bind(this, channelId));
    });
  }

  public toggleParticipantsHidden(id: ChatId, enabled: boolean) {
    return this.toggleSomething(id, 'toggleParticipantsHidden', enabled, true);
  }

  public togglePreHistoryHidden(id: ChatId, enabled: boolean) {
    return this.toggleSomething(id, 'togglePreHistoryHidden', enabled);
  }

  public toggleSignatures(id: ChatId, enabled: boolean, profiles: boolean) {
    return this.apiManager.invokeApi('channels.toggleSignatures', {
      channel: this.getChannelInput(id),
      signatures_enabled: enabled,
      profiles_enabled: profiles
    }).then(this.onChatUpdated.bind(this, id));
  }

  public toggleNoForwards(id: ChatId, enabled: boolean) {
    return this.apiManager.invokeApi('messages.toggleNoForwards', {
      peer: this.getInputPeer(id),
      enabled
    }).then(this.onChatUpdated.bind(this, id));
  }

  public toggleJoinToSend(chatId: ChatId, enabled: boolean) {
    return this.toggleSomething(chatId, 'toggleJoinToSend', enabled);
  }

  public toggleJoinRequest(chatId: ChatId, enabled: boolean) {
    return this.toggleSomething(chatId, 'toggleJoinRequest', enabled);
  }

  public toggleForum(chatId: ChatId, enabled: boolean) {
    return this.toggleSomething(chatId, 'toggleForum', enabled);
  }

  public toggleAntiSpam(id: ChatId, enabled: boolean) {
    return this.toggleSomething(id, 'toggleAntiSpam', enabled);
  }

  public toggleViewForumAsMessages(chatId: ChatId, enabled: boolean) {
    this.apiUpdatesManager.processLocalUpdate({
      _: 'updateChannelViewForumAsMessages',
      channel_id: chatId,
      enabled
    });

    return this.toggleSomething(chatId, 'toggleViewForumAsMessages', enabled);
  }

  public editForumTopic(options: {
    chatId: ChatId,
    topicId: number,
    title?: string,
    iconEmojiId?: DocId,
    closed?: boolean,
    hidden?: boolean
  }) {
    const {chatId, topicId, title, iconEmojiId, closed, hidden} = options;
    return this.apiManager.invokeApi('channels.editForumTopic', {
      channel: this.getChannelInput(chatId),
      topic_id: getServerMessageId(topicId),
      title,
      icon_emoji_id: iconEmojiId,
      closed,
      hidden
    }).then(this.onChatUpdated.bind(this, chatId));
  }

  public async createForumTopic(options: {
    chatId: ChatId,
    title: string,
    iconColor: number,
    iconEmojiId: DocId
  }) {
    const {chatId, title, iconColor, iconEmojiId} = options;

    const channelFull = await this.appProfileManager.getChannelFull(chatId);
    const sendAsInputPeer = channelFull.default_send_as && this.appPeersManager.getInputPeerById(this.appPeersManager.getPeerId(channelFull.default_send_as));

    return this.apiManager.invokeApi('channels.createForumTopic', {
      channel: this.getChannelInput(chatId),
      title,
      icon_color: iconColor,
      icon_emoji_id: iconEmojiId,
      random_id: randomLong(),
      send_as: sendAsInputPeer
    }).then((updates) => {
      this.onChatUpdated(chatId, updates);

      const update = (updates as Updates.updates).updates.find((update) => update._ === 'updateNewChannelMessage') as Update.updateNewChannelMessage;
      return this.appMessagesIdsManager.generateMessageId(update.message.id, chatId);
    });
  }

  public updatePinnedForumTopic(chatId: ChatId, topicId: number, pinned: boolean) {
    return this.apiManager.invokeApi('channels.updatePinnedForumTopic', {
      channel: this.getChannelInput(chatId),
      topic_id: getServerMessageId(topicId),
      pinned
    }).then(this.onChatUpdated.bind(this, chatId));
  }

  public getGroupsForDiscussion() {
    return this.apiManager.invokeApi('channels.getGroupsForDiscussion').then((messagesChats) => {
      this.saveApiChats(messagesChats.chats);
      return messagesChats.chats;
    });
  }

  public async setDiscussionGroup(id: ChatId, groupId: ChatId) {
    if(this.getChat(groupId) && !this.isChannel(groupId)) {
      groupId = await this.migrateChat(groupId);
    }

    if(groupId) {
      const channelFull = await this.appProfileManager.getChannelFull(groupId);
      if(channelFull.pFlags.hidden_prehistory) {
        await this.togglePreHistoryHidden(groupId, false);
      }
    }

    return this.apiManager.invokeApi('channels.setDiscussionGroup', {
      broadcast: this.getChannelInput(id),
      group: this.getChannelInput(groupId)
    }).then(() => {
      const channelFull = this.appProfileManager.getCachedFullChat(id) as ChatFull.channelFull;
      const newOrWasGroupId = groupId || channelFull.linked_chat_id;
      const groupChannelFull = this.appProfileManager.getCachedFullChat(newOrWasGroupId) as ChatFull.channelFull;
      if(channelFull) {
        channelFull.linked_chat_id = groupId;
      }

      if(groupChannelFull) {
        groupChannelFull.linked_chat_id = id;
      }

      if(channelFull) this.rootScope.dispatchEvent('chat_full_update', id);
      if(groupChannelFull) this.rootScope.dispatchEvent('chat_full_update', newOrWasGroupId);
    });
  }

  public async toggleSlowMode(id: ChatId, seconds: number) {
    id = await this.migrateChat(id);
    return this.apiManager.invokeApi('channels.toggleSlowMode', {
      channel: this.getChannelInput(id),
      seconds
    }).then(this.onChatUpdated.bind(this, id));
  }

  public hideChatJoinRequest(chatId: ChatId, userId: UserId, approved: boolean) {
    return this.apiManager.invokeApi('messages.hideChatJoinRequest', {
      peer: this.appChatsManager.getInputPeer(chatId),
      user_id: this.appUsersManager.getUserInput(userId),
      approved
    }).then((updates) => {
      return this.onChatUpdated(chatId, updates, true);
    });
  }

  public getGenericChannelRecommendations() {
    return this.apiManager.invokeApiSingleProcess({
      method: 'channels.getChannelRecommendations',
      params: {},
      processResult: (messagesChats) => {
        this.saveApiChats(messagesChats.chats);
        return messagesChats;
      }
    });
  }

  public getChannelRecommendations(chatId: ChatId) {
    const result = this.recommendations[chatId];
    if(result) {
      return result;
    }

    const promise = this.recommendations[chatId] = this.apiManager.invokeApiSingleProcess({
      method: 'channels.getChannelRecommendations',
      params: {
        channel: this.getChannelInput(chatId)
      },
      processResult: (messagesChats) => {
        this.saveApiChats(messagesChats.chats);

        if(this.recommendations[chatId] === promise) {
          this.recommendations[chatId] = messagesChats;
        }

        return messagesChats;
      }
    });

    return promise;
  }

  private onUpdateChannelParticipant = (update: Update.updateChannelParticipant) => {
    this.appProfileManager.invalidateChannelParticipants(update.channel_id);
    this.rootScope.dispatchEvent('chat_participant', update);
  };

  private onUpdateChatDefaultBannedRights = (update: Update.updateChatDefaultBannedRights) => {
    const chatId = this.appPeersManager.getPeerId(update.peer).toChatId();
    const chat = this.chats[chatId] as Chat.chat;
    if(chat) {
      chat.default_banned_rights = update.default_banned_rights;
      this.rootScope.dispatchEvent('chat_update', chatId);
    }
  };
}
