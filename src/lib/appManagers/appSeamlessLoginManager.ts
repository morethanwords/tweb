/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {UrlAuthResult} from '../../layer';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

export default class AppSeamlessLoginManager extends AppManager {
  public requestUrlAuth(url: string, peerId?: PeerId, mid?: number, buttonId?: number) {
    return this.apiManager.invokeApi('messages.requestUrlAuth', {
      button_id: buttonId,
      msg_id: mid ? getServerMessageId(mid) : undefined,
      peer: peerId ? this.appPeersManager.getInputPeerById(peerId) : undefined,
      url
    }).then((urlAuthResult) => {
      if(urlAuthResult._ === 'urlAuthResultRequest') {
        this.appUsersManager.saveApiUser(urlAuthResult.bot);
      }

      return urlAuthResult;
    });
  }

  public acceptUrlAuth(url: string, peerId?: PeerId, mid?: number, buttonId?: number, writeAllowed?: boolean) {
    return this.apiManager.invokeApi('messages.acceptUrlAuth', {
      button_id: buttonId,
      msg_id: mid ? getServerMessageId(mid) : undefined,
      peer: peerId ? this.appPeersManager.getInputPeerById(peerId) : undefined,
      url,
      write_allowed: writeAllowed
    }).then((urlAuthResult) => {
      return urlAuthResult as Exclude<UrlAuthResult, UrlAuthResult.urlAuthResultRequest>;
    });
  }

  public getWebAuthorizations() {
    return this.apiManager.invokeApi('account.getWebAuthorizations').then((webAuthorizations) => {
      this.appUsersManager.saveApiUsers(webAuthorizations.users);
      return webAuthorizations.authorizations;
    });
  }

  public resetWebAuthorization(hash: Long) {
    return this.apiManager.invokeApi('account.resetWebAuthorization', {
      hash
    });
  }

  public resetWebAuthorizations() {
    return this.apiManager.invokeApi('account.resetWebAuthorizations');
  }
}
