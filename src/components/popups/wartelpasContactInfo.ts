import PopupPeer from '@components/popups/peer';
import {i18n} from '@lib/langPack';
import appImManager from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import rootScope from '@lib/rootScope';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';

export default class WartelpasContactInfo extends PopupPeer {
  constructor(peerId: PeerId) {
    const userId = peerId.toUserId();
    const user = apiManagerProxy.getUser(userId);
    const statusString = getUserStatusString(user).innerText;
    
    super('wartelpas-contact-popup', {
      peerId,
      title: '', // Will be updated async
      description: statusString,
      buttons: [
        {
          langKey: 'Call',
          iconLeft: 'phone',
          callback: () => {
            appImManager.callUser(userId, 'voice');
          }
        },
        {
          langKey: 'VideoCall',
          iconLeft: 'videocamera',
          callback: () => {
            appImManager.callUser(userId, 'video');
          }
        }
      ]
    });

    getPeerTitle({peerId, plainText: true}).then((title) => {
      this.title.innerText = title;
    });

    if (user.phone) {
      const phoneEl = document.createElement('div');
      phoneEl.className = 'popup-contact-phone';
      phoneEl.innerText = '+' + formatPhoneNumber(user.phone).formatted;
      this.description.after(phoneEl);
    }
  }

  public static show(peerId: PeerId) {
    const popup = new WartelpasContactInfo(peerId);
    popup.show();
  }
}
