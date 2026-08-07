import {createMemo} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import type {Chat, ChatFull} from '@layer';
import type {
  CommunityDialog,
  CommunityPeerLinkRequestsState
} from '@appManagers/appCommunitiesManager';
import createMemoOrReturn, {ValueOrGetter} from '@helpers/solid/createMemoOrReturn';
import {appState} from '@stores/appState';
import {usePeers} from '@stores/peers';

type CommunityFullState = {[communityId in ChatId]: ChatFull.communityFull};
type CommunityDialogsState = {[communityId in ChatId]: CommunityDialog};
type CommunityPeerLinkRequestsStore = {
  [communityId in ChatId]: CommunityPeerLinkRequestsState
};

const [communityFull, setCommunityFull] = createStore<CommunityFullState>({});
const [communityDialogs, setCommunityDialogs] = createStore<CommunityDialogsState>({});
const [
  communityPeerLinkRequests,
  setCommunityPeerLinkRequests
] = createStore<CommunityPeerLinkRequestsStore>({});

export function useCommunityDialogs() {
  return communityDialogs;
}

export function useCollapsedCommunityDialogsKey() {
  const peers = usePeers();
  return createMemo(() => {
    const communityIds = Object.values(peers)
    .filter((community) => {
      return community._ === 'community' &&
        !community.pFlags.left &&
        community.pFlags.collapsed_in_dialogs;
    })
    .map((community) => community.id)
    .sort((a, b) => +a - +b);

    return communityIds.map((communityId) => {
      const peerIds = communityDialogs[communityId]?.dialogs
      .map(({peerId}) => peerId)
      .sort((a, b) => a - b) || [];
      return `${communityId}:${peerIds.join(',')}`;
    }).join(';');
  });
}

export function useCommunityFulls() {
  return communityFull;
}

export function useJoinedCommunities() {
  const peers = usePeers();
  return createMemo(() => {
    const communityIds = appState.joinedCommunityIds;
    if(!communityIds) {
      return null;
    }

    const result = communityIds
    .map((communityId) => peers[communityId.toPeerId(true)])
    .filter((community): community is Chat.community | Chat.communityForbidden => {
      return community?._ === 'community' || community?._ === 'communityForbidden';
    });
    return result.length === communityIds.length ? result : null;
  });
}

export function useCommunity<T extends ValueOrGetter<ChatId>>(communityId: T) {
  const peers = usePeers();
  return createMemoOrReturn<T, Chat.community | Chat.communityForbidden>(
    communityId,
    (communityId) => {
      const community = peers[communityId?.toPeerId(true)];
      return community?._ === 'community' || community?._ === 'communityForbidden' ?
        community :
        undefined;
    }
  );
}

export function useCommunityFull<T extends ValueOrGetter<ChatId>>(communityId: T) {
  return createMemoOrReturn<T, ChatFull.communityFull>(
    communityId,
    (communityId) => communityFull[communityId]
  );
}

export function useCommunityDialog<T extends ValueOrGetter<ChatId>>(communityId: T) {
  return createMemoOrReturn<T, CommunityDialog>(
    communityId,
    (communityId) => communityDialogs[communityId]
  );
}

export function useCommunityPeerLinkRequests<T extends ValueOrGetter<ChatId>>(communityId: T) {
  return createMemoOrReturn<T, CommunityPeerLinkRequestsState>(
    communityId,
    (communityId) => communityPeerLinkRequests[communityId]
  );
}

export function useCommunityPendingRequestsCount<T extends ValueOrGetter<ChatId>>(
  communityId: T
) {
  return createMemoOrReturn<T, number>(communityId, (communityId) => {
    return communityPeerLinkRequests[communityId]?.totalCount ??
      communityFull[communityId]?.peer_link_requests_pending ??
      0;
  });
}

export function reconcileCommunityFull(
  communityId: ChatId,
  full?: ChatFull.communityFull
) {
  setCommunityFull(
    communityId,
    full === undefined ? undefined : reconcile(full, {key: null})
  );
}

export function reconcileCommunityFulls(value: CommunityFullState) {
  setCommunityFull(reconcile(value, {key: null}));
}

export function reconcileCommunityDialog(
  communityId: ChatId,
  dialog?: CommunityDialog
) {
  setCommunityDialogs(
    communityId,
    dialog === undefined ? undefined : reconcile(dialog, {key: null})
  );
}

export function reconcileCommunityDialogs(value: CommunityDialogsState) {
  setCommunityDialogs(reconcile(value, {key: null}));
}

export function reconcileCommunityPeerLinkRequestsState(
  communityId: ChatId,
  state?: CommunityPeerLinkRequestsState
) {
  setCommunityPeerLinkRequests(
    communityId,
    state === undefined ? undefined : reconcile(state, {key: null})
  );
}

export function reconcileCommunityPeerLinkRequests(
  value: CommunityPeerLinkRequestsStore
) {
  setCommunityPeerLinkRequests(reconcile(value, {key: null}));
}
