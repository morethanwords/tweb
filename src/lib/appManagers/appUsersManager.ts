import { formatPhoneNumber } from "../../components/misc";
import { MOUNT_CLASS_TO } from "../../config/debug";
import { tsNow } from "../../helpers/date";
import { safeReplaceObject, isObject } from "../../helpers/object";
import { InputUser, Update, User as MTUser, UserStatus } from "../../layer";
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
  private cachedPhotoLocations: any = {};
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
        case 'updateUserStatus':
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
  
        case 'updateUserPhoto': {
          const userId = update.user_id;
          const user = this.users[userId];
          if(user) {
            this.forceUserOnline(userId);

            if(!user.photo) {
              user.photo = update.photo;
            } else {
              safeReplaceObject(user.photo, update.photo);
            }
  
            if(this.cachedPhotoLocations[userId] !== undefined) {
              safeReplaceObject(this.cachedPhotoLocations[userId], update.photo ?  
                update.photo : {empty: true});
            }
  
            rootScope.broadcast('user_update', userId);
            rootScope.broadcast('avatar_update', userId);
          } else console.warn('No user by id:', userId);

          break;
        }

        /* case 'updateContactLink':
          this.onContactUpdated(update.user_id, update.my_link._ === 'contactLinkContact');
          break; */
      }
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

      appStateManager.addListener('save', async() => {
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

    const serviceText = user.pFlags.self ? 'Saved Messages' : '';
    return (user.first_name || '') +
            ' ' + (user.last_name || '') +
            ' ' + (user.phone || '') +
            ' ' + (user.username || '') +
            ' ' + serviceText;
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

    const oldUser = this.users[userId];
    if(oldUser === undefined) {
      this.users[userId] = user;
    } else {
      safeReplaceObject(oldUser, user);
    }

    rootScope.broadcast('user_update', userId);

    if(this.cachedPhotoLocations[userId] !== undefined) {
      safeReplaceObject(this.cachedPhotoLocations[userId], user && 
        user.photo ? user.photo : {empty: true});
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

  public getUserStatusString(userId: number) {
    switch(userId) {
      case REPLIES_PEER_ID:
        return 'reply notifications';
      case 777000:
        return 'service notifications';
    }

    if(this.isBot(userId)) {
      return 'bot';
    }

    const user = this.getUser(userId);
    if(!user) {
      return '';
    }

    if(user.pFlags.support) {
      return 'support';
    }
    
    let str = '';
    switch(user.status?._) {
      case 'userStatusRecently': {
        str = 'last seen recently';
        break;
      }

      case 'userStatusLastWeek': {
        str = 'last seen last week';
        break;
      }

      case 'userStatusLastMonth': {
        str = 'last seen last month';
        break;
      }
      
      case 'userStatusOffline': {
        str = 'last seen ';
      
        const date = user.status.was_online;
        const now = Date.now() / 1000;
        
        if((now - date) < 60) {
          str += ' just now';
        } else if((now - date) < 3600) {
          const c = (now - date) / 60 | 0;
          str += c + ' ' + (c === 1 ? 'minute' : 'minutes') + ' ago';
        } else if(now - date < 86400) {
          const c = (now - date) / 3600 | 0;
          str += c + ' ' + (c === 1 ? 'hour' : 'hours') + ' ago';
        } else {
          const d = new Date(date * 1000);
          str += ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' at ' + 
          ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        }
        
        break;
      }

      case 'userStatusOnline': {
        str = 'online';
        break;
      }

      default: {
        str = 'last seen a long time ago';
        break;
      }
    }

    return str;
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
    var user = this.getUser(id);

    if(this.cachedPhotoLocations[id] === undefined) {
      this.cachedPhotoLocations[id] = user && user.photo ? user.photo : {empty: true};
    }

    return this.cachedPhotoLocations[id];
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

  /* public onContactUpdated(userId: number, isContact: boolean) {
    userId = parseInt('' + userId);

    if(Array.isArray(this.contactsList)) {
      var curPos = this.contactsList.indexOf(userId);
      var curIsContact = curPos !== -1;

      if(isContact !== curIsContact) {
        if(isContact) {
          this.contactsList.push(userId)
          searchIndexManager.indexObject(userId, this.getUserSearchText(userId), this.contactsIndex);
        } else {
          this.contactsList.splice(curPos, 1);
        }

        rootScope.$broadcast('contacts_update', userId);
      }
    }
  } */

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
}

const appUsersManager = new AppUsersManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appUsersManager = appUsersManager);
export default appUsersManager
