import { SearchIndexManager, safeReplaceObject, isObject, tsNow, copy, $rootScope } from "../utils";
import { MTProto } from "../mtproto/mtproto";
import { RichTextProcessor } from "../richtextprocessor";

export class AppUsersManager {
  public users: any = {};
  public usernames: any = {};
  public userAccess: {[x: number]: string} = {};
  public cachedPhotoLocations: any = {};
  public contactsIndex = SearchIndexManager.createIndex();
  public contactsFillPromise: any;
  public contactsList: any;
  public myID: number;

  constructor() {
    MTProto.apiManager.getUserID().then((id) => {
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
                user.status.expires -= MTProto.serverTimeManager.serverTimeOffset;
              }

              if(user.status.was_online) {
                user.status.was_online -= MTProto.serverTimeManager.serverTimeOffset;
              }
            }

            user.sortStatus = this.getUserStatusForSort(user.status);
            $rootScope.$broadcast('user_update', userID);
          } else console.warn('No user by id:', userID);
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
          } else console.warn('No user by id:', userID);
          break
  
        case 'updateContactLink':
          this.onContactUpdated(update.user_id, update.my_link._ == 'contactLinkContact');
          break;
      }
    });
  }

  /* public fillContacts () {
    if(this.contactsFillPromise) {
      return this.contactsFillPromise;
    }

    return this.contactsFillPromise = MTProto.apiManager.invokeApi('contacts.getContacts', {
      hash: 0
    }).then((result: any) => {
      var userID, searchText;
      var i;
      this.contactsList = [];
      this.saveApiUsers(result.users);

      for(var i = 0; i < result.contacts.length; i++) {
        userID = result.contacts[i].user_id
        this.contactsList.push(userID);
        //SearchIndexManager.indexObject(userID, getUserSearchText(userID), contactsIndex); WARNING
      }

      return this.contactsList;
    })
  } */

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

  /* function getContacts (query) {
      return fillContacts().then(function (contactsList) {
        if (angular.isString(query) && query.length) {
          var results = SearchIndexManager.search(query, contactsIndex)
          var filteredContactsList = []

          for (var i = 0; i < contactsList.length; i++) {
            if (results[contactsList[i]]) {
              filteredContactsList.push(contactsList[i])
            }
          }
          contactsList = filteredContactsList
        }

        contactsList.sort(function (userID1, userID2) {
          var sortName1 = (users[userID1] || {}.sortName) || ''
          var sortName2 = (users[userID2] || {}.sortName) || ''
          if (sortName1 == sortName2) {
            return 0
          }
          return sortName1 > sortName2 ? 1 : -1
        })

        return contactsList
      })
  } */

  public resolveUsername(username: string) {
    return this.usernames[username] || 0;
  }

  public saveApiUsers(apiUsers: any[]) {
    // @ts-ignore
    apiUsers.forEach(this.saveApiUser.bind(this));
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
      //apiUser.rPhone = $filter('phoneNumber')(apiUser.phone); // warning
    }

    apiUser.num = (Math.abs(userID) % 8) + 1;

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

    apiUser.sortName = apiUser.pFlags.deleted ? '' : SearchIndexManager.cleanSearchText(apiUser.first_name + ' ' + (apiUser.last_name || ''));

    var nameWords = apiUser.sortName.split(' ');
    var firstWord = nameWords.shift();
    var lastWord = nameWords.pop();
    apiUser.initials = firstWord.charAt(0) + (lastWord ? lastWord.charAt(0) : firstWord.charAt(1));

    if(apiUser.status) {
      if(apiUser.status.expires) {
        apiUser.status.expires -= MTProto.serverTimeManager.serverTimeOffset
      }

      if(apiUser.status.was_online) {
        apiUser.status.was_online -= MTProto.serverTimeManager.serverTimeOffset
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

  public getUserStatusForSort(status: any) {
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

  public getUser(id: any) {
    if(isObject(id)) {
      return id;
    }
    return this.users[id] || {id: id, deleted: true, num: 1, access_hash: this.userAccess[id]};
  }

  public getSelf() {
    return this.getUser(this.myID);
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
    if(user.pFlags.self) {
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

  public wrapForFull(id: number) {
    var user = this.getUser(id);

    return user;
  }

  /* public openUser(userID: number, override) {
    var scope = $rootScope.$new()
    scope.userID = userID
    scope.override = override || {}

    var modalInstance = $modal.open({
      templateUrl: templateUrl('user_modal'),
      controller: 'UserModalController',
      scope: scope,
      windowClass: 'user_modal_window mobile_modal',
      backdrop: 'single'
    })
  } */

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

    return MTProto.apiManager.invokeApi('contacts.deleteContacts', {
      id: ids
    }).then(() => {
      userIDs.forEach((userID) => {
        this.onContactUpdated(userID, false);
      });
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

  /* function openImportContact () {
    return $modal.open({
      templateUrl: templateUrl('import_contact_modal'),
      controller: 'ImportContactModalController',
      windowClass: 'md_simple_modal_window mobile_modal'
    }).result.then(function (foundUserID) {
      if (!foundUserID) {
        return $q.reject()
      }
      return foundUserID
    })
  } */

  public setUserStatus(userID: number, offline: boolean) {
    if(this.isBot(userID)) {
      return;
    }

    var user = this.users[userID];
    if(user) {
      var status = offline ? {
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
