import { $rootScope, isObject, SearchIndexManager, safeReplaceObject, copy } from "../utils";
import { RichTextProcessor } from "../richtextprocessor";
import appUsersManager from "./appUsersManager";

export class AppChatsManager {
  public chats: any = {};
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
    apiChats.forEach(this.saveApiChat.bind(this));
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
    if(chat && (chat._ == 'channel' || chat._ == 'channelForbidden') ||
      this.channelAccess[id]) {
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

  public getChatInput(id: number) {
    return id || 0;
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

  public wrapForFull(id: number, fullChat: any) {
    var chatFull = copy(fullChat);
    var chat = this.getChat(id);

    if (!chatFull.participants_count) {
      chatFull.participants_count = chat.participants_count;
    }

    if(chatFull.participants &&
        chatFull.participants._ == 'chatParticipants') {
      chatFull.participants.participants = this.wrapParticipants(id, chatFull.participants.participants);
    }

    if (chatFull.about) {
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
      var isAdmin = chat.pFlags.creator || chat.pFlags.editor || chat.pFlags.moderator
      participants.forEach((participant) => {
        participant.canLeave = myID == participant.user_id;
        participant.canKick = isAdmin && participant._ == 'channelParticipant';

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    } else {
      var isAdmin = chat.pFlags.creator || chat.pFlags.admins_enabled && chat.pFlags.admin
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

  /* public openChat(chatID: number, accessHash: string) {
    var scope = $rootScope.$new()
    scope.chatID = chatID

    if(this.isChannel(chatID)) {
      var modalInstance = $modal.open({
        templateUrl: templateUrl('channel_modal'),
        controller: 'ChannelModalController',
        scope: scope,
        windowClass: 'chat_modal_window channel_modal_window mobile_modal'
      })
    } else {
      var modalInstance = $modal.open({
        templateUrl: templateUrl('chat_modal'),
        controller: 'ChatModalController',
        scope: scope,
        windowClass: 'chat_modal_window mobile_modal'
      })
    }
  } */
}

export default new AppChatsManager();
