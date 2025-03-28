import {i18n} from '../../../lib/langPack';
import {Message} from '../../../layer';

import wrapPeerTitle from '../../wrappers/peerTitle';


type Args = {
  isAnyGroup: boolean;
  bubble: HTMLElement;
  message: Message.message | Message.messageService;
  our: boolean;
  peerId: PeerId;
  groupedMessages?: Message.message[];
};

export default async function addPaidServiceMessage({isAnyGroup, bubble, message, our, peerId, groupedMessages}: Args) {
  const paidStars = Number((message as Message.message).paid_message_stars)

  if(paidStars && !isAnyGroup) {
    bubble.classList.add('has-fake-service', 'is-forced-rounded');
    bubble.dataset.isPaid = '1';

    const paidServiceMessage = document.createElement('div');
    paidServiceMessage.classList.add('service-msg');

    const messageCount = groupedMessages?.length || 1;
    const totalStars = paidStars * messageCount;

    paidServiceMessage.append(
      our ?
        i18n('PaidMessages.YouPaidToSendMessages', [messageCount, i18n('Stars', [totalStars])]) :
        i18n('PaidMessages.YouReceivedStarsFrom', [i18n('Stars', [totalStars]), await wrapPeerTitle({peerId: peerId, onlyFirstName: true})])
    );

    bubble.prepend(paidServiceMessage);
  }
}
