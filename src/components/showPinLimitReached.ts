import showLimitPopup from '@components/popups/limit';
import {toastNew} from '@components/toast';
import {REAL_FOLDERS} from '@appManagers/constants';
import rootScope from '@lib/rootScope';

/**
 * Tells the user a pin did not happen because the list it was for is full - every kind of list says
 * so in its own way. Any other error is not about the limit and is left alone.
 *
 * `filterId` is the list the pin was for, in `dialogsStorage`'s own filter id space; `isSaved` and
 * `isTopic` say the pinned dialog is a Saved Messages sublist or a forum topic instead of a chat.
 */
export default function showPinLimitReached(err: ApiError, {filterId, isSaved, isTopic}: {
  filterId?: number,
  isSaved?: boolean,
  isTopic?: boolean
}) {
  if(err?.type !== 'PINNED_DIALOGS_TOO_MUCH' && err?.type !== 'PINNED_TOO_MUCH') {
    return;
  }

  if(isSaved) {
    showLimitPopup('savedPin');
  } else if(isTopic) {
    rootScope.managers.apiManager.getLimit('topicPin').then((limit) => {
      toastNew({langPackKey: 'LimitReachedPinnedTopics', langPackArguments: [limit]});
    });
  } else if(!REAL_FOLDERS.has(filterId)) {
    toastNew({langPackKey: 'PinFolderLimitReached'});
  } else {
    showLimitPopup('pin');
  }
}
