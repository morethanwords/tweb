import {createStore, reconcile} from 'solid-js/store';
import {ChatFull, UserFull} from '../layer';
import rootScope from '../lib/rootScope';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import {onCleanup} from 'solid-js';

type PeerFull = ChatFull | UserFull;

const [state, setState] = createStore<{[peerId: PeerId]: PeerFull}>({});

const requestFullPeer = (peerId: PeerId, overwrite?: boolean) => {
  rootScope.managers.appProfileManager.getProfileByPeerId(
    peerId,
    overwrite
  ).then((fullPeer) => {
    setState(peerId, reconcile(fullPeer));
  });
};

rootScope.addEventListener('peer_full_update', requestFullPeer);

function _useFullPeer(peerId: PeerId) {
  const fullPeer = () => state[peerId];
  if(!fullPeer()) {
    requestFullPeer(peerId);
  }

  const interval = setInterval(() => {
    requestFullPeer(peerId, true);
  }, 60e3);

  onCleanup(() => {
    clearInterval(interval);
  });

  return fullPeer;
}

export function useFullPeer(peerId: () => PeerId) {
  return useDynamicCachedValue(
    () => _useFullPeer.name + '-' + peerId(),
    () => {
      if(!peerId()) return;
      return _useFullPeer(peerId());
    }
  )();
}
