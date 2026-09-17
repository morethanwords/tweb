import rootScope from '@lib/rootScope';
import showPeerPopup from '@components/popups/peer';

export default function showSendNowPopup(peerId: PeerId, mids: number[], onConfirm?: () => void) {
  showPeerPopup('popup-delete-chat', {
    title: `Send Message${mids.length > 1 ? 's' : ''} Now`,
    description: mids.length > 1 ? 'Send ' + mids.length + ' messages now?' : 'Send message now?',
    buttons: [{
      langKey: 'Send',
      callback: () => {
        onConfirm && onConfirm();
        rootScope.managers.appMessagesManager.sendScheduledMessages(peerId, mids);
      }
    }]
  });
}
