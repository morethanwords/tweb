import {StoryItem} from '../../layer';
import rootScope from '../../lib/rootScope';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '../chat/paidMessagesInterceptor';
import {showSharingPickerPopup} from '../popups/pickUser';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function handleShareStory(options: {
  story: StoryItem,
  peerId: PeerId,
  onClose?: () => void
  onSend?: (toPeerId: PeerId) => void
}) {
  showSharingPickerPopup({
    onSelect: async(chosen) => {
      const managers = bindManagersToSession(rootScope.managers);
      const {peerId, monoforumThreadId} = chosen[0];
      const storyPeerId = options.peerId;

      const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
      if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

      const inputPeer = await managers.appPeersManager.getInputPeerById(storyPeerId);
      managers.appMessagesManager.sendOther({
        peerId,
        inputMedia: {
          _: 'inputMediaStory',
          id: options.story.id,
          peer: inputPeer
        },
        confirmedPaymentResult: preparedPaymentResult,
        replyToMonoforumPeerId: monoforumThreadId
      });

      options.onSend?.(peerId);
    },
    chatRightsActions: ['send_media'],
    onCloseAfterTimeout: options.onClose
  });
}
