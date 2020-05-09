import { $rootScope, isObject, SearchIndexManager, safeReplaceObject, copy, numberWithCommas } from "../utils";
import { RichTextProcessor } from "../richtextprocessor";
import appUsersManager from "./appUsersManager";
import appPeersManager from "./appPeersManager";
import apiManager from '../mtproto/mtprotoworker';
import apiUpdatesManager from "./apiUpdatesManager";

type Channel = {
  _: 'channel',
  flags: number,
  pFlags: Partial<{
    creator: true,
    left: true,
    broadcast: true,
    verified: true,
    megagroup: true,
    restricted: true,
    signatures: true,
    min: true,
    scam: true,
    has_link: true,
    has_geo: true,
    slowmode_enabled: true
  }>,
  id: number,
  access_hash?: string,
  title: string,
  username?: string,
  photo: any,
  date: number,
  version: number,
  restriction_reason?: any,
  admin_rights?: any,
  banned_rights?: any,
  default_banned_rights?: any,
  participants_count: number
};

export class AppChatsManager {
  public chats: {[id: number]: Channel | any} = {};
  public usernames: any = {};
  public channelAccess: any = {};
  public megagroups: any = {};
  public cachedPhotoLocations: any = {};

  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      // console.log('on apiUpdate', update)
      let update = e.detail;
      switch(update._) {
        case 'updateChannel':
          var channelID = update.channel_id;
          $rootScope.$broadcast('channel_settings', {channelID: channelID});
          break;
      }
    });
  }

  public saveApiChats(apiChats: any[]) {
    apiChats.forEach(chat => this.saveApiChat(chat));
  }

  public saveApiChat(apiChat: any) {
    if(!isObject(apiChat)) {
      return;
    }
    
    apiChat.rTitle = apiChat.title || 'chat_title_deleted';
    apiChat.rTitle = RichTextProcessor.wrapRichText(apiChat.title, {noLinks: true, noLinebreaks: true}) || 'chat_title_deleted';

    var result = this.chats[apiChat.id];
    var titleWords = SearchIndexManager.cleanSearchText(apiChat.title || '').split(' ');
    var firstWord = titleWords.shift();
    var lastWord = titleWords.pop();
    apiChat.initials = firstWord.charAt(0) + (lastWord ? lastWord.charAt(0) : firstWord.charAt(1));

    apiChat.num = (Math.abs(apiChat.id >> 1) % 8) + 1;

    if(apiChat.pFlags === undefined) {
      apiChat.pFlags = {};
    }

    if(apiChat.pFlags.min) {
      if(result !== undefined) {
        return;
      }
    }

    if(apiChat._ == 'channel' &&
        apiChat.participants_count === undefined &&
        result !== undefined &&
        result.participants_count) {
      apiChat.participants_count = result.participants_count;
    }

    if(apiChat.username) {
      var searchUsername = SearchIndexManager.cleanUsername(apiChat.username);
      this.usernames[searchUsername] = apiChat.id;
    }

    if(result === undefined) {
      result = this.chats[apiChat.id] = apiChat;
    } else {
      safeReplaceObject(result, apiChat);
      $rootScope.$broadcast('chat_update', apiChat.id);
    }

    if(this.cachedPhotoLocations[apiChat.id] !== undefined) {
      safeReplaceObject(this.cachedPhotoLocations[apiChat.id], apiChat && 
        apiChat.photo ? apiChat.photo : {empty: true});
    }
  }

  public getChat(id: number) {
    if(id < 0) id = -id;
    return this.chats[id] || {id: id, deleted: true, access_hash: this.channelAccess[id]};
  }

  public hasRights(id: number, action: any) {
    if(!(id in this.chats)) {
      return false;
    }
    var chat = this.getChat(id);
    if(chat._ == 'chatForbidden' ||
        chat._ == 'channelForbidden' ||
        chat.pFlags.kicked ||
        chat.pFlags.left) {
      return false;
    }
    if(chat.pFlags.creator) {
      return true;
    }

    switch(action) {
      case 'send':
        if(chat._ == 'channel' &&
            !chat.pFlags.megagroup &&
            !chat.pFlags.editor) {
          return false;
        }
        break;

      case 'edit_title':
      case 'edit_photo':
      case 'invite':
        if(chat._ == 'channel') {
          if(chat.pFlags.megagroup) {
            if(!chat.pFlags.editor &&
                !(action == 'invite' && chat.pFlags.democracy)) {
              return false;
            }
          } else {
            return false;
          }
        } else {
          if(chat.pFlags.admins_enabled &&
              !chat.pFlags.admin) {
            return false;
          }
        }
        break;
    }
    return true;
  }

  public resolveUsername(username: string) {
    return this.usernames[username] || 0;
  }

  public saveChannelAccess(id: number, accessHash: string) {
    this.channelAccess[id] = accessHash;
  }

  public saveIsMegagroup(id: number) {
    this.megagroups[id] = true;
  }

  public isChannel(id: number) {
    var chat = this.chats[id];
    if(chat && (chat._ == 'channel' || chat._ == 'channelForbidden') || this.channelAccess[id]) {
      return true;
    }
    return false;
  }

  public isMegagroup(id: number) {
    if(this.megagroups[id]) {
      return true;
    }

    var chat = this.chats[id];
    if(chat && chat._ == 'channel' && chat.pFlags.megagroup) {
      return true;
    }
    return false;
  }

  public isBroadcast(id: number) {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public getChannelInput(id: number) {
    if(!id) {
      return {_: 'inputChannelEmpty'};
    }

    return {
      _: 'inputChannel',
      channel_id: id,
      access_hash: this.getChat(id).access_hash || this.channelAccess[id] || 0
    };
  }

  public getChatInputPeer(id: number) {
    return {
      _: 'inputPeerChat',
      chat_id: id
    };
  }

  public getChannelInputPeer(id: number) {
    if(!id) {
      return {_: 'inputPeerEmpty'};
    }

    return {
      _: 'inputPeerChannel',
      channel_id: id,
      access_hash: this.getChat(id).access_hash || this.channelAccess[id] || 0
    };
  }

  public hasChat(id: number, allowMin?: any) {
    var chat = this.chats[id]
    return isObject(chat) && (allowMin || !chat.pFlags.min);
  }

  public getChatPhoto(id: number) {
    var chat = this.getChat(id);

    if(this.cachedPhotoLocations[id] === undefined) {
      this.cachedPhotoLocations[id] = chat && chat.photo ? chat.photo : {empty: true};
    }

    return this.cachedPhotoLocations[id];
  }

  public getChatString(id: number) {
    var chat = this.getChat(id);
    if(this.isChannel(id)) {
      return (this.isMegagroup(id) ? 's' : 'c') + id + '_' + chat.access_hash;
    }
    return 'g' + id;
  }

  public getChatMembersString(id: number) {
    let chat = this.getChat(id);

    let isChannel = this.isChannel(id) && !this.isMegagroup(id);
    let participants_count = chat.participants_count || chat.participants.participants.length;
    return numberWithCommas(participants_count) + ' ' + (isChannel ? 'subscribers' : 'members');
  }

  public wrapForFull(id: number, fullChat: any) {
    var chatFull = copy(fullChat);
    var chat = this.getChat(id);

    if(!chatFull.participants_count) {
      chatFull.participants_count = chat.participants_count;
    }

    if(chatFull.participants &&
        chatFull.participants._ == 'chatParticipants') {
      chatFull.participants.participants = this.wrapParticipants(id, chatFull.participants.participants);
    }

    if(chatFull.about) {
      chatFull.rAbout = RichTextProcessor.wrapRichText(chatFull.about, {noLinebreaks: true});
    }

    chatFull.peerString = this.getChatString(id);
    chatFull.chat = chat;

    return chatFull;
  }

  public wrapParticipants(id: number, participants: any[]) {
    var chat = this.getChat(id);
    var myID = appUsersManager.getSelf().id;
    if(this.isChannel(id)) {
      var isAdmin = chat.pFlags.creator || chat.pFlags.editor || chat.pFlags.moderator;
      participants.forEach((participant) => {
        participant.canLeave = myID == participant.user_id;
        participant.canKick = isAdmin && participant._ == 'channelParticipant';

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    } else {
      var isAdmin = chat.pFlags.creator || chat.pFlags.admins_enabled && chat.pFlags.admin;
      participants.forEach((participant) => {
        participant.canLeave = myID == participant.user_id;
        participant.canKick = !participant.canLeave && (
          chat.pFlags.creator ||
          participant._ == 'chatParticipant' && (isAdmin || myID == participant.inviter_id)
        );

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    }

    return participants;
  }

  public createChannel(title: string, about: String): Promise<number> {
    return apiManager.invokeApi('channels.createChannel', {
      flags: 1,
      broadcast: true,
      title: title,
      about: about
    }).then((updates: any) => {
      apiUpdatesManager.processUpdateMessage(updates);

      return updates.chats[0].id;
    });
  }

  public inviteToChannel(id: number, userIDs: number[]) {
    let input = this.getChannelInput(id);
    let usersInputs = userIDs.map(u => appUsersManager.getUserInput(u));

    return apiManager.invokeApi('channels.inviteToChannel', {
      channel: input,
      users: usersInputs
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public createChat(title: string, userIDs: number[]): Promise<number> {
    return apiManager.invokeApi('messages.createChat', {
      users: userIDs.map(u => appUsersManager.getUserInput(u)),
      title: title
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);

      return updates.chats[0].id;
    });
  }

  public editPhoto(id: number, inputFile: any) {
    let isChannel = this.isChannel(id);

    let inputChatPhoto = {
      _: 'inputChatUploadedPhoto', 
      file: inputFile
    };

    if(isChannel) {
      return apiManager.invokeApi('channels.editPhoto', {
        channel: this.getChannelInputPeer(id),
        photo: inputChatPhoto
      }).then(updates => {
        apiUpdatesManager.processUpdateMessage(updates);
      });
    } else {
      return apiManager.invokeApi('messages.editChatPhoto', {
        chat_id: id,
        photo: inputChatPhoto
      }).then(updates => {
        apiUpdatesManager.processUpdateMessage(updates);
      });
    }
  }
}

export default new AppChatsManager();
