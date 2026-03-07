import {StoryItem} from '../../layer';
import rootScope from '../../lib/rootScope';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '../chat/paidMessagesInterceptor';
import PopupPickUser from '../popups/pickUser';

export function handleShareStory(options: {
  story: StoryItem,
  peerId: PeerId,
  onClose?: () => void
  onSend?: (toPeerId: PeerId) => void
}) {
  const popup = PopupPickUser.createSharingPicker({
    onSelect: async(peerId, _, monoforumThreadId) => {
      const storyPeerId = options.peerId;

      const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
      if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

      const inputPeer = await rootScope.managers.appPeersManager.getInputPeerById(storyPeerId);
      rootScope.managers.appMessagesManager.sendOther({
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
    chatRightsActions: ['send_media']
  });

  if(options.onClose) popup.addEventListener('closeAfterTimeout', options.onClose);
}
