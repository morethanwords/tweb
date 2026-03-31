import AppSelectPeers from '@components/appSelectPeers';
import PopupElement from '@components/popups';
import showLimitPopup from '@components/popups/limit';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import deferredPromise from '@helpers/cancellablePromise';
import formatDuration from '@helpers/formatDuration';
import {getMiddleware} from '@helpers/middleware';
import tsNow from '@helpers/tsNow';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';

/**
 * expect chat migration
 */
export async function handleChannelsTooMuch(getPromise: () => Promise<any>) {
  try {
    return await getPromise();
  } catch(err) {
    if((err as ApiError).type === 'CHANNELS_TOO_MUCH') {
      await showChannelsTooMuchPopup();
      return handleChannelsTooMuch(getPromise);
    }

    throw err;
  }
}

export async function showChannelsTooMuchPopup() {
  const inactiveChannels = await rootScope.managers.appChatsManager.getInactiveChannels();
  const deferred = deferredPromise<void>();
  showLimitPopup('channels', async(popup) => {
    const middlewareHelper = getMiddleware();
    popup.addEventListener('closeAfterTimeout', () => {
      deferred.reject();
      middlewareHelper.destroy();
    });
    const datesMap = new Map<PeerId, number>();
    const selector = new AppSelectPeers({
      middleware: middlewareHelper.get(),
      // @ts-ignore
      appendTo: popup.body,
      onChange: (value) => {
        if(!value) {
          mainButton.element.replaceChildren(...mainButtonChildren);
          mainButton.callback = mainButtonCallback;
        } else if(value) {
          mainButton.element.replaceChildren(i18n('LeaveCommunities', [value]));
          mainButton.callback = async() => {
            const peerIds = selector.getSelected();
            for(const peerId of peerIds) {
              await rootScope.managers.appChatsManager.leave(peerId.toChatId());
            }
            deferred.resolve();
          };
        }
      },
      onFirstRender: () => {
        popup.show();
        selector.checkForTriggers(); // ! due to zero height before mounting
        selector.scrollable.onAdditionalScroll();
      },
      multiSelect: true,
      noSearch: true,
      sectionNameLangPackKey: 'LeastActiveCommunities',
      avatarSize: 'abitbigger',
      managers: rootScope.managers,
      peerType: [],
      getSubtitleForElement: async(peerId) => {
        const date = datesMap.get(peerId);
        const duration = tsNow(true) - date;
        return i18n('InactiveChannel', [
          await rootScope.managers.appPeersManager.isBroadcast(peerId) ?
            i18n('InactiveChannel.Broadcast') :
            i18n('InactiveChannel.Group'),
          wrapFormattedDuration(formatDuration(duration, 1))
        ]);
      }
    });

    selector.scrollable.attachBorderListeners();

    const peerIds = inactiveChannels.map(({id, date}) => {
      const peerId = id.toPeerId(true);
      datesMap.set(peerId, date);
      return peerId;
    });

    selector.renderResultsFunc(peerIds);

    // @ts-ignore
    const mainButton = popup.buttons[0];
    const mainButtonChildren = [...mainButton.element.children];
    const mainButtonCallback = mainButton.callback;
  });

  return deferred;
}
