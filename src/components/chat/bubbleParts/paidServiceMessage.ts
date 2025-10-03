import assumeType from '../../../helpers/assumeType';
import {Message} from '../../../layer';
import {i18n} from '../../../lib/langPack';

import wrapPeerTitle from '../../wrappers/peerTitle';


type Args = {
  isAnyGroup: boolean;
  bubble: HTMLElement;
  message: Message.message | Message.messageService;
  our: boolean;
  peerId: PeerId;
  groupedMessages?: Message.message[];
};

export default function addPaidServiceMessage({isAnyGroup, bubble, message, our, peerId, groupedMessages}: Args) {
  assumeType<Message.message>(message);

  const paidStars = Number(message.paid_message_stars)
  const repayRequest = message.repayRequest;

  if(paidStars && !isAnyGroup) return (async() => {
    bubble.classList.add('has-fake-service', 'is-forced-rounded');
    bubble.dataset.isPaid = '1';

    const paidServiceMessage = document.createElement('div');
    paidServiceMessage.classList.add('service-msg');

    const messageCount = groupedMessages?.length || 1;
    const totalStars = paidStars * messageCount;

    const i18nElement = repayRequest ?
      i18n('PaidMessages.FailedToPayForMessage', [messageCount, i18n('Stars', [totalStars])]) :
      our ?
        i18n('PaidMessages.YouPaidToSendMessages', [messageCount, i18n('Stars', [totalStars])]) :
        i18n('PaidMessages.YouReceivedStarsFrom', [i18n('Stars', [totalStars]), await wrapPeerTitle({peerId: peerId, onlyFirstName: true})])

    i18nElement.classList.add('service-msg-i18n-element');

    paidServiceMessage.append(i18nElement);

    bubble.prepend(paidServiceMessage);
  })();
}
