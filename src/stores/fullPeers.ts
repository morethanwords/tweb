import {createStore, reconcile} from 'solid-js/store';
import {ChatFull, UserFull} from '@layer';
import rootScope from '@lib/rootScope';
import useDynamicCachedValue from '@helpers/solid/useDynamicCachedValue';
import {onCleanup} from 'solid-js';
import {PEER_FULL_TTL} from '@appManagers/constants';

type PeerFull = ChatFull | UserFull;

const [state, setState] = createStore<{[peerId: PeerId]: PeerFull}>({});
const expirations = new Map<PeerId, number>();

const requestFullPeer = (peerId: PeerId, overwrite?: boolean) => {
  rootScope.managers.appProfileManager.getProfileByPeerId(
    peerId,
    overwrite
  ).then((fullPeer) => {
    if(overwrite !== false) {
      expirations.set(peerId, Date.now() + PEER_FULL_TTL);
    }

    setState(peerId, reconcile(fullPeer));
  });
};

rootScope.addEventListener('peer_full_update', requestFullPeer);

function _useFullPeer(peerId: PeerId) {
  const fullPeer = () => state[peerId];

  const expiration = expirations.get(peerId);
  if(!expiration || !fullPeer()) {
    requestFullPeer(peerId, false);
  }

  const delay = (expiration || 0) - Date.now();
  const timeout = delay > 0 ? setTimeout(() => {
    requestFullPeer(peerId, true);
  }, delay) : 0;

  const interval = setInterval(() => {
    requestFullPeer(peerId, true);
  }, PEER_FULL_TTL);

  onCleanup(() => {
    clearInterval(interval);
    clearTimeout(timeout);
  });

  return fullPeer;
}

export function useFullPeer(peerId: PeerId) {
  return useDynamicCachedValue(
    () => _useFullPeer.name + '-' + peerId,
    () => _useFullPeer(peerId)
  )();
}
