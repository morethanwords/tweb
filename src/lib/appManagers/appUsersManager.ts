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
import filterUnique from "../../helpers/array/filterUnique";
import findAndSplice from "../../helpers/array/findAndSplice";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import { CancellablePromise, deferredPromise } from "../../helpers/cancellablePromise";
import cleanSearchText from "../../helpers/cleanSearchText";
import cleanUsername from "../../helpers/cleanUsername";
import { formatFullSentTimeRaw, tsNow } from "../../helpers/date";
import { formatPhoneNumber } from "../../helpers/formatPhoneNumber";
import isObject from "../../helpers/object/isObject";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import { isRestricted } from "../../helpers/restrictions";
import { Chat, ContactsResolvedPeer, InputContact, InputGeoPoint, InputMedia, InputPeer, InputUser, User as MTUser, UserProfilePhoto, UserStatus } from "../../layer";
import I18n, { i18n, LangPackKey } from "../langPack";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { REPLIES_PEER_ID, SERVICE_PEER_ID } from "../mtproto/mtproto_config";
import serverTimeManager from "../mtproto/serverTimeManager";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import SearchIndex from "../searchIndex";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appPeersManager from "./appPeersManager";
import appStateManager from "./appStateManager";

export type User = MTUser.user;
export type TopPeerType = 'correspondents' | 'bots_inline';
export type MyTopPeer = {id: PeerId, rating: number};

export class AppUsersManager {
  private storage = appStateManager.storages.users;
  
  private users: {[userId: UserId]: User};
  private usernames: {[username: string]: UserId};
  private contactsIndex: SearchIndex<UserId>;
  private contactsFillPromise: CancellablePromise<AppUsersManager['contactsList']>;
  private contactsList: Set<UserId>;
  private updatedContactsList: boolean;
  
  private getTopPeersPromises: {[type in TopPeerType]?: Promise<MyTopPeer[]>};

  constructor() {
    this.clear(true);

    setInterval(this.updateUsersStatuses, 60000);

    rootScope.addEventListener('state_synchronized', this.updateUsersStatuses);

    rootScope.addMultipleEventsListeners({
      updateUserStatus: (update) => {
        const userId = update.user_id;
        const user = this.users[userId];
        if(user) {
          user.status = update.status;
          if(user.status) {
            if('expires' in user.status) {
              user.status.expires -= serverTimeManager.serverTimeOffset;
            }

            if('was_online' in user.status) {
              user.status.was_online -= serverTimeManager.serverTimeOffset;
            }
          }

          //user.sortStatus = this.getUserStatusForSort(user.status);
          rootScope.dispatchEvent('user_update', userId);
          this.setUserToStateIfNeeded(user);
        } //////else console.warn('No user by id:', userId);
      },

      updateUserPhoto: (update) => {
        const userId = update.user_id;
        const user = this.users[userId];
        if(user) {
          if((user.photo as UserProfilePhoto.userProfilePhoto)?.photo_id === (update.photo as UserProfilePhoto.userProfilePhoto)?.photo_id) {
            return;
          }

          this.forceUserOnline(userId, update.date);

          if(update.photo._ === 'userProfilePhotoEmpty') {
            delete user.photo;
          } else {
            user.photo = safeReplaceObject(user.photo, update.photo);
          }

          this.setUserToStateIfNeeded(user);

          rootScope.dispatchEvent('user_update', userId);
          rootScope.dispatchEvent('avatar_update', userId.toPeerId());
        } else console.warn('No user by id:', userId);
      },

      updateUserName: (update) => {
        const userId = update.user_id;
        const user = this.users[userId];
        if(user) {
          this.forceUserOnline(userId);
          
          this.saveApiUser({
            ...user, 
            first_name: update.first_name,
            last_name: update.last_name,
            username: update.username
          }, true);
        }
      }
    });

    /* case 'updateContactLink':
    this.onContactUpdated(update.user_id, update.my_link._ === 'contactLinkContact');
    break; */

    rootScope.addEventListener('language_change', (e) => {
      const userId = this.getSelf().id;
      this.contactsIndex.indexObject(userId, this.getUserSearchText(userId));
    });

    appStateManager.getState().then((state) => {
      const users = appStateManager.storagesResults.users;
      if(users.length) {
        for(let i = 0, length = users.length; i < length; ++i) {
          const user = users[i];
          if(user) {
            this.users[user.id] = user;
            this.setUserNameToCache(user);
          }
        }
      }

      const contactsList = state.contactsList;
      if(contactsList && Array.isArray(contactsList)) {
        contactsList.forEach(userId => {
          this.pushContact(userId);
        });

        if(contactsList.length) {
          this.contactsFillPromise = deferredPromise();
          this.contactsFillPromise.resolve(this.contactsList);
        }
      }

      appStateManager.addEventListener('peerNeeded', (peerId) => {
        if(!appPeersManager.isUser(peerId)) {
          return;
        }
        
        const userId = peerId.toUserId();
        if(!this.storage.getFromCache(userId)) {
          this.storage.set({
            [userId]: this.getUser(userId)
          });
        }
      });

      appStateManager.addEventListener('peerUnneeded', (peerId) => {
        if(!appPeersManager.isUser(peerId)) {
          return;
        }

        const userId = peerId.toUserId();
        if(this.storage.getFromCache(userId)) {
          this.storage.delete(userId);
        }
      });
    });
  }

  public clear(init = false) {
    if(!init) {
      const users = appStateManager.storagesResults.users;
      for(const userId in this.users) {
        // const userId = +userId;
        if(!userId) continue;
        const peerId = userId.toPeerId();
        if(!appStateManager.isPeerNeeded(peerId)) {
          const user = this.users[userId];
          if(user.username) {
            delete this.usernames[cleanUsername(user.username)];
          }

          findAndSplice(users, (user) => user.id === userId);
          this.storage.delete(userId);
          delete this.users[userId];
        }
      }
    } else {
      this.users = {};
      this.usernames = {};
    }
    
    this.getTopPeersPromises = {};
    this.contactsIndex = this.createSearchIndex();
    this.contactsFillPromise = undefined;
    this.contactsList = new Set();
    this.updatedContactsList = false;
  }

  private onContactsModified() {
    const contactsList = [...this.contactsList];
    appStateManager.pushToState('contactsList', contactsList);
  }

  public fillContacts() {
    if(this.contactsFillPromise && this.updatedContactsList) {
      return {
        cached: this.contactsFillPromise.isFulfilled,
        promise: this.contactsFillPromise
      };
    }

    this.updatedContactsList = true;

    const promise = deferredPromise<Set<UserId>>();
    apiManager.invokeApi('contacts.getContacts').then((result) => {
      if(result._ === 'contacts.contacts') {
        this.contactsList.clear();
      
        this.saveApiUsers(result.users);

        result.contacts.forEach((contact) => {
          this.pushContact(contact.user_id);
        });

        this.onContactsModified();

        this.contactsFillPromise = promise;
      }

      promise.resolve(this.contactsList);
    }, () => {
      this.updatedContactsList = false;
    });

    return {
      cached: this.contactsFillPromise?.isFulfilled,
      promise: this.contactsFillPromise || (this.contactsFillPromise = promise)
    };
  }

  public resolveUsername(username: string): Promise<Chat | User> {
    if(username[0] === '@') {
      username = username.slice(1);
    }

    username = username.toLowerCase();
    if(this.usernames[username]) {
      return Promise.resolve(this.users[this.usernames[username]]);
    }

    return apiManager.invokeApi('contacts.resolveUsername', {username}).then(resolvedPeer => {
      return this.processResolvedPeer(resolvedPeer);
    });
  }

  private processResolvedPeer(resolvedPeer: ContactsResolvedPeer.contactsResolvedPeer) {
    this.saveApiUsers(resolvedPeer.users);
    appChatsManager.saveApiChats(resolvedPeer.chats);

    return appPeersManager.getPeer(appPeersManager.getPeerId(resolvedPeer.peer)) as Chat | User;
  }

  public resolvePhone(phone: string) {
    return apiManager.invokeApi('contacts.resolvePhone', {phone}).then(resolvedPeer => {
      return this.processResolvedPeer(resolvedPeer) as User;
    });
  }

  public pushContact(id: UserId) {
    this.contactsList.add(id);
    this.contactsIndex.indexObject(id, this.getUserSearchText(id));
    appStateManager.requestPeerSingle(id.toPeerId(), 'contact');
  }

  public popContact(id: UserId) {
    this.contactsList.delete(id);
    this.contactsIndex.indexObject(id, ''); // delete search index
    appStateManager.releaseSinglePeer(id.toPeerId(), 'contact');
  }

  public getUserSearchText(id: UserId) {
    const user = this.users[id];
    if(!user) {
      return '';
    }

    const arr: string[] = [
      user.first_name,
      user.last_name,
      user.phone,
      user.username,
      user.pFlags.self ? I18n.format('SavedMessages', true) : '',
      user.pFlags.self ? 'Saved Messages' : ''
    ];

    return arr.filter(Boolean).join(' ');
  }

  public getContacts(query?: string, includeSaved = false, sortBy: 'name' | 'online' | 'none' = 'name') {
    return this.fillContacts().promise.then(_contactsList => {
      let contactsList = [..._contactsList];
      if(query) {
        const results = this.contactsIndex.search(query);
        const filteredContactsList = [...contactsList].filter(id => results.has(id));

        contactsList = filteredContactsList;
      }

      if(sortBy === 'name') {
        contactsList.sort((userId1, userId2) => {
          const sortName1 = (this.users[userId1] || {}).sortName || '';
          const sortName2 = (this.users[userId2] || {}).sortName || '';
          return sortName1.localeCompare(sortName2);
        });
      } else if(sortBy === 'online') {
        contactsList.sort((userId1, userId2) => {
          const status1 = appUsersManager.getUserStatusForSort(appUsersManager.getUser(userId1).status);
          const status2 = appUsersManager.getUserStatusForSort(appUsersManager.getUser(userId2).status);
          return status2 - status1;
        });
      }

      const myUserId = rootScope.myId.toUserId();
      indexOfAndSplice(contactsList, myUserId);
      if(includeSaved) {
        if(this.testSelfSearch(query)) {
          contactsList.unshift(myUserId);
        }
      }

      return contactsList;
    });
  }

  public getContactsPeerIds(
    query?: Parameters<AppUsersManager['getContacts']>[0], 
    includeSaved?: Parameters<AppUsersManager['getContacts']>[1], 
    sortBy?: Parameters<AppUsersManager['getContacts']>[2]) {
    return this.getContacts(query, includeSaved, sortBy).then(userIds => {
      return userIds.map(userId => userId.toPeerId(false));
    });
  }

  public toggleBlock(peerId: PeerId, block: boolean) {
    return apiManager.invokeApiSingle(block ? 'contacts.block' : 'contacts.unblock', {
      id: appPeersManager.getInputPeerById(peerId)
    }).then(value => {
      if(value) {
        apiUpdatesManager.processLocalUpdate({
          _: 'updatePeerBlocked',
          peer_id: appPeersManager.getOutputPeer(peerId),
          blocked: block
        });
      }

      return value;
    });
  }

  public testSelfSearch(query: string) {
    const user = this.getSelf();
    const index = this.createSearchIndex();
    index.indexObject(user.id, this.getUserSearchText(user.id));
    return index.search(query).has(user.id);
  }

  private createSearchIndex() {
    return new SearchIndex<UserId>({
      clearBadChars: true,
      ignoreCase: true,
      latinize: true,
      includeTag: true
    });
  }

  public saveApiUsers(apiUsers: MTUser[], override?: boolean) {
    if((apiUsers as any).saved) return;
    (apiUsers as any).saved = true;
    apiUsers.forEach((user) => this.saveApiUser(user, override));
  }

  private setUserNameToCache(user: MTUser.user, oldUser?: MTUser.user) {
    if(!oldUser || oldUser.username !== user.username) {
      if(oldUser?.username) {
        const oldSearchUsername = cleanUsername(oldUser.username);
        delete this.usernames[oldSearchUsername];
      }

      if(user.username) {
        const searchUsername = cleanUsername(user.username);
        this.usernames[searchUsername] = user.id;
      }
    }
  }

  public saveApiUser(user: MTUser, override?: boolean) {
    if(user._ === 'userEmpty') return;

    const userId = user.id;
    const oldUser = this.users[userId];

    // ! commented block can affect performance !
    // if(oldUser && !override) {
    //   console.log('saveApiUser same');
    //   return;
    // }

    if(user.pFlags === undefined) {
      user.pFlags = {};
    }

    if(user.pFlags.min && oldUser !== undefined) {
      return;
    }

    // * exclude from state
    // defineNotNumerableProperties(user, ['initials', 'num', 'rFirstName', 'rFullName', 'rPhone', 'sortName', 'sortStatus']);

    this.setUserNameToCache(user, oldUser);

    if(!oldUser 
      || oldUser.initials === undefined 
      || oldUser.sortName === undefined 
      || oldUser.first_name !== user.first_name 
      || oldUser.last_name !== user.last_name) {
      const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');

      user.sortName = user.pFlags.deleted ? '' : cleanSearchText(fullName, false);  
      user.initials = RichTextProcessor.getAbbreviation(fullName);
    } else {
      user.sortName = oldUser.sortName;
      user.initials = oldUser.initials;
    }

    if(user.status) {
      if((user.status as UserStatus.userStatusOnline).expires) {
        (user.status as UserStatus.userStatusOnline).expires -= serverTimeManager.serverTimeOffset;
      }

      if((user.status as UserStatus.userStatusOffline).was_online) {
        (user.status as UserStatus.userStatusOffline).was_online -= serverTimeManager.serverTimeOffset;
      }
    }

    //user.sortStatus = user.pFlags.bot ? -1 : this.getUserStatusForSort(user.status);

    let changedPhoto = false, changedTitle = false;
    if(oldUser === undefined) {
      this.users[userId] = user;
    } else {
      if(user.first_name !== oldUser.first_name 
        || user.last_name !== oldUser.last_name 
        || user.username !== oldUser.username) {
        changedTitle = true;
      }

      const oldPhotoId = (oldUser.photo as UserProfilePhoto.userProfilePhoto)?.photo_id;
      const newPhotoId = (user.photo as UserProfilePhoto.userProfilePhoto)?.photo_id;
      if(oldPhotoId !== newPhotoId) {
        changedPhoto = true;
      }

      /* if(user.pFlags.bot && user.bot_info_version !== oldUser.bot_info_version) {
        
      } */

      const wasContact = !!oldUser.pFlags.contact;
      const newContact = !!user.pFlags.contact;

      safeReplaceObject(oldUser, user);
      rootScope.dispatchEvent('user_update', userId);

      if(wasContact !== newContact) {
        this.onContactUpdated(userId, newContact, wasContact);
      }
    }

    if(changedPhoto) {
      rootScope.dispatchEvent('avatar_update', user.id.toPeerId());
    }

    if(changedTitle) {
      rootScope.dispatchEvent('peer_title_edit', user.id.toPeerId());
    }

    this.setUserToStateIfNeeded(user);
  }

  public setUserToStateIfNeeded(user: User) {
    if(appStateManager.isPeerNeeded(user.id.toPeerId())) {
      this.storage.set({
        [user.id]: user
      });
    }
  }

  public formatUserPhone(phone: string) {
    return '+' + formatPhoneNumber(phone).formatted;
  }

  public isUserOnlineVisible(id: UserId) {
    return this.getUserStatusForSort(id) > 3;
  }

  public getUserStatusForSort(status: User['status'] | UserId) {
    if(typeof(status) !== 'object') {
      status = this.getUser(status).status;
    }

    if(status) {
      const expires = status._ === 'userStatusOnline' ? status.expires : (status._ === 'userStatusOffline' ? status.was_online : 0);
      if(expires) {
        return expires;
      }

      /* const timeNow = tsNow(true);
      switch(status._) {
        case 'userStatusRecently':
          return timeNow - 86400 * 3;
        case 'userStatusLastWeek':
          return timeNow - 86400 * 7;
        case 'userStatusLastMonth':
          return timeNow - 86400 * 30;
      } */
      switch(status._) {
        case 'userStatusRecently':
          return 3;
        case 'userStatusLastWeek':
          return 2;
        case 'userStatusLastMonth':
          return 1;
      }
    }

    return 0;
  }

  public getUser(id: User | UserId) {
    if(isObject<User>(id)) {
      return id;
    }

    return this.users[id] || {id, pFlags: {deleted: true}, access_hash: ''} as User;
  }

  public getSelf() {
    return this.getUser(rootScope.myId);
  }

  public getUserStatusString(id: UserId): HTMLElement {
    let key: LangPackKey;
    let args: any[];

    switch(id) {
      case REPLIES_PEER_ID:
        key = 'Peer.RepliesNotifications';
        break;
      case SERVICE_PEER_ID:
        key = 'Peer.ServiceNotifications';
        break;
      default: {
        if(this.isBot(id)) {
          key = 'Bot';
          break;
        }

        const user = this.getUser(id);
        if(!user) {
          key = '' as any;
          break;
        }

        if(user.pFlags.support) {
          key = 'SupportStatus';
          break;
        }

        switch(user.status?._) {
          case 'userStatusRecently': {
            key = 'Lately';
            break;
          }
    
          case 'userStatusLastWeek': {
            key = 'WithinAWeek';
            break;
          }
    
          case 'userStatusLastMonth': {
            key = 'WithinAMonth';
            break;
          }
          
          case 'userStatusOffline': {
            const date = user.status.was_online;
            const today = new Date();
            const now = today.getTime() / 1000 | 0;
            
            const diff = now - date;
            if(diff < 60) {
              key = 'Peer.Status.justNow';
            } else if(diff < 3600) {
              key = 'Peer.Status.minAgo';
              const c = diff / 60 | 0;
              args = [c];
            } else if(diff < 86400 && today.getDate() === new Date(date * 1000).getDate()) {
              key = 'LastSeen.HoursAgo';
              const c = diff / 3600 | 0;
              args = [c];
            } else {
              key = 'Peer.Status.LastSeenAt';
              const {dateEl, timeEl} = formatFullSentTimeRaw(date);
              args = [dateEl, timeEl];
            }
            
            break;
          }
    
          case 'userStatusOnline': {
            key = 'Online';
            break;
          }
    
          default: {
            key = 'ALongTimeAgo';
            break;
          }
        }

        break;
      }
    }
    
    return i18n(key, args);
  }

  public isBot(id: UserId) {
    return this.users[id] && !!this.users[id].pFlags.bot;
  }

  public isContact(id: UserId) {
    return this.contactsList.has(id) || !!(this.users[id] && this.users[id].pFlags.contact);
  }
  
  public isRegularUser(id: UserId) {
    const user = this.users[id];
    return user && !this.isBot(id) && !user.pFlags.deleted && !user.pFlags.support;
  }

  public isNonContactUser(id: UserId) {
    return this.isRegularUser(id) && !this.isContact(id) && id.toPeerId() !== rootScope.myId;
  }

  public hasUser(id: UserId, allowMin?: boolean) {
    const user = this.users[id];
    return isObject(user) && (allowMin || !user.pFlags.min);
  }

  public canSendToUser(id: UserId) {
    const user = this.getUser(id);
    return !user.pFlags.deleted && user.id.toPeerId() !== REPLIES_PEER_ID;
  }

  public getUserPhoto(id: UserId) {
    const user = this.getUser(id);

    return user && user.photo || {
      _: 'userProfilePhotoEmpty'
    };
  }

  public getUserString(id: UserId) {
    const user = this.getUser(id);
    return 'u' + id + (user.access_hash ? '_' + user.access_hash : '');
  }

  public getUserInput(id: UserId): InputUser {
    const user = this.getUser(id);
    if(user.pFlags && user.pFlags.self) {
      return {_: 'inputUserSelf'};
    }

    return {
      _: 'inputUser',
      user_id: id,
      access_hash: user.access_hash
    };
  }

  public getUserInputPeer(id: UserId): InputPeer.inputPeerSelf | InputPeer.inputPeerUser {
    const user = this.getUser(id);
    if(user.pFlags && user.pFlags.self) {
      return {_: 'inputPeerSelf'};
    }

    return {
      _: 'inputPeerUser',
      user_id: id,
      access_hash: user.access_hash
    };
  }

  public getContactMediaInput(id: UserId): InputMedia.inputMediaContact {
    const user = this.getUser(id);

    return {
      _: 'inputMediaContact',
      first_name: user.first_name,
      last_name: user.last_name,
      phone_number: user.phone,
      vcard: '',
      user_id: id
    };
  }

  public updateUsersStatuses = () => {
    const timestampNow = tsNow(true);
    for(const i in this.users) {
      const user = this.users[i];
      this.updateUserStatus(user, timestampNow);
    }
  };

  public updateUserStatus(user: MTUser.user, timestampNow = tsNow(true)) {
    if(user.status &&
      user.status._ === 'userStatusOnline' &&
      user.status.expires < timestampNow) {
      user.status = {_: 'userStatusOffline', was_online: user.status.expires};
      rootScope.dispatchEvent('user_update', user.id);

      this.setUserToStateIfNeeded(user);
    }
  }

  public forceUserOnline(id: UserId, eventTimestamp?: number) {
    if(this.isBot(id)) {
      return;
    }

    const timestamp = tsNow(true);
    const onlineTimeFor = 60;
    if(eventTimestamp) {
      if((timestamp - eventTimestamp) >= onlineTimeFor) {
        return;
      }
    } else if(apiUpdatesManager.updatesState.syncLoading) {
      return;
    }

    const user = this.getUser(id);
    if(user &&
      user.status &&
      user.status._ !== 'userStatusOnline' &&
      user.status._ !== 'userStatusEmpty' &&
      !user.pFlags.support &&
      !user.pFlags.deleted) {

      user.status = {
        _: 'userStatusOnline',
        expires: timestamp + onlineTimeFor
      };
      
      //user.sortStatus = this.getUserStatusForSort(user.status);
      rootScope.dispatchEvent('user_update', id);

      this.setUserToStateIfNeeded(user);
    }
  }

  public importContact(first_name: string, last_name: string, phone: string) {
    return this.importContacts([{
      first_name,
      last_name,
      phones: [phone]
    }]).then(userIds => {
      if(!userIds.length) {
        const error = new Error();
        (error as any).type = 'NO_USER';
        throw error;
      }

      return userIds[0];
    });
  }

  public importContacts(contacts: {phones: string[], first_name: string, last_name: string}[]) {
    const inputContacts: InputContact[] = [];

    for(let i = 0; i < contacts.length; ++i) {
      for(let j = 0; j < contacts[i].phones.length; ++j) {
        inputContacts.push({
          _: 'inputPhoneContact',
          client_id: (i << 16 | j).toString(10),
          phone: contacts[i].phones[j],
          first_name: contacts[i].first_name,
          last_name: contacts[i].last_name
        });
      }
    }

    return apiManager.invokeApi('contacts.importContacts', {
      contacts: inputContacts
    }).then((importedContactsResult) => {
      this.saveApiUsers(importedContactsResult.users);

      const userIds = importedContactsResult.imported.map((importedContact) => {
        this.onContactUpdated(importedContact.user_id, true);
        return importedContact.user_id;
      });

      return userIds;
    });
  }

  public getTopPeers(type: TopPeerType) {
    if(this.getTopPeersPromises[type]) return this.getTopPeersPromises[type];

    return this.getTopPeersPromises[type] = appStateManager.getState().then((state) => {
      const cached = state.topPeersCache[type];
      if(cached && (cached.cachedTime + 86400e3) > Date.now() && cached.peers) {
        return cached.peers;
      }

      return apiManager.invokeApi('contacts.getTopPeers', {
        [type]: true,
        offset: 0,
        limit: 15,
        hash: '0'
      }).then((result) => {
        let topPeers: MyTopPeer[] = [];
        if(result._ === 'contacts.topPeers') {
          //console.log(result);
          this.saveApiUsers(result.users);
          appChatsManager.saveApiChats(result.chats);

          if(result.categories.length) {
            topPeers = result.categories[0].peers.map((topPeer) => {
              const peerId = appPeersManager.getPeerId(topPeer.peer);
              appStateManager.requestPeer(peerId, 'topPeer');
              return {id: peerId, rating: topPeer.rating};
            });
          }
        }
  
        state.topPeersCache[type] = {
          peers: topPeers,
          cachedTime: Date.now()
        };
        appStateManager.pushToState('topPeersCache', state.topPeersCache);
  
        return topPeers;
      });
    });
  }

  public getBlocked(offset = 0, limit = 0) {
    return apiManager.invokeApiSingle('contacts.getBlocked', {offset, limit}).then(contactsBlocked => {
      this.saveApiUsers(contactsBlocked.users);
      appChatsManager.saveApiChats(contactsBlocked.chats);
      const count = contactsBlocked._ === 'contacts.blocked' ? contactsBlocked.users.length + contactsBlocked.chats.length : contactsBlocked.count;

      const peerIds: PeerId[] = contactsBlocked.users.map(u => u.id.toPeerId()).concat(contactsBlocked.chats.map(c => c.id.toPeerId(true)));

      return {count, peerIds};
    });
  }

  public getLocated(
    lat: number, 
    long: number,
    accuracy_radius: number,
    background: boolean = false,
    self_expires: number = 0
  ) {
    const geo_point: InputGeoPoint = {
      _: 'inputGeoPoint',
      lat,
      long,
      accuracy_radius
    };

    return apiManager.invokeApi('contacts.getLocated', {
      geo_point, 
      background
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);
      return updates;
    });
  }

  /* public searchContacts(query: string, limit = 20) {
    return Promise.all([
      this.getContacts(query),
      apiManager.invokeApi('contacts.search', {
        q: query,
        limit
      })
    ]).then(results => {
      const [myContacts, peers] = results;

      this.saveApiUsers(peers.users);
      appChatsManager.saveApiChats(peers.chats);

      // * contacts.search returns duplicates in my_results
      const myResults = new Set(myContacts.concat(peers.my_results.map(p => appPeersManager.getPeerID(p))));

      const out = {
        my_results: [...myResults].slice(0, limit),
        results: peers.results.map(p => appPeersManager.getPeerID(p))
      };

      return out;
    });
  } */
  public searchContacts(query: string, limit = 20) {
    // handle 't.me/username' as 'username'
    const entities = RichTextProcessor.parseEntities(query);
    if(entities.length && entities[0].length === query.trim().length && entities[0]._ === 'messageEntityUrl') {
      try {
        const url = new URL(RichTextProcessor.wrapUrl(query).url);
        const path = url.pathname.slice(1);
        if(path) {
          query = path;
        }
      } catch(err) {}
    }

    return apiManager.invokeApiCacheable('contacts.search', {
      q: query,
      limit
    }, {cacheSeconds: 60}).then(peers => {
      this.saveApiUsers(peers.users);
      appChatsManager.saveApiChats(peers.chats);

      const out = {
        my_results: filterUnique(peers.my_results.map(p => appPeersManager.getPeerId(p))), // ! contacts.search returns duplicates in my_results
        results: peers.results.map(p => appPeersManager.getPeerId(p))
      };

      return out;
    });
  }

  private onContactUpdated(userId: UserId, isContact: boolean, curIsContact = this.isContact(userId)) {
    if(isContact !== curIsContact) {
      if(isContact) {
        this.pushContact(userId);
      } else {
        this.popContact(userId);
      }

      this.onContactsModified();

      rootScope.dispatchEvent('contacts_update', userId);
    }
  }

  public updateUsername(username: string) {
    return apiManager.invokeApi('account.updateUsername', {
      username
    }).then((user) => {
      this.saveApiUser(user);
    });
  }

  public setUserStatus(userId: UserId, offline: boolean) {
    if(this.isBot(userId)) {
      return;
    }

    const user = this.users[userId];
    if(user) {
      const status: UserStatus = offline ? {
        _: 'userStatusOffline',
        was_online: tsNow(true)
      } : {
        _: 'userStatusOnline',
        expires: tsNow(true) + 50
      };

      user.status = status;
      //user.sortStatus = this.getUserStatusForSort(user.status);
      rootScope.dispatchEvent('user_update', userId);

      this.setUserToStateIfNeeded(user);
    }
  }

  public addContact(userId: UserId, first_name: string, last_name: string, phone: string, showPhone?: true) {
    /* if(!userId) {
      return this.importContacts([{
        first_name,
        last_name,
        phones: [phone]
      }]);
    } */

    return apiManager.invokeApi('contacts.addContact', {
      id: this.getUserInput(userId),
      first_name,
      last_name,
      phone,
      add_phone_privacy_exception: showPhone
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates, {override: true});

      this.onContactUpdated(userId, true);
    });
  }

  public deleteContacts(userIds: UserId[]) {
    return apiManager.invokeApi('contacts.deleteContacts', {
      id: userIds.map(userId => this.getUserInput(userId))
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates, {override: true});

      userIds.forEach(userId => {
        this.onContactUpdated(userId, false);
      });
    });
  }

  public isRestricted(userId: UserId) {
    const user: MTUser.user = this.getUser(userId);
    const restrictionReasons = user.restriction_reason;

    return !!(user.pFlags.restricted && restrictionReasons && isRestricted(restrictionReasons));
  }
}

const appUsersManager = new AppUsersManager();
MOUNT_CLASS_TO.appUsersManager = appUsersManager;
export default appUsersManager
