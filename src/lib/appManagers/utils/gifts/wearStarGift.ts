import PopupElement from '../../../../components/popups';
import PopupPremium from '../../../../components/popups/premium';
import {toastNew} from '../../../../components/toast';
import deferredPromise from '../../../../helpers/cancellablePromise';
import rootScope from '../../../rootScope';
import {MyStarGift} from '../../appGiftsManager';

export async function wearStarGift(giftId: Long): Promise<boolean> {
  if(!rootScope.premium) {
    PopupElement.createPopup(PopupPremium);
    return false
  }

  const deferred = deferredPromise<boolean>()

  rootScope.managers.appUsersManager.updateEmojiStatus({
    _: 'inputEmojiStatusCollectible',
    collectible_id: giftId
  }).then(() => {
    toastNew({langPackKey: 'SetAsEmojiStatusInfo'});
    deferred.resolve(true)
  }).catch(() => {
    toastNew({langPackKey: 'Error.AnError'});
    deferred.resolve(false)
  });
}
