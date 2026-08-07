import deferredPromise from '@helpers/cancellablePromise';
import AppSelectPeers from '@components/appSelectPeers';
import {createRoot} from 'solid-js';

export function createSelectorForTab(options: ConstructorParameters<typeof AppSelectPeers>[0]) {
  const deferred = deferredPromise<void>();
  let selector: AppSelectPeers;
  createRoot((dispose) => {
    options.middleware.onClean(() => {
      dispose();
      deferred.resolve();
    });
    selector = new AppSelectPeers({
      ...options,
      multiSelect: false,
      headerSearch: true,
      placeholder: 'SearchPlaceholder',
      meAsSaved: false,
      onFirstRender: () => {
        deferred.resolve();
      }
    });
  });

  return {selector, loadPromise: deferred};
}

export function createSelectorForParticipants(options: ConstructorParameters<typeof AppSelectPeers>[0]) {
  return createSelectorForTab({...options, peerType: ['channelParticipants']});
}
