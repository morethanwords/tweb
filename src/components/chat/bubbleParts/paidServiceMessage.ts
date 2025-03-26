import wrapPeerTitle from '../../wrappers/peerTitle';
import {i18n} from '../../../lib/langPack';
import {Message} from '../../../layer';

type Args = {
  bubble: HTMLElement;
  message: Message.message | Message.messageService;
  our: boolean;
  peerId: PeerId;
};

export default async function addPaidServiceMessage({bubble, message, our, peerId}: Args) {
  const paidStars = Number((message as Message.message).paid_message_stars)

  if(paidStars) {
    bubble.classList.add('has-fake-service', 'is-forced-rounded');
    bubble.dataset.isPaid = '1';

    const paidServiceMessage = document.createElement('div');
    paidServiceMessage.classList.add('service-msg');

    paidServiceMessage.append(
      our ?
        i18n('PaidMessages.YouPaidToSendMessages', [1, i18n('Stars', [paidStars])]) :
        i18n('PaidMessages.YouReceivedStarsFrom', [i18n('Stars', [paidStars]), await wrapPeerTitle({peerId: peerId, onlyFirstName: true})])
    );

    bubble.prepend(paidServiceMessage);
  }
}
