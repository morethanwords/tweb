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

import { formatPhoneNumber } from "../../components/misc";
import { MOUNT_CLASS_TO } from "../../config/debug";
import { tsNow } from "../../helpers/date";
import { safeReplaceObject, isObject } from "../../helpers/object";
import { InputUser, Update, User as MTUser, UserProfilePhoto, UserStatus } from "../../layer";
import I18n, { i18n, LangPackKey } from "../langPack";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { REPLIES_PEER_ID } from "../mtproto/mtproto_config";
import serverTimeManager from "../mtproto/serverTimeManager";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import searchIndexManager from "../searchIndexManager";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appPeersManager from "./appPeersManager";
import appStateManager from "./appStateManager";

// TODO: updateUserBlocked

export type User = MTUser.user;

export class AppUsersManager {
  private users: {[userId: number]: User} = {};
  private usernames: {[username: string]: number} = {};
  //public userAccess: {[userId: number]: string} = {};
  private contactsIndex = searchIndexManager.createIndex();
  private contactsFillPromise: Promise<Set<number>>;
  public contactsList: Set<number> = new Set();
  private updatedContactsList = false;
  
  private getTopPeersPromise: Promise<number[]>;

  constructor() {
    setInterval(this.updateUsersStatuses, 60000);

    rootScope.on('state_synchronized', this.updateUsersStatuses);

    rootScope.on('apiUpdate', (e) => {
      const update = e as Update;
      //console.log('on apiUpdate', update);
      switch(update._) {
        case 'updateUserStatus': {
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

            user.sortStatus = this.getUserStatusForSort(user.status);
            rootScope.broadcast('user_update', userId);
          } //////else console.warn('No user by id:', userId);

          break;
        }
  
        case 'updateUserPhoto': {
          const userId = update.user_id;
          const user = this.users[userId];
          if(user) {
            this.forceUserOnline(userId);

            if(update.photo._ === 'userProfilePhotoEmpty') {
              delete user.photo;
            } else {
              user.photo = safeReplaceObject(user.photo, update.photo);
            }

            rootScope.broadcast('user_update', userId);
            rootScope.broadcast('avatar_update', userId);
          } else console.warn('No user by id:', userId);

          break;
        }

        case 'updateUserName': {
          const userId = update.user_id;
          const user = this.users[userId];
          if(user) {
            this.forceUserOnline(userId);
            
            this.saveApiUser(Object.assign({}, user, {
              first_name: update.first_name,
              last_name: update.last_name,
              username: update.username
            }));
          }

          break;
        }

        /* case 'updateContactLink':
          this.onContactUpdated(update.user_id, update.my_link._ === 'contactLinkContact');
          break; */
      }
    });

    rootScope.on('language_change', (e) => {
      const userId = this.getSelf().id;
      searchIndexManager.indexObject(userId, this.getUserSearchText(userId), this.contactsIndex);
    });

    appStateManager.getState().then((state) => {
      this.users = state.users;

      const contactsList = state.contactsList;
      if(contactsList && Array.isArray(contactsList)) {
        contactsList.forEach(userId => {
          this.pushContact(userId);
        });

        if(this.contactsList.size) {
          this.contactsFillPromise = Promise.resolve(this.contactsList);
        }
      }

      appStateManager.addEventListener('save', async() => {
        const contactsList = [...this.contactsList];
        for(const userId of contactsList) {
          appStateManager.setPeer(userId, this.getUser(userId));
        }
  
        appStateManager.pushToState('contactsList', contactsList);
      });
    });
  }

  public fillContacts() {
    if(this.contactsFillPromise && this.updatedContactsList) {
      return this.contactsFillPromise;
    }

    this.updatedContactsList = true;

    const promise = apiManager.invokeApi('contacts.getContacts').then((result) => {
      if(result._ === 'contacts.contacts') {
        this.saveApiUsers(result.users);

        result.contacts.forEach((contact) => {
          this.pushContact(contact.user_id);
        });
      }

      this.contactsFillPromise = promise;

      return this.contactsList;
    });

    return this.contactsFillPromise || (this.contactsFillPromise = promise);
  }

  public resolveUsername(username: string) {
    if(username[0] === '@') {
      username = username.slice(1);
    }

    username = username.toLowerCase();
    if(this.usernames[username]) {
      return Promise.resolve(this.users[this.usernames[username]]);
    }

    return apiManager.invokeApi('contacts.resolveUsername', {username}).then(resolvedPeer => {
      this.saveApiUsers(resolvedPeer.users);
      appChatsManager.saveApiChats(resolvedPeer.chats);

      return appPeersManager.getPeer(appPeersManager.getPeerId(resolvedPeer.peer));
    });
  }

  public pushContact(userId: number) {
    this.contactsList.add(userId);
    searchIndexManager.indexObject(userId, this.getUserSearchText(userId), this.contactsIndex);
  }

  public getUserSearchText(id: number) {
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

  public getContacts(query?: string, includeSaved = false) {
    return this.fillContacts().then(_contactsList => {
      let contactsList = [..._contactsList];
      if(query) {
        const results = searchIndexManager.search(query, this.contactsIndex);
        const filteredContactsList = [...contactsList].filter(id => !!results[id]);

        contactsList = filteredContactsList;
      }

      contactsList.sort((userId1: number, userId2: number) => {
        const sortName1 = (this.users[userId1] || {}).sortName || '';
        const sortName2 = (this.users[userId2] || {}).sortName || '';

        return sortName1.localeCompare(sortName2);
      });

      if(includeSaved) {
        if(this.testSelfSearch(query)) {
          contactsList.findAndSplice(p => p === rootScope.myId);
          contactsList.unshift(rootScope.myId);
        }
      }

      /* contactsList.sort((userId1: number, userId2: number) => {
        const sortName1 = (this.users[userId1] || {}).sortName || '';
        const sortName2 = (this.users[userId2] || {}).sortName || '';
        if(sortName1 === sortName2) {
          return 0;
        } 
        
        return sortName1 > sortName2 ? 1 : -1;
      }); */

      return contactsList;
    });
  }

  public toggleBlock(peerId: number, block: boolean) {
    return apiManager.invokeApi(block ? 'contacts.block' : 'contacts.unblock', {
      id: appPeersManager.getInputPeerById(peerId)
    }).then(value => {
      if(value) {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updatePeerBlocked',
            peer_id: appPeersManager.getOutputPeer(peerId),
            blocked: block
          } as Update.updatePeerBlocked
        });
      }

      return value;
    });
  }

  public testSelfSearch(query: string) {
    const user = this.getSelf();
    const index = searchIndexManager.createIndex();
    searchIndexManager.indexObject(user.id, this.getUserSearchText(user.id), index);
    return !!searchIndexManager.search(query, index)[user.id];
  }

  public saveApiUsers(apiUsers: any[]) {
    apiUsers.forEach((user) => this.saveApiUser(user));
  }

  public saveApiUser(_user: MTUser, noReplace?: boolean) {
    if(_user._ === 'userEmpty') return;

    const user = _user;
    if(noReplace && isObject(this.users[user.id]) && this.users[user.id].first_name) {
      return;
    }

    const userId = user.id;

    if(user.pFlags === undefined) {
      user.pFlags = {};
    }

    if(user.pFlags.min) {
      if(this.users[userId] !== undefined) {
        return;
      }
    }

    // * exclude from state
    // defineNotNumerableProperties(user, ['initials', 'num', 'rFirstName', 'rFullName', 'rPhone', 'sortName', 'sortStatus']);

    if(user.phone) {
      user.rPhone = '+' + formatPhoneNumber(user.phone).formatted;
    }

    const fullName = user.first_name + ' ' + (user.last_name || '');
    if(user.first_name) {
      user.rFirstName = RichTextProcessor.wrapRichText(user.first_name, {noLinks: true, noLinebreaks: true});
      user.rFullName = user.last_name ? RichTextProcessor.wrapRichText(fullName, {noLinks: true, noLinebreaks: true}) : user.rFirstName;
    } else {
      user.rFirstName = RichTextProcessor.wrapRichText(user.last_name, {noLinks: true, noLinebreaks: true}) || user.rPhone || 'user_first_name_deleted';
      user.rFullName = RichTextProcessor.wrapRichText(user.last_name, {noLinks: true, noLinebreaks: true}) || user.rPhone || 'user_name_deleted';
    }

    if(user.username) {
      const searchUsername = searchIndexManager.cleanUsername(user.username);
      this.usernames[searchUsername] = userId;
    }

    user.sortName = user.pFlags.deleted ? '' : searchIndexManager.cleanSearchText(fullName, false);

    user.initials = RichTextProcessor.getAbbreviation(fullName);

    if(user.status) {
      if((user.status as UserStatus.userStatusOnline).expires) {
        (user.status as UserStatus.userStatusOnline).expires -= serverTimeManager.serverTimeOffset
      }

      if((user.status as UserStatus.userStatusOffline).was_online) {
        (user.status as UserStatus.userStatusOffline).was_online -= serverTimeManager.serverTimeOffset
      }
    }

    if(user.pFlags.bot) {
      user.sortStatus = -1;
    } else {
      user.sortStatus = this.getUserStatusForSort(user.status);
    }

    let changedTitle = false;
    const oldUser = this.users[userId];
    if(oldUser === undefined) {
      this.users[userId] = user;
    } else {
      if(user.first_name !== oldUser.first_name 
        || user.last_name !== oldUser.last_name 
        || user.username !== oldUser.username) {
        changedTitle = true;
      }

      safeReplaceObject(oldUser, user);
    }

    rootScope.broadcast('user_update', userId);

    if(changedTitle) {
      rootScope.broadcast('peer_title_edit', user.id);
    }
  }

  /* public saveUserAccess(id: number, accessHash: string) {
    this.userAccess[id] = accessHash;
  } */

  public getUserStatusForSort(status: User['status']) {
    if(status) {
      const expires = status._ === 'userStatusOnline' ? status.expires : (status._ === 'userStatusOffline' ? status.was_online : 0);
      if(expires) {
        return expires;
      }

      const timeNow = tsNow(true);
      switch(status._) {
        case 'userStatusRecently':
          return timeNow - 86400 * 3;
        case 'userStatusLastWeek':
          return timeNow - 86400 * 7;
        case 'userStatusLastMonth':
          return timeNow - 86400 * 30;
      }
    }

    return 0;
  }

  public getUser(id: any): User {
    if(isObject(id)) {
      return id;
    }

    return this.users[id] || {id: id, pFlags: {deleted: true}, access_hash: ''/* this.userAccess[id] */} as User;
  }

  public getSelf() {
    return this.getUser(rootScope.myId);
  }

  public getUserStatusString(userId: number): HTMLElement {
    let key: LangPackKey;
    let args: any[];

    switch(userId) {
      case REPLIES_PEER_ID:
        key = 'Peer.RepliesNotifications';
        break;
      case 777000:
        key = 'Peer.ServiceNotifications';
        break;
      default: {
        if(this.isBot(userId)) {
          key = 'Presence.bot';
          break;
        }

        const user = this.getUser(userId);
        if(!user) {
          key = '' as any;
          break;
        }

        if(user.pFlags.support) {
          key = 'Presence.Support';
          break;
        }

        switch(user.status?._) {
          case 'userStatusRecently': {
            key = 'Peer.Status.recently';
            break;
          }
    
          case 'userStatusLastWeek': {
            key = 'Peer.Status.lastWeek';
            break;
          }
    
          case 'userStatusLastMonth': {
            key = 'Peer.Status.lastMonth';
            break;
          }
          
          case 'userStatusOffline': {
            const date = user.status.was_online;
            const now = Date.now() / 1000;
            
            if((now - date) < 60) {
              key = 'Peer.Status.justNow';
            } else if((now - date) < 3600) {
              key = 'Peer.Status.minAgo';
              const c = (now - date) / 60 | 0;
              args = [c];
            } else if(now - date < 86400) {
              key = 'LastSeen.HoursAgo';
              const c = (now - date) / 3600 | 0;
              args = [c];
            } else {
              key = 'Peer.Status.LastSeenAt';
              const d = new Date(date * 1000);
              args = [('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2), 
                ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)];
            }
            
            break;
          }
    
          case 'userStatusOnline': {
            key = 'Peer.Status.online';
            break;
          }
    
          default: {
            key = 'Peer.Status.longTimeAgo';
            break;
          }
        }

        break;
      }
    }
    
    return i18n(key, args);
  }

  public isBot(id: number) {
    return this.users[id] && this.users[id].pFlags.bot;
  }

  public isContact(id: number) {
    return this.contactsList.has(id);
  }
  
  public isRegularUser(id: number) {
    const user = this.users[id];
    return user && !this.isBot(id) && !user.pFlags.deleted && !user.pFlags.support;
  }

  public isNonContactUser(id: number) {
    return this.isRegularUser(id) && !this.isContact(id) && id !== rootScope.myId;
  }

  public hasUser(id: number, allowMin?: boolean) {
    var user = this.users[id];
    return isObject(user) && (allowMin || !user.pFlags.min);
  }

  public canSendToUser(id: number) {
    const user = this.getUser(id);
    return !user.pFlags.deleted && user.username !== 'replies';
  }

  public getUserPhoto(id: number) {
    const user = this.getUser(id);

    return user && user.photo || {
      _: 'userProfilePhotoEmpty'
    };
  }

  public getUserString(id: number) {
    const user = this.getUser(id);
    return 'u' + id + (user.access_hash ? '_' + user.access_hash : '');
  }

  public getUserInput(id: number): InputUser {
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

  public updateUsersStatuses = () => {
    const timestampNow = tsNow(true);
    for(const i in this.users) {
      const user = this.users[i];

      if(user.status &&
        user.status._ === 'userStatusOnline' &&
        user.status.expires < timestampNow) {

        user.status = {_: 'userStatusOffline', was_online: user.status.expires};
        rootScope.broadcast('user_update', user.id);
      }
    }
  };

  public forceUserOnline(id: number, eventTimestamp?: number) {
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
      
      user.sortStatus = this.getUserStatusForSort(user.status);
      rootScope.broadcast('user_update', id);
    }
  }

  /* function importContact (phone, firstName, lastName) {
      return MtpApiManager.invokeApi('contacts.importContacts', {
        contacts: [{
          _: 'inputPhoneContact',
          client_id: '1',
          phone: phone,
          first_name: firstName,
          last_name: lastName
        }],
        replace: false
      }).then(function (importedContactsResult) {
        saveApiUsers(importedContactsResult.users)

        var foundUserID = false
        angular.forEach(importedContactsResult.imported, function (importedContact) {
          onContactUpdated(foundUserID = importedContact.user_id, true)
        })

        return foundUserID || false
      })
  }

  function importContacts (contacts) {
    var inputContacts = [],
      i
    var j

    for (i = 0; i < contacts.length; i++) {
      for (j = 0; j < contacts[i].phones.length; j++) {
        inputContacts.push({
          _: 'inputPhoneContact',
          client_id: (i << 16 | j).toString(10),
          phone: contacts[i].phones[j],
          first_name: contacts[i].first_name,
          last_name: contacts[i].last_name
        })
      }
    }

    return MtpApiManager.invokeApi('contacts.importContacts', {
      contacts: inputContacts,
      replace: false
    }).then(function (importedContactsResult) {
      saveApiUsers(importedContactsResult.users)

      var result = []
      angular.forEach(importedContactsResult.imported, function (importedContact) {
        onContactUpdated(importedContact.user_id, true)
        result.push(importedContact.user_id)
      })

      return result
    })
  } */

  /* public deleteContacts(userIds: number[]) {
    var ids: any[] = [];
    userIds.forEach((userId) => {
      ids.push(this.getUserInput(userId));
    })

    return apiManager.invokeApi('contacts.deleteContacts', {
      id: ids
    }).then(() => {
      userIds.forEach((userId) => {
        this.onContactUpdated(userId, false);
      });
    });
  } */

  public getTopPeers(): Promise<number[]> {
    if(this.getTopPeersPromise) return this.getTopPeersPromise;

    return this.getTopPeersPromise = appStateManager.getState().then((state) => {
      if(state?.topPeers?.length) {
        return state.topPeers;
      }

      return apiManager.invokeApi('contacts.getTopPeers', {
        correspondents: true,
        offset: 0,
        limit: 15,
        hash: 0,
      }).then((result) => {
        let peerIds: number[] = [];
        if(result._ === 'contacts.topPeers') {
          //console.log(result);
          this.saveApiUsers(result.users);
          appChatsManager.saveApiChats(result.chats);

          if(result.categories.length) {
            peerIds = result.categories[0].peers.map((topPeer) => {
              const peerId = appPeersManager.getPeerId(topPeer.peer);
              appStateManager.setPeer(peerId, this.getUser(peerId));
              return peerId;
            });
          }
        }
  
        appStateManager.pushToState('topPeers', peerIds);
  
        return peerIds;
      });
    });
  }

  public getBlocked(offset = 0, limit = 0) {
    return apiManager.invokeApi('contacts.getBlocked', {offset, limit}).then(contactsBlocked => {
      this.saveApiUsers(contactsBlocked.users);
      appChatsManager.saveApiChats(contactsBlocked.chats);
      const count = contactsBlocked._ === 'contacts.blocked' ? contactsBlocked.users.length + contactsBlocked.chats.length : contactsBlocked.count;

      const peerIds = contactsBlocked.users.map(u => u.id).concat(contactsBlocked.chats.map(c => -c.id));

      return {count, peerIds};
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
    return apiManager.invokeApi('contacts.search', {
      q: query,
      limit
    }).then(peers => {
      this.saveApiUsers(peers.users);
      appChatsManager.saveApiChats(peers.chats);

      const out = {
        my_results: [...new Set(peers.my_results.map(p => appPeersManager.getPeerId(p)))], // ! contacts.search returns duplicates in my_results
        results: peers.results.map(p => appPeersManager.getPeerId(p))
      };

      return out;
    });
  }

  public onContactUpdated(userId: number, isContact: boolean) {
    const curIsContact = this.contactsList.has(userId);
    if(isContact !== curIsContact) {
      if(isContact) {
        this.contactsList.add(userId)
        searchIndexManager.indexObject(userId, this.getUserSearchText(userId), this.contactsIndex);
      } else {
        this.contactsList.delete(userId);
      }

      rootScope.broadcast('contacts_update', userId);
    }
  }

  public updateUsername(username: string) {
    return apiManager.invokeApi('account.updateUsername', {
      username
    }).then((user) => {
      this.saveApiUser(user);
    });
  }

  public setUserStatus(userId: number, offline: boolean) {
    if(this.isBot(userId)) {
      return;
    }

    const user = this.users[userId];
    if(user) {
      const status: any = offline ? {
        _: 'userStatusOffline',
        was_online: tsNow(true)
      } : {
        _: 'userStatusOnline',
        expires: tsNow(true) + 500
      };

      user.status = status;
      user.sortStatus = this.getUserStatusForSort(user.status);
      rootScope.broadcast('user_update', userId);
    }
  }

  public addContact(userId: number, first_name: string, last_name: string, phone: string, showPhone?: true) {
    return apiManager.invokeApi('contacts.addContact', {
      id: this.getUserInput(userId),
      first_name,
      last_name,
      phone,
      add_phone_privacy_exception: showPhone
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);

      this.onContactUpdated(userId, true);
    });
  }

  public deleteContacts(userIds: number[]) {
    return apiManager.invokeApi('contacts.deleteContacts', {
      id: userIds.map(userId => this.getUserInput(userId))
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);

      userIds.forEach(userId => {
        this.onContactUpdated(userId, false);
      });
    });
  }
}

const appUsersManager = new AppUsersManager();
MOUNT_CLASS_TO.appUsersManager = appUsersManager;
export default appUsersManager
