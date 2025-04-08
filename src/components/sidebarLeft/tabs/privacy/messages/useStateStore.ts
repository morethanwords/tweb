import {Accessor, createComputed, createSignal, createEffect, createMemo} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';

import throttle from '../../../../../helpers/schedulers/throttle';
import deepEqual from '../../../../../helpers/object/deepEqual';
import {GlobalPrivacySettings} from '../../../../../layer';

import {MessagesPrivacyOption, MessagesTabStateStore} from './config';


type UseStateStoreArgs = {
  isReady: Accessor<boolean>;
  globalPrivacy: Accessor<GlobalPrivacySettings>;
  currentOption: Accessor<MessagesPrivacyOption>;
  currentAllowedUsers: Accessor<PeerId[]>;
  currentAllowedChats: Accessor<PeerId[]>;
};

export type ChosenPeersByType = {
  chats: (string | number)[];
  users: PeerId[];
};

const useStateStore = ({
  isReady,
  globalPrivacy,
  currentOption, currentAllowedChats, currentAllowedUsers
}: UseStateStoreArgs) => {
  let initialState: MessagesTabStateStore = {};
  const [store, setStore] = createStore<MessagesTabStateStore>({});

  createComputed(() => {
    if(!isReady()) return;

    initialState = {
      option: currentOption(),
      stars: Number(globalPrivacy().noncontact_peers_paid_stars) || undefined,
      chosenPeers: [...currentAllowedUsers(), ...currentAllowedChats()]
    };

    setStore(reconcile(structuredClone(initialState)));
  });


  const [hasChanges, setHasChanges] = createSignal(false);
  const throttledSetHasChanges = throttle(setHasChanges, 200, true);

  // The header is jerking if updating the hasChanges too quickly WTF
  createEffect(() => {
    const ignoreKeys: (keyof MessagesTabStateStore)[] = !!!isPaid() ? ['chosenPeers', 'stars'] : [];

    throttledSetHasChanges(!deepEqual(store, initialState, ignoreKeys));
  });


  const isPaid = createMemo(() => store.option === MessagesPrivacyOption.Paid);

  const chosenPeersByType = (): ChosenPeersByType => ({
    chats: store.chosenPeers.filter(peer => peer.isAnyChat()).map(peer => peer.toChatId()),
    users: store.chosenPeers.filter(peer => peer.isUser())
  });


  return [
    store,
    setStore,
    {hasChanges, isPaid, chosenPeersByType}
  ] as const;
};


export default useStateStore;
