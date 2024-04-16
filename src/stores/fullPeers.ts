import {createMemo} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {ChatFull, UserFull} from '../layer';
import rootScope from '../lib/rootScope';

type PeerFull = ChatFull | UserFull;

const [state, setState] = createStore<{[peerId: PeerId]: PeerFull}>({});

const requestFullPeer = (peerId: PeerId) => {
  rootScope.managers.appProfileManager.getProfileByPeerId(peerId).then((fullPeer) => {
    setState(peerId, reconcile(fullPeer));
  });
};

rootScope.addEventListener('peer_full_update', requestFullPeer);

export function useFullPeer(peerId: () => PeerId) {
  return createMemo(() => {
    if(!peerId()) return;

    const fullPeer = state[peerId()];
    if(!fullPeer) {
      requestFullPeer(peerId());
    }

    return fullPeer;
  });
}
