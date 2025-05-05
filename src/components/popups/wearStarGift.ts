import PopupElement from '.';
import PopupPremium from './premium';
import {toastNew} from '../toast';
import deferredPromise from '../../helpers/cancellablePromise';
import rootScope from '../../lib/rootScope';

export async function wearStarGift(giftId: Long): Promise<boolean> {
  if(!rootScope.premium) {
    PopupElement.createPopup(PopupPremium);
    return false
  }

  const deferred = deferredPromise<boolean>();

  rootScope.managers.appUsersManager.updateEmojiStatus({
    _: 'inputEmojiStatusCollectible',
    collectible_id: giftId
  }).then(() => {
    toastNew({langPackKey: 'SetAsEmojiStatusInfo'});
    deferred.resolve(true);
  }).catch(() => {
    toastNew({langPackKey: 'Error.AnError'});
    deferred.resolve(false);
  });
}
