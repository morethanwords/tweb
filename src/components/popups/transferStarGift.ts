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
import PopupElement from '.';
import Row from '../row';
import {getCollectibleName} from '../../lib/appManagers/utils/gifts/getCollectibleName';
import {passwordPopup} from './password';
import safeWindowOpen from '../../helpers/dom/safeWindowOpen';

export default function transferStarGift(gift: MyStarGift): Promise<boolean> {
  const {saved, input} = gift;
  const raw = gift.raw as StarGift.starGiftUnique;

  const now = tsNow(true);
  if(saved.can_transfer_at !== undefined && saved.can_transfer_at > now) {
    toastNew({
      langPackKey: 'StarGiftTransferCooldown',
      langPackArguments: [wrapFormattedDuration(formatDuration(saved.can_transfer_at - now, 2))]
    });
    return Promise.resolve(false);
  }

  const deferred = deferredPromise<boolean>();
  let peerSelectorResolved = false;
  async function handleSelection(peerId: PeerId | 'fragment') {
    if(peerSelectorResolved) return;
    peerSelectorResolved = true;

    if(peerId === 'fragment') {
      try {
        await confirmationPopup({
          titleLangKey: 'StarGiftFragmentTransferTitle',
          descriptionLangKey: 'StarGiftFragmentTransferText',
          descriptionLangArgs: [getCollectibleName(raw)],
          button: {
            langKey: 'StarGiftFragmentTransferConfirm'
          }
        })

        const url = await passwordPopup({
          titleLangKey: 'PleaseEnterCurrentPassword',
          descriptionLangKey: 'StarGiftFragmentTransferPassword',
          descriptionLangArgs: [getCollectibleName(raw)],
          button: {
            langKey: 'Confirm'
          },
          callback: (password) => rootScope.managers.apiManager.invokeApi('payments.getStarGiftWithdrawalUrl', {
            stargift: input,
            password: password
          })
        })

        safeWindowOpen(url.url);

        deferred.resolve(true);
      } catch(e) {
        deferred.resolve(false);
      }
      return
    }

    const inputPeer = await rootScope.managers.appPeersManager.getInputPeerById(peerId);

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
            getCollectibleName(raw),
            await wrapPeerTitle({peerId, onlyFirstName: peerId.isUser()})
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
  }

  const popup = PopupElement.createPopup(PopupPickUser, {
    placeholder: 'StarGiftTransferTo',
    onSelect: handleSelection,
    exceptSelf: true,
    filterPeerTypeBy: ['isRegularUser', 'isBroadcast']
  });

  if(saved.can_export_at !== undefined && saved.can_export_at < now) {
    const fragmentRow = new Row({
      titleLangKey: 'StarGiftFragmentTransferItem',
      icon: 'ton',
      clickable: () => {
        handleSelection('fragment');
        popup.hide();
      }
    });
    popup.selector.list.before(fragmentRow.container);
  }

  popup.addEventListener('close', () => {
    if(!peerSelectorResolved) {
      deferred.resolve(false);
    }
  }, {once: true});

  return deferred;
}
