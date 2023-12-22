import {MessageAction, PaymentsCheckedGiftCode} from '../layer';

export default function shouldDisplayGiftCodeAsGift(action: MessageAction.messageActionGiftCode | PaymentsCheckedGiftCode) {
  if(action._ === 'payments.checkedGiftCode') {
    return !action.from_id;
  }

  return (action.amount || action.crypto_amount) !== undefined;
}
