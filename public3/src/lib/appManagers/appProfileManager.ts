import { $rootScope, tsNow, copy } from "../utils";
import appMessagesIDsManager from "./appMessagesIDsManager";
import appChatsManager from "./appChatsManager";
import appPhotosManager from "./appPhotosManager";
import appUsersManager from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import appPeersManager from "./appPeersManager";
import apiUpdatesManager from "./apiUpdatesManager";
import AppStorage from '../storage';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import apiFileManager from "../mtproto/apiFileManager";
import { renderImageFromUrl } from "../../components/misc";
import searchIndexManager from "../searchIndexManager";
import appMessagesManager from "./appMessagesManager";

export class AppProfileManager {
  public botInfos: any = {};
  public usersFull: any = {};
  public chatsFull: any = {};
  public chatFullPromises: any = {};
  public chatParticipantsPromises: any = {};

  public savedAvatarURLs: {[peerID: number]: string} = {};

  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      let update = e.detail;
      // console.log('on apiUpdate', update)
      switch(update._) {
        case 'updateChatParticipants':
          var participants = update.participants;
          var chatFull = this.chatsFull[participants.id];
          if(chatFull !== undefined) {
            chatFull.participants = update.participants;
            $rootScope.$broadcast('chat_full_update', update.chat_id);
          }
          break;
  
        case 'updateChatParticipantAdd':
          var chatFull = this.chatsFull[update.chat_id];
          if (chatFull !== undefined) {
            var participants = chatFull.participants.participants || [];
            for(var i = 0, length = participants.length; i < length; i++) {
              if(participants[i].user_id == update.user_id) {
                return;
              }
            }
            participants.push({
              _: 'chatParticipant',
              user_id: update.user_id,
              inviter_id: update.inviter_id,
              date: tsNow(true)
            });
            chatFull.participants.version = update.version;
            $rootScope.$broadcast('chat_full_update', update.chat_id);
          }
          break
  
        case 'updateChatParticipantDelete':
          var chatFull = this.chatsFull[update.chat_id];
          if(chatFull !== undefined) {
            var participants = chatFull.participants.participants || [];
            for(var i = 0, length = participants.length; i < length; i++) {
              if(participants[i].user_id == update.user_id) {
                participants.splice(i, 1);
                chatFull.participants.version = update.version;
                $rootScope.$broadcast('chat_full_update', update.chat_id);
                return;
              }
            }
          }
          break
  
        case 'updateChannelPinnedMessage':
          var channelID = update.channel_id;
          var fullChannel = this.chatsFull[channelID];
          if(fullChannel !== undefined) {
            fullChannel.pinned_msg_id = appMessagesIDsManager.getFullMessageID(update.id, channelID);
            $rootScope.$broadcast('peer_pinned_message', -channelID);
          }
          break;
      }
    });
  
    $rootScope.$on('chat_update', (e: CustomEvent) => {
      let chatID = e.detail;
      let fullChat = this.chatsFull[chatID];
      let chat = appChatsManager.getChat(chatID);
      if(!chat.photo || !fullChat) {
        return;
      }
      let emptyPhoto = chat.photo._ == 'chatPhotoEmpty';
      //////console.log('chat_update:', fullChat);
      if(fullChat.chat_photo && emptyPhoto != (fullChat.chat_photo._ == 'photoEmpty')) {
        delete this.chatsFull[chatID];
        $rootScope.$broadcast('chat_full_update', chatID);
        return;
      }
      if(emptyPhoto) {
        return;
      }

      let smallUserpic = chat.photo.photo_small;
      let smallPhotoSize = appPhotosManager.choosePhotoSize(fullChat.chat_photo, 0, 0);
      if(JSON.stringify(smallUserpic) !== JSON.stringify(smallPhotoSize.location)) {
        delete this.chatsFull[chatID];
        $rootScope.$broadcast('chat_full_update', chatID);
      }
    });
  }

  public saveBotInfo(botInfo: any) {
    let botID = botInfo && botInfo.user_id;
    if(!botID) {
      return false;
    }

    let commands: any = {};
    botInfo.commands.forEach((botCommand: any) => {
      commands[botCommand.command] = botCommand.description;
    });

    return this.botInfos[botID] = {
      id: botID,
      version: botInfo.version,
      shareText: botInfo.share_text,
      description: botInfo.description,
      commands: commands
    };
  }

  public getProfile(id: number, override?: any) {
    if(this.usersFull[id]) {
      return Promise.resolve(this.usersFull[id]);
    }

    return apiManager.invokeApi('users.getFullUser', {
      id: appUsersManager.getUserInput(id)
    }).then((userFull: any) => {
      if(override && override.phone_number) {
        userFull.user.phone = override.phone_number
        if(override.first_name || override.last_name) {
          userFull.user.first_name = override.first_name
          userFull.user.last_name = override.last_name
        }
        appUsersManager.saveApiUser(userFull.user);
      } else {
        appUsersManager.saveApiUser(userFull.user, true);
      }

      if(userFull.profile_photo) {
        userFull.profile_photo = appPhotosManager.savePhoto(userFull.profile_photo, {user_id: id});
        /* appPhotosManager.savePhoto(userFull.profile_photo, {user_id: id}); */
      }

      if(userFull.about !== undefined) {
        userFull.rAbout = RichTextProcessor.wrapRichText(userFull.about, {noLinebreaks: true});
      }

      // NotificationsManager.savePeerSettings(id, userFull.notify_settings); // warning

      if(userFull.bot_info) {
        userFull.bot_info = this.saveBotInfo(userFull.bot_info);
      }

      appMessagesManager.savePinnedMessage(id, userFull.pinned_msg_id);

      return this.usersFull[id] = userFull;
    });
  }

  public getPeerBots(peerID: number) {
    var peerBots: any[] = [];
    if(peerID >= 0 && !appUsersManager.isBot(peerID) ||
      (appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID))) {
      return Promise.resolve(peerBots);
    }
    if(peerID >= 0) {
      return this.getProfile(peerID).then((userFull: any) => {
        var botInfo = userFull.bot_info;
        if(botInfo && botInfo._ != 'botInfoEmpty') {
          peerBots.push(botInfo);
        }
        return peerBots;
      });
    }

    return this.getChatFull(-peerID).then((chatFull: any) => {
      chatFull.bot_info.forEach((botInfo: any) => {
        peerBots.push(this.saveBotInfo(botInfo))
      });
      return peerBots;
    });
  }

  public getChatFull(id: number) {
    if(appChatsManager.isChannel(id)) {
      return this.getChannelFull(id);
    }
    if(this.chatsFull[id] !== undefined) {
      var chat = appChatsManager.getChat(id);
      if(chat.version == this.chatsFull[id].participants.version ||
        chat.pFlags.left) {
        return Promise.resolve(this.chatsFull[id]);
      }
    }
    if(this.chatFullPromises[id] !== undefined) {
      return this.chatFullPromises[id];
    }
    // console.trace(dT(), 'Get chat full', id, appChatsManager.getChat(id))
    return this.chatFullPromises[id] = apiManager.invokeApi('messages.getFullChat', {
      chat_id: id
    }).then((result: any) => {
      appChatsManager.saveApiChats(result.chats);
      appUsersManager.saveApiUsers(result.users);
      const fullChat = result.full_chat;
      if(fullChat && fullChat.chat_photo && fullChat.chat_photo.id) {
        fullChat.chat_photo = appPhotosManager.savePhoto(fullChat.chat_photo);
        //appPhotosManager.savePhoto(fullChat.chat_photo);
      }

      appMessagesManager.savePinnedMessage(-id, fullChat.pinned_msg_id);
      /* NotificationsManager.savePeerSettings(-id, fullChat.notify_settings); */ // warning
      delete this.chatFullPromises[id];
      this.chatsFull[id] = fullChat;
      $rootScope.$broadcast('chat_full_update', id);

      return fullChat;
    });
  }

  public getChatInviteLink(id: number, force?: boolean) {
    return this.getChatFull(id).then((chatFull: any) => {
      if(!force &&
        chatFull.exported_invite &&
        chatFull.exported_invite._ == 'chatInviteExported') {
        return chatFull.exported_invite.link;
      }

      let promise;
      if(appChatsManager.isChannel(id)) {
        promise = apiManager.invokeApi('channels.exportInvite', {
          channel: appChatsManager.getChannelInput(id)
        });
      } else {
        promise = apiManager.invokeApi('messages.exportChatInvite', {
          chat_id: id
        });
      }

      return promise.then((exportedInvite: any) => {
        if(this.chatsFull[id] !== undefined) {
          this.chatsFull[id].exported_invite = exportedInvite;
        }

        return exportedInvite.link;
      });
    });
  }

  public getChannelParticipants(id: number, filter: any, limit: number, offset: number) {
    filter = filter || {_: 'channelParticipantsRecent'};
    limit = limit || 200;
    offset = offset || 0;
    let promiseKey = [id, filter._, offset, limit].join('_');
    let promiseData = this.chatParticipantsPromises[promiseKey];

    if(filter._ == 'channelParticipantsRecent') {
      let chat = appChatsManager.getChat(id);
      if(chat &&
          chat.pFlags && (
            chat.pFlags.kicked ||
            chat.pFlags.broadcast && !chat.pFlags.creator && !chat.admin_rights
          )) {
        return Promise.reject();
      }
    }

    let fetchParticipants = (cachedParticipants?: any[]) => {
      let hash = 0;
      if(cachedParticipants) {
        let userIDs: number[] = [];
        cachedParticipants.forEach((participant: any) => {
          userIDs.push(participant.user_id);
        });

        userIDs.sort((a, b) => a - b);
        userIDs.forEach((userID) => {
          hash = ((hash * 20261) + 0x80000000 + userID) % 0x80000000
        });
      }

      return apiManager.invokeApi('channels.getParticipants', {
        channel: appChatsManager.getChannelInput(id),
        filter: filter,
        offset: offset,
        limit: limit,
        hash: hash
      }).then((result: any) => {
        if(result._ == 'channels.channelParticipantsNotModified') {
          return cachedParticipants;
        }

        appUsersManager.saveApiUsers(result.users);
        return result.participants;
      });
    }

    let maybeAddSelf = (participants: any[]) => {
      let chat = appChatsManager.getChat(id);
      let selfMustBeFirst = filter._ == 'channelParticipantsRecent' &&
                            !offset &&
                            !chat.pFlags.kicked &&
                            !chat.pFlags.left;

      if(selfMustBeFirst) {
        participants = copy(participants);
        let myID = appUsersManager.getSelf().id;
        let myIndex = participants.findIndex(p => p.user_id == myID);
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
    }

    let timeNow = tsNow();
    if(promiseData !== undefined) {
      let promise = promiseData[1];
      if(promiseData[0] > timeNow - 60000) {
        return promise;
      }
      let newPromise = promise.then((cachedParticipants: any) => {
        return fetchParticipants(cachedParticipants).then(maybeAddSelf)
      });
      this.chatParticipantsPromises[promiseKey] = [timeNow, newPromise];
      return newPromise;
    }

    let newPromise = fetchParticipants().then(maybeAddSelf);
    this.chatParticipantsPromises[promiseKey] = [timeNow, newPromise];
    return newPromise;
  }

  public getChannelFull(id: number, force?: boolean) {
    if(this.chatsFull[id] !== undefined && !force) {
      return Promise.resolve(this.chatsFull[id]);
    }
    if(this.chatFullPromises[id] !== undefined) {
      return this.chatFullPromises[id];
    }

    return this.chatFullPromises[id] = apiManager.invokeApi('channels.getFullChannel', {
      channel: appChatsManager.getChannelInput(id)
    }).then((result: any) => {
      appChatsManager.saveApiChats(result.chats);
      appUsersManager.saveApiUsers(result.users);
      let fullChannel = result.full_chat;
      if(fullChannel && fullChannel.chat_photo.id) {
        fullChannel.chat_photo = appPhotosManager.savePhoto(fullChannel.chat_photo);
        //appPhotosManager.savePhoto(fullChannel.chat_photo);
      }
      /* NotificationsManager.savePeerSettings(-id, fullChannel.notify_settings) */ // warning

      if(fullChannel.pinned_msg_id) {
        fullChannel.pinned_msg_id = appMessagesIDsManager.getFullMessageID(fullChannel.pinned_msg_id, id);
      }

      appMessagesManager.savePinnedMessage(-id, fullChannel.pinned_msg_id);

      delete this.chatFullPromises[id];
      this.chatsFull[id] = fullChannel;
      $rootScope.$broadcast('chat_full_update', id);

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
    });
  }

  public invalidateChannelParticipants(id: number) {
    delete this.chatsFull[id];
    delete this.chatFullPromises[id];
    for(let key in this.chatParticipantsPromises) {
      //let val = this.chatParticipantsPromises[key];

      if(+key.split('_')[0] == id) {
        delete this.chatParticipantsPromises[key]
      }
    }

    $rootScope.$broadcast('chat_full_update', id);
  }

  public getChannelPinnedMessage(id: number) {
    return this.getChannelFull(id).then((fullChannel: any) => {
      let pinnedMessageID = fullChannel && fullChannel.pinned_msg_id;
      if(!pinnedMessageID) {
        return false;
      }

      return AppStorage.get<number>('pinned_hidden' + id).then((hiddenMessageID: number) => {
        if(appMessagesIDsManager.getMessageLocalID(pinnedMessageID) == hiddenMessageID) {
          return false;
        }

        return pinnedMessageID;
      });
    });
  }

  public hideChannelPinnedMessage(id: number, pinnedMessageID: number) {
    let setKeys: any = {};
    setKeys['pinned_hidden' + id] = appMessagesIDsManager.getMessageLocalID(pinnedMessageID);
    AppStorage.set(setKeys);
    $rootScope.$broadcast('peer_pinned_message', -id);  
  }

  public updateProfile(first_name: string, last_name: string, about: string) {
    /* let flags = 0;
    if(first_name) flags |= 1;
    if(last_name) flags |= 2;
    if(about) flags |= 4; */
    let flags = (1 << 0) | (1 << 1) | (1 << 2);
    
    return apiManager.invokeApi('account.updateProfile', {
      flags,
      first_name,
      last_name,
      about
    }).then(user => {
      appUsersManager.saveApiUser(user);
    });
  }

  public uploadProfilePhoto(inputFile: any) {
    return apiManager.invokeApi('photos.uploadProfilePhoto', {
      file: inputFile
    }).then((updateResult) => {
      appUsersManager.saveApiUsers(updateResult.users);

      apiManager.getUserID().then((id) => {
        appPhotosManager.savePhoto(updateResult.photo, {
          user_id: id
        });

        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateUserPhoto',
            user_id: id,
            date: tsNow(true),
            photo: appUsersManager.getUser(id).photo,
            previous: true
          }
        });
      });
    });
  }

  public updateUsername(username: string) {
    return apiManager.invokeApi('account.updateUsername', {
      username: username
    }).then((user) => {
      appUsersManager.saveApiUser(user);
    });
  }

  public removeFromAvatarsCache(peerID: number) {
    if(this.savedAvatarURLs[peerID]) {
      delete this.savedAvatarURLs[peerID];
    }
  }

  // peerID == peerID || title
  public async putPhoto(div: HTMLElement, peerID: number, isDialog = false, title = ''): Promise<boolean> {
    let inputPeer: any;
    let location: any;
    if(peerID) {
      inputPeer = appPeersManager.getInputPeerByID(peerID);
      location = appPeersManager.getPeerPhoto(peerID);
    }

    let myID = $rootScope.myID;

    //console.log('loadDialogPhoto location:', location, inputPeer);

    if(peerID == myID && isDialog) {
      if(div.firstChild) {
        div.firstChild.remove();
      }
      
      div.style.backgroundColor = '';
      div.classList.add('tgico-savedmessages');
      div.classList.remove('tgico-avatar_deletedaccount');
      return true;
    }

    if(peerID > 0) {
      let user = appUsersManager.getUser(peerID);
      if(user && user.pFlags && user.pFlags.deleted) {
        if(div.firstChild) {
          div.firstChild.remove();
        }
        
        div.style.backgroundColor = '';
        div.classList.add('tgico-avatar_deletedaccount');
        return true;
      }
    }

    //if(!location || location.empty || !location.photo_small) {
      if(div.firstChild) {
        div.firstChild.remove();
      }

      let color = '';
      if(peerID && peerID != myID) {
        color = appPeersManager.getPeerColorByID(peerID);
      }

      div.classList.remove('tgico-savedmessages', 'tgico-avatar_deletedaccount');
      div.style.backgroundColor = color;

      let abbr: string;
      if(!title) {
        abbr = appPeersManager.getPeer(peerID).initials ?? '';
      } else {
        const name = searchIndexManager.cleanSearchText(title, false);

        const nameWords = name.split(' ');
        const firstWord = nameWords.shift();
        const lastWord = nameWords.pop();
        abbr = firstWord.charAt(0) + (lastWord ? lastWord.charAt(0) : '');
      }

      div.innerText = abbr.toUpperCase();
      //return Promise.resolve(true);
    //}

    if(!location || location.empty || !location.photo_small) {
      return true;
    }

    if(!this.savedAvatarURLs[peerID]) {
      //console.warn('will invoke downloadSmallFile:', peerID);
      let res = await apiFileManager.downloadSmallFile({
        _: 'inputPeerPhotoFileLocation', 
        dc_id: location.dc_id, 
        flags: 0, 
        peer: inputPeer, 
        volume_id: location.photo_small.volume_id, 
        local_id: location.photo_small.local_id
      });

      this.savedAvatarURLs[peerID] = URL.createObjectURL(res);
    }

    let img = new Image();
    let cached = await renderImageFromUrl(img, this.savedAvatarURLs[peerID])
    if(cached) {
      div.innerHTML = '';
      div.append(img);
    } else {
      img.classList.add('fade-in');
      img.addEventListener('load', () => {
        div.innerHTML = '';
        div.append(img);
      });
    }

    return true;
  }
}

export default new AppProfileManager();
