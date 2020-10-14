import { ChatAdminRights, ChatBannedRights, ChatFull, ChatParticipants, InputChannel, InputChatPhoto, InputPeer, Updates } from "../../layer";
import apiManager from '../mtproto/mtprotoworker';
import { RichTextProcessor } from "../richtextprocessor";
import $rootScope from "../rootScope";
import searchIndexManager from "../searchIndexManager";
import { copy, getAbbreviation, isObject, numberWithCommas, safeReplaceObject } from "../utils";
import apiUpdatesManager from "./apiUpdatesManager";
import appProfileManager from "./appProfileManager";
import appUsersManager from "./appUsersManager";

export type Channel = {
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

export type Chat = {
  _: 'chat',
  flags: number,
  pFlags: Partial<{
    creator: true,
    kicked: true,
    left: true,
    deactivated: true
  }>,
  id: number,
  title: string,
  photo: any,
  participants_count: number,
  date: number,
  version: number,
  migrated_to?: any,
  admin_rights?: any,
  default_banned_rights?: any
};

export type ChatRights = 'send' | 'edit_title' | 'edit_photo' | 'invite' | 'pin' | 'deleteRevoke' | 'delete';

export class AppChatsManager {
  public chats: {[id: number]: Channel | Chat | any} = {};
  public usernames: any = {};
  public channelAccess: any = {};
  public megagroups: any = {};
  public cachedPhotoLocations: any = {};

  public megagroupOnlines: {[id: number]: {timestamp: number, onlines: number}} = {};

  constructor() {
    $rootScope.$on('apiUpdate', (e) => {
      // console.log('on apiUpdate', update)
      const update = e.detail;
      switch(update._) {
        case 'updateChannel':
          const channelID = update.channel_id;
          //console.log('updateChannel:', update);
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

    let oldChat = this.chats[apiChat.id];

    apiChat.initials = getAbbreviation(apiChat.title);

    if(apiChat.pFlags === undefined) {
      apiChat.pFlags = {};
    }

    if(apiChat.pFlags.min) {
      if(oldChat !== undefined) {
        return;
      }
    }

    if(apiChat._ == 'channel' &&
        apiChat.participants_count === undefined &&
        oldChat !== undefined &&
        oldChat.participants_count) {
      apiChat.participants_count = oldChat.participants_count;
    }

    if(apiChat.username) {
      let searchUsername = searchIndexManager.cleanUsername(apiChat.username);
      this.usernames[searchUsername] = apiChat.id;
    }

    let changedPhoto = false;
    if(oldChat === undefined) {
      oldChat = this.chats[apiChat.id] = apiChat;
    } else {
      let oldPhoto = oldChat.photo && oldChat.photo.photo_small;
      let newPhoto = apiChat.photo && apiChat.photo.photo_small;
      if(JSON.stringify(oldPhoto) !== JSON.stringify(newPhoto)) {
        changedPhoto = true;
      }

      safeReplaceObject(oldChat, apiChat);
      $rootScope.$broadcast('chat_update', apiChat.id);
    }

    if(this.cachedPhotoLocations[apiChat.id] !== undefined) {
      safeReplaceObject(this.cachedPhotoLocations[apiChat.id], apiChat && 
        apiChat.photo ? apiChat.photo : {empty: true});
    }

    if(changedPhoto) {
      $rootScope.$broadcast('avatar_update', -apiChat.id);
    }
  }

  public getChat(id: number) {
    if(id < 0) id = -id;
    return this.chats[id] || {_: 'chatEmpty', id: id, deleted: true, access_hash: this.channelAccess[id]};
  }

  public hasRights(id: number, action: ChatRights, flag?: keyof ChatBannedRights['pFlags']) {
    const chat = this.getChat(id);
    if(chat._ == 'chatEmpty') return false;

    if(chat._ == 'chatForbidden' ||
        chat._ == 'channelForbidden' ||
        chat.pFlags.kicked ||
        chat.pFlags.left) {
      return false;
    }

    if(chat.pFlags.creator) {
      return true;
    }

    const rights = chat.admin_rights || chat.banned_rights || chat.default_banned_rights;
    let myFlags: {[flag in keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags']]: true};
    if(rights) myFlags = rights.pFlags;

    switch(action) {
      // good
      case 'send': {
        if(flag && myFlags && myFlags[flag]) {
          return false;
        }

        if(chat._ == 'channel') {
          if((!chat.pFlags.megagroup && !myFlags?.post_messages)) {
            return false;
          }
        }

        break;
      }

      // good
      case 'deleteRevoke': {
        if(chat._ == 'channel') {
          return !!myFlags?.delete_messages;
        } else if(!chat.pFlags.admin) {
          return false;
        }

        break;
      }

      // good
      case 'pin': {
        if(chat._ == 'channel') {
          return chat.admin_rights ? !!myFlags.pin_messages || !!myFlags.post_messages : myFlags && !myFlags.pin_messages;
        } else {
          if(myFlags?.pin_messages && !chat.pFlags.admin) {
            return false;
          }
        }

        break;
      }

      case 'edit_title':
      case 'edit_photo':
      case 'invite': {
        if(chat._ == 'channel') {
          if(chat.pFlags.megagroup) {
            if(!(action == 'invite' && chat.pFlags.democracy)) {
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
    if(id < 0) id = -id;
    let chat = this.chats[id];
    if(chat && (chat._ == 'channel' || chat._ == 'channelForbidden') || this.channelAccess[id]) {
      return true;
    }
    return false;
  }

  public isMegagroup(id: number) {
    if(this.megagroups[id]) {
      return true;
    }

    let chat = this.chats[id];
    if(chat && chat._ == 'channel' && chat.pFlags.megagroup) {
      return true;
    }
    return false;
  }

  public isBroadcast(id: number) {
    return this.isChannel(id) && !this.isMegagroup(id);
  }

  public getChannelInput(id: number): InputChannel {
    if(id < 0) id = -id;
    return {
      _: 'inputChannel',
      channel_id: id,
      access_hash: this.getChat(id).access_hash || this.channelAccess[id] || 0
    };
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
      access_hash: this.getChat(id).access_hash || this.channelAccess[id] || 0
    };
  }

  public hasChat(id: number, allowMin?: any) {
    let chat = this.chats[id]
    return isObject(chat) && (allowMin || !chat.pFlags.min);
  }

  public getChatPhoto(id: number) {
    let chat = this.getChat(id);

    if(this.cachedPhotoLocations[id] === undefined) {
      this.cachedPhotoLocations[id] = chat && chat.photo ? chat.photo : {empty: true};
    }

    return this.cachedPhotoLocations[id];
  }

  public getChatString(id: number) {
    let chat = this.getChat(id);
    if(this.isChannel(id)) {
      return (this.isMegagroup(id) ? 's' : 'c') + id + '_' + chat.access_hash;
    }
    return 'g' + id;
  }

  public getChatMembersString(id: number) {
    const chat = this.getChat(id);

    const isChannel = this.isBroadcast(id);
    const participants_count = chat.participants_count || chat.participants?.participants.length || 0;
    return numberWithCommas(participants_count) + ' ' + (isChannel ? 'followers' : 'members');
  }

  public wrapForFull(id: number, fullChat: any) {
    let chatFull = copy(fullChat);
    let chat = this.getChat(id);

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
    let chat = this.getChat(id);
    let myID = appUsersManager.getSelf().id;
    if(this.isChannel(id)) {
      let isAdmin = chat.pFlags.creator;
      participants.forEach((participant) => {
        participant.canLeave = myID == participant.user_id;
        participant.canKick = isAdmin && participant._ == 'channelParticipant';

        // just for order by last seen
        participant.user = appUsersManager.getUser(participant.user_id);
      });
    } else {
      let isAdmin = chat.pFlags.creator || chat.pFlags.admins_enabled && chat.pFlags.admin;
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

  public createChannel(title: string, about: string): Promise<number> {
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

      return (updates as any as Updates.updates).chats[0].id;
    });
  }

  public editPhoto(id: number, inputFile: any) {
    const isChannel = this.isChannel(id);

    const inputChatPhoto: InputChatPhoto.inputChatUploadedPhoto = {
      _: 'inputChatUploadedPhoto', 
      file: inputFile
    };

    if(isChannel) {
      return apiManager.invokeApi('channels.editPhoto', {
        channel: this.getChannelInput(id),
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

  public async getOnlines(id: number): Promise<number> {
    if(this.isMegagroup(id)) {
      const timestamp = Date.now() / 1000 | 0;
      const cached = this.megagroupOnlines[id] ?? (this.megagroupOnlines[id] = {timestamp: 0, onlines: 1});
      if((timestamp - cached.timestamp) < 60) {
        return cached.onlines;
      }

      const res = await apiManager.invokeApi('messages.getOnlines', {
        peer: this.getChannelInputPeer(id)
      });

      const onlines = res.onlines ?? 1;
      cached.timestamp = timestamp;
      cached.onlines = onlines;

      return onlines;
    } else if(this.isBroadcast(id)) {
      return 1;
    }

    const chatInfo = await appProfileManager.getChatFull(id);
    const _participants = (chatInfo as ChatFull.chatFull).participants as ChatParticipants.chatParticipants;
    if(_participants && _participants.participants) {
      const participants = _participants.participants;

      return participants.reduce((acc: number, participant) => {
        const user = appUsersManager.getUser(participant.user_id);
        if(user && user.status && user.status._ == 'userStatusOnline') {
          return acc + 1;
        }

        return acc;
      }, 0);
    } else {
      return 1;
    }
  }

  onChatUpdated = (chatID: number, updates: any) => {
    apiUpdatesManager.processUpdateMessage(updates);
    if(updates &&
        updates.updates &&
        updates.updates.length &&
        this.isChannel(chatID)) {
      appProfileManager.invalidateChannelParticipants(chatID);
    }
  }

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
}

export default new AppChatsManager();
