import { SearchIndexManager, safeReplaceObject, isObject, tsNow, copy, $rootScope } from "../utils";
import { RichTextProcessor } from "../richtextprocessor";
import appChatsManager from "./appChatsManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import serverTimeManager from "../mtproto/serverTimeManager";
import { formatPhoneNumber } from "../../components/misc";

export type User = {
  _: 'user',
  access_hash: string,
  first_name: string,
  last_name: string,
  username: string,
  flags: number,
  id: number,
  phone: string,
  photo: any,
  
  status?: Partial<{
    _: 'userStatusOffline' | 'userStatusOnline' | 'userStatusRecently' | 'userStatusLastWeek' | 'userStatusLastMonth' | 'userStatusEmpty',
    wasStatus: any,
    was_online: number,
    expires: number
  }>,
  
  initials?: string,
  num?: number,
  pFlags: Partial<{verified: boolean, support: boolean, self: boolean, bot: boolean, min: number, deleted: boolean}>,
  rFirstName?: string,
  rFullName?: string,
  rPhone?: string,
  sortName?: string,
  sortStatus?: number,
};

export class AppUsersManager {
  public users: {[userID: number]: User} = {};
  public usernames: {[username: string]: number} = {};
  public userAccess: {[userID: number]: string} = {};
  public cachedPhotoLocations: any = {};
  public contactsIndex = SearchIndexManager.createIndex();
  public contactsFillPromise: Promise<number[]>;
  public contactsList: number[];
  public myID: number;

  constructor() {
    apiManager.getUserID().then((id) => {
      this.myID = id;
    });

    $rootScope.$on('user_auth', (e: CustomEvent) => {
      let userAuth = e.detail;
      this.myID = userAuth ? userAuth.id : 0;
    });

    setInterval(this.updateUsersStatuses.bind(this), 60000);

    $rootScope.$on('stateSynchronized', this.updateUsersStatuses.bind(this));

    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      let update = e.detail;
      //console.log('on apiUpdate', update);
      switch(update._) {
        case 'updateUserStatus':
          var userID = update.user_id;
          var user = this.users[userID];
          if(user) {
            user.status = update.status;
            if(user.status) {
              if(user.status.expires) {
                user.status.expires -= serverTimeManager.serverTimeOffset;
              }

              if(user.status.was_online) {
                user.status.was_online -= serverTimeManager.serverTimeOffset;
              }
            }

            user.sortStatus = this.getUserStatusForSort(user.status);
            $rootScope.$broadcast('user_update', userID);
          } //////else console.warn('No user by id:', userID);
          break;
  
        case 'updateUserPhoto':
          var userID = update.user_id;
          var user = this.users[userID];
          if(user) {
            this.forceUserOnline(userID);
            if(!user.photo) {
              user.photo = update.photo;
            } else {
              safeReplaceObject(user.photo, update.photo);
            }
  
            if(this.cachedPhotoLocations[userID] !== undefined) {
              safeReplaceObject(this.cachedPhotoLocations[userID], update.photo ?  
                update.photo : {empty: true});
            }
  
            $rootScope.$broadcast('user_update', userID);
            $rootScope.$broadcast('avatar_update', userID);
          } else console.warn('No user by id:', userID);
          break
  
        case 'updateContactLink':
          this.onContactUpdated(update.user_id, update.my_link._ == 'contactLinkContact');
          break;
      }
    });
  }

  public fillContacts() {
    if(this.contactsFillPromise) {
      return this.contactsFillPromise;
    }

    return this.contactsFillPromise = apiManager.invokeApi('contacts.getContacts', {
      hash: 0
    }).then((result: any) => {
      var userID;
      this.contactsList = [];
      this.saveApiUsers(result.users);

      result.contacts.forEach((contact: any) => {
        userID = contact.user_id;
        this.contactsList.push(userID);
        SearchIndexManager.indexObject(userID, this.getUserSearchText(userID), this.contactsIndex);
      });

      return this.contactsList;
    });
  }

  public getUserSearchText(id: number) {
    var user = this.users[id];
    if(!user) {
      return false;
    }
    var serviceText = '';
    if(user.pFlags.self) {
      serviceText = 'user_name_saved_msgs_raw';
    }

    return (user.first_name || '') +
            ' ' + (user.last_name || '') +
            ' ' + (user.phone || '') +
            ' ' + (user.username || '') +
            ' ' + serviceText;
  }

  public getContacts(query?: string) {
    return this.fillContacts().then(contactsList => {
      if(query) {
        const results: any = SearchIndexManager.search(query, this.contactsIndex);
        const filteredContactsList = contactsList.filter(id => !!results[id]);

        contactsList = filteredContactsList;
      }

      contactsList.sort((userID1: number, userID2: number) => {
        const sortName1 = (this.users[userID1] || {}).sortName || '';
        const sortName2 = (this.users[userID2] || {}).sortName || '';

        return sortName1.localeCompare(sortName2);
      });

      /* contactsList.sort((userID1: number, userID2: number) => {
        const sortName1 = (this.users[userID1] || {}).sortName || '';
        const sortName2 = (this.users[userID2] || {}).sortName || '';
        if(sortName1 == sortName2) {
          return 0;
        } 
        
        return sortName1 > sortName2 ? 1 : -1;
      }); */

      return contactsList;
    });
  }

  public resolveUsername(username: string) {
    return this.usernames[username] || 0;
  }

  public saveApiUsers(apiUsers: any[]) {
    apiUsers.forEach((user) => this.saveApiUser(user));
  }

  public saveApiUser(apiUser: any, noReplace?: boolean) {
    if(!isObject(apiUser) ||
      noReplace && isObject(this.users[apiUser.id]) && this.users[apiUser.id].first_name) {
      return;
    }

    var userID = apiUser.id;
    var result = this.users[userID];

    if(apiUser.pFlags === undefined) {
      apiUser.pFlags = {};
    }

    if(apiUser.pFlags.min) {
      if(result !== undefined) {
        return;
      }
    }

    if(apiUser.phone) {
      apiUser.rPhone = '+' + formatPhoneNumber(apiUser.phone).formatted;
    }

    if(apiUser.first_name) {
      apiUser.rFirstName = RichTextProcessor.wrapRichText(apiUser.first_name, {noLinks: true, noLinebreaks: true})
      apiUser.rFullName = apiUser.last_name ? RichTextProcessor.wrapRichText(apiUser.first_name + ' ' + (apiUser.last_name || ''), {noLinks: true, noLinebreaks: true}) : apiUser.rFirstName;
    } else {
      apiUser.rFirstName = RichTextProcessor.wrapRichText(apiUser.last_name, {noLinks: true, noLinebreaks: true}) || apiUser.rPhone || 'user_first_name_deleted';
      apiUser.rFullName = RichTextProcessor.wrapRichText(apiUser.last_name, {noLinks: true, noLinebreaks: true}) || apiUser.rPhone || 'user_name_deleted';
    }

    if(apiUser.username) {
      var searchUsername = SearchIndexManager.cleanUsername(apiUser.username);
      this.usernames[searchUsername] = userID;
    }

    apiUser.sortName = apiUser.pFlags.deleted ? '' : SearchIndexManager.cleanSearchText(apiUser.first_name + ' ' + (apiUser.last_name || ''), false);

    var nameWords = apiUser.sortName.split(' ');
    var firstWord = nameWords.shift();
    var lastWord = nameWords.pop();
    apiUser.initials = firstWord.charAt(0) + (lastWord ? lastWord.charAt(0) : firstWord.charAt(1));

    if(apiUser.status) {
      if(apiUser.status.expires) {
        apiUser.status.expires -= serverTimeManager.serverTimeOffset
      }

      if(apiUser.status.was_online) {
        apiUser.status.was_online -= serverTimeManager.serverTimeOffset
      }
    }

    if(apiUser.pFlags.bot) {
      apiUser.sortStatus = -1;
    } else {
      apiUser.sortStatus = this.getUserStatusForSort(apiUser.status);
    }

    var result = this.users[userID];
    if(result === undefined) {
      result = this.users[userID] = apiUser;
    } else {
      safeReplaceObject(result, apiUser);
    }

    $rootScope.$broadcast('user_update', userID);

    if(this.cachedPhotoLocations[userID] !== undefined) {
      safeReplaceObject(this.cachedPhotoLocations[userID], apiUser && 
        apiUser.photo ? apiUser.photo : {empty: true});
    }
  }

  public saveUserAccess(id: number, accessHash: string) {
    this.userAccess[id] = accessHash;
  }

  public getUserStatusForSort(status: User['status']) {
    if(status) {
      var expires = status.expires || status.was_online;
      if(expires) {
        return expires;
      }
      var timeNow = tsNow(true);
      switch (status._) {
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

    return this.users[id] || {id: id, pFlags: {deleted: true}, access_hash: this.userAccess[id]} as User;
  }

  public getSelf() {
    return this.getUser(this.myID);
  }

  public getUserStatusString(userID: number) {
    if(this.isBot(userID)) {
      return 'bot';
    }

    let user = this.getUser(userID);
    if(!user || !user.status) {
      return '';
    }
    
    let str = '';
    switch(user.status._) {
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
      
        let date = user.status.was_online;
        let now = Date.now() / 1000;
        
        if((now - date) < 60) {
          str += ' just now';
        } else if((now - date) < 3600) {
          let c = (now - date) / 60 | 0;
          str += c + ' ' + (c == 1 ? 'minute' : 'minutes') + ' ago';
        } else if(now - date < 86400) {
          let c = (now - date) / 3600 | 0;
          str += c + ' ' + (c == 1 ? 'hour' : 'hours') + ' ago';
        } else {
          let d = new Date(date * 1000);
          str += ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' at ' + 
          ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        }
        
        break;
      }

      case 'userStatusOnline': {
        str = 'online';
        break;
      }
    }

    return str;
  }

  public isBot(id: number) {
    return this.users[id] && this.users[id].pFlags.bot;
  }

  public hasUser(id: number, allowMin?: boolean) {
    var user = this.users[id];
    return isObject(user) && (allowMin || !user.pFlags.min);
  }

  public getUserPhoto(id: number) {
    var user = this.getUser(id);

    if(this.cachedPhotoLocations[id] === undefined) {
      this.cachedPhotoLocations[id] = user && user.photo ? user.photo : {empty: true};
    }

    return this.cachedPhotoLocations[id];
  }

  public getUserString(id: number) {
    var user = this.getUser(id);
    return 'u' + id + (user.access_hash ? '_' + user.access_hash : '');
  }

  public getUserInput(id: number) {
    var user = this.getUser(id);
    if(user.pFlags && user.pFlags.self) {
      return {_: 'inputUserSelf'};
    }

    return {
      _: 'inputUser',
      user_id: id,
      access_hash: user.access_hash || 0
    };
  }

  public updateUsersStatuses() {
    var timestampNow = tsNow(true);
    for(let i in this.users) {
      let user = this.users[i];

      if(user.status &&
        user.status._ == 'userStatusOnline' &&
        user.status.expires < timestampNow) {

        user.status = user.status.wasStatus || {_: 'userStatusOffline', was_online: user.status.expires};
        delete user.status.wasStatus;
        $rootScope.$broadcast('user_update', user.id);
      }
    }
  }

  public forceUserOnline(id: number) {
    if(this.isBot(id)) {
      return;
    }

    var user = this.getUser(id);
    if(user &&
      user.status &&
      user.status._ != 'userStatusOnline' &&
      user.status._ != 'userStatusEmpty') {
      var wasStatus;
      if(user.status._ != 'userStatusOffline') {
        delete user.status.wasStatus
        wasStatus = copy(user.status);
      }

      user.status = {
        _: 'userStatusOnline',
        expires: tsNow(true) + 60,
        wasStatus: wasStatus
      };
      user.sortStatus = this.getUserStatusForSort(user.status);
      $rootScope.$broadcast('user_update', id);
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

  public deleteContacts(userIDs: number[]) {
    var ids: any[] = [];
    userIDs.forEach((userID) => {
      ids.push(this.getUserInput(userID));
    })

    return apiManager.invokeApi('contacts.deleteContacts', {
      id: ids
    }).then(() => {
      userIDs.forEach((userID) => {
        this.onContactUpdated(userID, false);
      });
    });
  }

  public getTopPeers() {
    return apiManager.invokeApi('contacts.getTopPeers', {
      flags: 1,
      correspondents: true,
      offset: 0,
      limit: 30,
      hash: 0,
    }).then((peers: any) => {
      //console.log(peers);
      this.saveApiUsers(peers.users);
      appChatsManager.saveApiChats(peers.chats);

      return peers.categories;
    });
  }

  public searchContacts(query: string, limit = 20) {
    return apiManager.invokeApi('contacts.search', {
      q: query,
      limit
    }).then((peers: any) => {
      //console.log(peers);
      this.saveApiUsers(peers.users);
      appChatsManager.saveApiChats(peers.chats);

      return peers;
    });
  }

  public onContactUpdated(userID: number, isContact: boolean) {
    userID = parseInt('' + userID);

    if(Array.isArray(this.contactsList)) {
      var curPos = this.contactsList.indexOf(userID);
      var curIsContact = curPos != -1;

      if(isContact != curIsContact) {
        if(isContact) {
          this.contactsList.push(userID)
          SearchIndexManager.indexObject(userID, this.getUserSearchText(userID), this.contactsIndex);
        } else {
          this.contactsList.splice(curPos, 1);
        }

        $rootScope.$broadcast('contacts_update', userID);
      }
    }
  }

  public setUserStatus(userID: number, offline: boolean) {
    if(this.isBot(userID)) {
      return;
    }

    var user = this.users[userID];
    if(user) {
      var status: any = offline ? {
        _: 'userStatusOffline',
        was_online: tsNow(true)
      } : {
        _: 'userStatusOnline',
        expires: tsNow(true) + 500
      };

      user.status = status;
      user.sortStatus = this.getUserStatusForSort(user.status);
      $rootScope.$broadcast('user_update', userID);
    }
  }
}

export default new AppUsersManager();
