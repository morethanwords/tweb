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
import { replaceContent } from "../../helpers/dom";
import renderImageFromUrl from "../../helpers/dom/renderImageFromUrl";
import sequentialDom from "../../helpers/sequentialDom";
import { ChannelParticipantsFilter, ChannelsChannelParticipants, Chat, ChatFull, ChatParticipants, ChatPhoto, ExportedChatInvite, InputChannel, InputFile, InputFileLocation, PhotoSize, UserFull, UserProfilePhoto } from "../../layer";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appDownloadManager from "./appDownloadManager";
import appNotificationsManager from "./appNotificationsManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import appUsersManager, { User } from "./appUsersManager";

type PeerPhotoSize = 'photo_small' | 'photo_big';

export class AppProfileManager {
  private botInfos: any = {};
  private usersFull: {[id: string]: UserFull.userFull} = {};
  public chatsFull: {[id: string]: ChatFull} = {};
  private fullPromises: {[peerId: string]: Promise<ChatFull.chatFull | ChatFull.channelFull | UserFull>} = {};

  private savedAvatarURLs: {
    [peerId: number]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};

  constructor() {
    rootScope.addMultipleEventsListeners({
      updateChatParticipants: (update) => {
        const participants = update.participants;
        if(participants._ === 'chatParticipants') {
          const chatId = participants.chat_id;
          const chatFull = this.chatsFull[chatId] as ChatFull.chatFull;
          if(chatFull !== undefined) {
            chatFull.participants = participants;
            rootScope.broadcast('chat_full_update', chatId);
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
          rootScope.broadcast('chat_full_update', update.chat_id);
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
              rootScope.broadcast('chat_full_update', update.chat_id);
              return;
            }
          }
        }
      }
    });

    rootScope.on('chat_update', (chatId) => {
      const fullChat = this.chatsFull[chatId];
      const chat: Chat.chat = appChatsManager.getChat(chatId);
      if(!chat.photo || !fullChat) {
        return;
      }

      const emptyPhoto = chat.photo._ === 'chatPhotoEmpty';
      //////console.log('chat_update:', fullChat);
      if(fullChat.chat_photo && emptyPhoto !== (fullChat.chat_photo._ === 'photoEmpty')) {
        delete this.chatsFull[chatId];
        rootScope.broadcast('chat_full_update', chatId);
        return;
      }
      if(emptyPhoto) {
        return;
      }

      const photoId = (chat.photo as ChatPhoto.chatPhoto).photo_id;
      const chatFullPhotoId = fullChat.chat_photo?.id;
      if(chatFullPhotoId !== photoId) {
        delete this.chatsFull[chatId];
        rootScope.broadcast('chat_full_update', chatId);
      }
    });
  }

  public saveBotInfo(botInfo: any) {
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
  }

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

      if(userFull.bot_info) {
        userFull.bot_info = this.saveBotInfo(userFull.bot_info) as any;
      }

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
      rootScope.broadcast('chat_full_update', id);

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
      rootScope.broadcast('chat_full_update', id);

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
            }],
            chats: [channel],
            users: []
          });
          break;
      }

      return Promise.reject(error);
    }) as any;
  }

  public invalidateChannelParticipants(id: number) {
    delete this.chatsFull[id];
    delete this.fullPromises[-id];
    apiManager.clearCache('channels.getParticipants', (params) => (params.channel as InputChannel.inputChannel).channel_id === id);
    rootScope.broadcast('chat_full_update', id);
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

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateUserPhoto',
          user_id: myId,
          date: tsNow(true),
          photo: appUsersManager.getUser(myId).photo,
          previous: true
        }
      });
    });
  }

  public removeFromAvatarsCache(peerId: number) {
    if(this.savedAvatarURLs[peerId]) {
      delete this.savedAvatarURLs[peerId];
    }
  }

  public loadAvatar(peerId: number, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
    const inputPeer = appPeersManager.getInputPeerById(peerId);

    let cached = false;
    let getAvatarPromise: Promise<string>;
    let saved = this.savedAvatarURLs[peerId];
    if(!saved || !saved[size]) {
      if(!saved) {
        saved = this.savedAvatarURLs[peerId] = {};
      }

      //console.warn('will invoke downloadSmallFile:', peerId);
      const peerPhotoFileLocation: InputFileLocation.inputPeerPhotoFileLocation = {
        _: 'inputPeerPhotoFileLocation', 
        pFlags: {},
        peer: inputPeer, 
        photo_id: photo.photo_id
      };

      if(size === 'photo_big') {
        peerPhotoFileLocation.pFlags.big = true;
      }

      const downloadOptions = {dcId: photo.dc_id, location: peerPhotoFileLocation};

      /* let str: string;
      const time = Date.now();
      if(peerId === 0) {
        str = `download avatar ${peerId}`;
      } */

      const promise = appDownloadManager.download(downloadOptions);
      getAvatarPromise = saved[size] = promise.then(blob => {
        return saved[size] = URL.createObjectURL(blob);

        /* if(str) {
          console.log(str, Date.now() / 1000, Date.now() - time);
        } */
      });
    } else if(typeof(saved[size]) !== 'string') {
      getAvatarPromise = saved[size] as Promise<any>;
    } else {
      getAvatarPromise = Promise.resolve(saved[size]);
      cached = true;
    }

    return {cached, loadPromise: getAvatarPromise};
  }

  public putAvatar(div: HTMLElement, peerId: number, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize, img = new Image()) {
    const {cached, loadPromise} = this.loadAvatar(peerId, photo, size);

    let callback: () => void;
    if(cached) {
      // смотри в misc.ts: renderImageFromUrl
      callback = () => {
        replaceContent(div, img);
        div.dataset.color = '';
      };
    } else {
      const animate = rootScope.settings.animationsEnabled;
      if(animate) {
        img.classList.add('fade-in');
      }

      callback = () => {
        replaceContent(div, img);

        setTimeout(() => {
          if(div.childElementCount) {
            div.dataset.color = '';

            if(animate) {
              sequentialDom.mutateElement(img, () => {
                img.classList.remove('fade-in');
              });
            }
          }
        }, animate ? 200 : 0);
      };
    }

    const renderPromise = loadPromise.then((url) => {
      return new Promise<void>((resolve) => {
        renderImageFromUrl(img, url, () => {
          callback();
          resolve();
        }/* , false */);
      });
    });

    return {cached, loadPromise: renderPromise};
  }

  // peerId === peerId || title
  public putPhoto(div: HTMLElement, peerId: number, isDialog = false, title = '') {
    const photo = appPeersManager.getPeerPhoto(peerId);

    const size: PeerPhotoSize = 'photo_small';
    const avatarAvailable = !!photo;
    const avatarRendered = !!div.firstElementChild;
    
    const myId = rootScope.myId;

    //console.log('loadDialogPhoto location:', location, inputPeer);
    if(peerId === myId && isDialog) {
      div.innerText = '';
      div.dataset.color = '';
      div.classList.add('tgico-saved');
      div.classList.remove('tgico-deletedaccount');
      return;
    }

    if(peerId > 0) {
      const user = appUsersManager.getUser(peerId);
      if(user && user.pFlags && user.pFlags.deleted) {
        div.innerText = '';
        div.dataset.color = appPeersManager.getPeerColorById(peerId);
        div.classList.add('tgico-deletedaccount');
        div.classList.remove('tgico-saved');
        return;
      }
    }

    if(!avatarAvailable || !avatarRendered || !this.savedAvatarURLs[peerId]) {
      let color = '';
      if(peerId && (peerId !== myId || !isDialog)) {
        color = appPeersManager.getPeerColorById(peerId);
      }
      
      div.innerText = '';
      div.classList.remove('tgico-saved', 'tgico-deletedaccount');
      div.dataset.color = color;

      let abbr: string;
      if(!title) {
        abbr = appPeersManager.getPeer(peerId).initials ?? '';
      } else {
        abbr = RichTextProcessor.getAbbreviation(title);
      }

      div.innerHTML = abbr;
      //return Promise.resolve(true);
    }

    if(avatarAvailable/*  && false */) {
      return this.putAvatar(div, peerId, photo, size);
    }
  }
}

const appProfileManager = new AppProfileManager();
MOUNT_CLASS_TO.appProfileManager = appProfileManager;
export default appProfileManager;
