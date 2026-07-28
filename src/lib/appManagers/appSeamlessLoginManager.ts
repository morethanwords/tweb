import {UrlAuthResult} from '@layer';
import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';

export default class AppSeamlessLoginManager extends AppManager {
  public requestUrlAuth(url: string, peerId?: PeerId, mid?: number, buttonId?: number) {
    if(
      peerId &&
      mid &&
      (
        this.appMessagesManager.isEphemeralMessageId(mid) ||
        this.appMessagesManager.isEphemeralMessage(this.appMessagesManager.getMessageByPeer(peerId, mid))
      )
    ) {
      return Promise.resolve({_: 'urlAuthResultDefault'} as const);
    }

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
    if(
      peerId &&
      mid &&
      (
        this.appMessagesManager.isEphemeralMessageId(mid) ||
        this.appMessagesManager.isEphemeralMessage(this.appMessagesManager.getMessageByPeer(peerId, mid))
      )
    ) {
      return Promise.resolve({_: 'urlAuthResultDefault'} as const);
    }

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
