import type {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import deferredPromise from '../../helpers/cancellablePromise';
import rootScope from '../../lib/rootScope';
import PopupPayment from './payment';
import PopupPickUser from './pickUser';
import confirmationPopup from '../confirmationPopup';
import wrapPeerTitle from '../wrappers/peerTitle';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {StarGift} from '../../layer';
import {toastNew} from '../toast';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import formatDuration from '../../helpers/formatDuration';
import tsNow from '../../helpers/tsNow';

export default function transferStarGift(gift: MyStarGift): Promise<boolean> {
  const {saved, input} = gift;

  const now = tsNow(true);
  if(saved.can_transfer_at !== undefined && saved.can_transfer_at > now) {
    toastNew({
      langPackKey: 'StarGiftTransferCooldown',
      langPackArguments: [wrapFormattedDuration(formatDuration(saved.can_transfer_at - now, 1))]
    });
    return Promise.resolve(false);
  }

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
      try {
        await confirmationPopup({
          titleLangKey: 'StarGiftConfirmFreeTransferTitle',
          descriptionLangKey: 'StarGiftConfirmFreeTransferText',
          descriptionLangArgs: [
            `${gift.raw.title} #${numberThousandSplitter((gift.raw as StarGift.starGiftUnique).num, ',')}`,
            await wrapPeerTitle({peerId, onlyFirstName: true})
          ],
          button: {
            langKey: 'Confirm'
          }
        })
        await rootScope.managers.appGiftsManager.transferStarGift(input, peerId);
        deferred.resolve(true);
      } catch(e) {
        deferred.resolve(false);
      }
    }
  })

  return deferred;
}
