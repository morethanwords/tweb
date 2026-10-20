import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import PeerTitle from '@components/peerTitle';
import showPeerPopup from '@components/popups/peer';
import {showSharingPickerPopup} from '@components/popups/pickUser';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** A contact of mine with a phone number can be sent on to another chat. */
export async function canShareContact(contactPeerId: PeerId) {
  const managers = bindManagersToSession(rootScope.managers);
  return rootScope.myId !== contactPeerId &&
    contactPeerId.isUser() &&
    (await managers.appPeersManager.isContact(contactPeerId)) &&
    !!(await managers.appUsersManager.getUser(contactPeerId.toUserId())).phone;
}

/** Sends the contact to a chat picked for it and opens that chat. */
export default function shareContact(contactPeerId: PeerId) {
  showSharingPickerPopup({
    onSelect: async(chosen) => {
      const {peerId, threadId, monoforumThreadId} = chosen[0];
      // * the contact goes from the account it was picked on, or not at all once the tab is on another
      const managers = bindManagersToSession(rootScope.managers);
      const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
      if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

      const send = () => {
        managers.appMessagesManager.sendContact({peerId, threadId, contactPeerId, confirmedPaymentResult: preparedPaymentResult, monoforumThreadId});
        hotReloadGuard.appImManager.setInnerPeer({peerId, threadId});
      };

      if(preparedPaymentResult) return void send();

      return new Promise((resolve, reject) => {
        showPeerPopup('', {
          titleLangKey: 'SendMessageTitle',
          descriptionLangKey: 'SendContactToGroupText',
          descriptionLangArgs: [new PeerTitle({peerId, dialog: true}).element],
          buttons: [{
            langKey: 'Send',
            callback: async() => {
              resolve();
              send();
            }
          }, {
            langKey: 'Cancel',
            callback: () => {
              reject();
            },
            isCancel: true
          }],
          peerId
        });
      });
    }
  });
}
