import type {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import deferredPromise from '../../helpers/cancellablePromise';
import rootScope from '../../lib/rootScope';
import PopupPayment from './payment';
import PopupPickUser from './pickUser';

export default function transferStarGift(gift: MyStarGift): Promise<boolean> {
  const {saved, input} = gift;

  const deferred = deferredPromise<boolean>();
  PopupPickUser.createPicker2({
    filterPeerTypeBy: ['isRegularUser'],
    placeholder: 'StarGiftTransferTo',
    exceptSelf: true
  }).then(async(peerId) => {
    const inputPeer = await rootScope.managers.appUsersManager.getUserInputPeer(peerId);

    if(Number(saved.transfer_stars) !== 0) {
      const popup = await PopupPayment.create({
        inputInvoice: {
          _: 'inputInvoiceStarGiftTransfer',
          stargift: input,
          to_id: inputPeer
        }
      });

      popup.addEventListener('finish', (result) => {
        if(result === 'paid') {
          deferred.resolve(true);
        } else {
          deferred.resolve(false);
        }
      });
    } else {
      await rootScope.managers.appGiftsManager.transferStarGift(input, peerId);
      deferred.resolve(true);
    }
  })

  return deferred;
}
