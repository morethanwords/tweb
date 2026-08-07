import type {Chat, ChatFull} from '@layer';
import '@helpers/peerIdPolyfill';
import type {
  CommunityDialog,
  CommunityPeerLinkRequestsState
} from '@appManagers/appCommunitiesManager';
import {
  reconcileCommunityDialog,
  reconcileCommunityDialogs,
  reconcileCommunityFull,
  reconcileCommunityFulls,
  reconcileCommunityPeerLinkRequests,
  reconcileCommunityPeerLinkRequestsState,
  collectCollapsedCommunityDialogsKey,
  useCollapsedCommunityDialogsKey,
  useCommunity,
  useCommunityDialog,
  useCommunityFull,
  useJoinedCommunities,
  useCommunityPendingRequestsCount,
  useCommunityPeerLinkRequests
} from '@stores/communities';
import {setAppStateSilent} from '@stores/appState';
import {reconcilePeer, reconcilePeers} from '@stores/peers';

const COMMUNITY_ID = 101 as ChatId;
const OTHER_COMMUNITY_ID = 102 as ChatId;

function makeCommunity(
  id: ChatId,
  title: string
): Chat.community {
  return {
    _: 'community',
    id,
    title,
    pFlags: {}
  } as Chat.community;
}

function makeCommunityFull(id: ChatId, about: string, peerIds: UserId[] = []) {
  return {
    _: 'communityFull',
    id,
    about,
    chat_photo: {
      _: 'photoEmpty',
      id: 0
    },
    linked_peers: peerIds.map((userId) => ({
      _: 'communityPeer',
      pFlags: {},
      peer: {_: 'peerUser', user_id: userId}
    }))
  } as ChatFull.communityFull;
}

function makeCommunityDialog(
  id: ChatId,
  unreadCount: number,
  peerIds: PeerId[] = []
) {
  const dialogs = peerIds.map((peerId) => ({
    _: 'dialog',
    peerId
  })) as CommunityDialog['dialogs'];
  return {
    _: 'communityDialog',
    communityId: id,
    pFlags: {},
    notifySettings: {_: 'peerNotifySettings'},
    dialogs,
    lastDialogs: dialogs.slice(),
    sortDate: 0,
    unreadCount,
    unreadMessagesCount: unreadCount,
    unreadUnmutedCount: unreadCount,
    unreadMarked: false
  } as CommunityDialog;
}

function makePeerLinkRequests(
  totalCount: number,
  peerIds: UserId[] = []
): CommunityPeerLinkRequestsState {
  return {
    loaded: true,
    totalCount,
    requests: peerIds.map((userId) => ({
      _: 'communityPeerRequest',
      pFlags: {},
      peer: {_: 'peerUser', user_id: userId},
      requested_by: 1,
      date: 1
    }))
  };
}

describe('communities Solid stores', () => {
  beforeEach(() => {
    reconcilePeers({});
    reconcileCommunityFulls({});
    reconcileCommunityDialogs({});
    reconcileCommunityPeerLinkRequests({});
    setAppStateSilent('joinedCommunityIds', null);
  });

  test('reconciles keyed communities and removes deleted values', () => {
    const community = useCommunity(() => COMMUNITY_ID);

    reconcilePeer(COMMUNITY_ID.toPeerId(true), makeCommunity(COMMUNITY_ID, 'First'));
    const firstValue = community();
    expect(firstValue.title).toBe('First');

    reconcilePeer(COMMUNITY_ID.toPeerId(true), makeCommunity(COMMUNITY_ID, 'Updated'));
    expect(community()).toBe(firstValue);
    expect(community().title).toBe('Updated');

    reconcilePeer(COMMUNITY_ID.toPeerId(true));
    expect(community()).toBeUndefined();
  });

  test('reconciles full Community snapshots and drops stale keys', () => {
    const full = useCommunityFull(() => COMMUNITY_ID);

    reconcileCommunityFulls({
      [COMMUNITY_ID]: makeCommunityFull(COMMUNITY_ID, 'First'),
      [OTHER_COMMUNITY_ID]: makeCommunityFull(OTHER_COMMUNITY_ID, 'Other')
    });
    expect(full().about).toBe('First');

    reconcileCommunityFulls({
      [OTHER_COMMUNITY_ID]: makeCommunityFull(OTHER_COMMUNITY_ID, 'Updated')
    });
    expect(full()).toBeUndefined();

    reconcileCommunityFull(COMMUNITY_ID, makeCommunityFull(COMMUNITY_ID, 'Restored'));
    expect(full().about).toBe('Restored');
  });

  test('reactively reconciles the removed-users count to zero', () => {
    const full = useCommunityFull(() => COMMUNITY_ID);
    const initial = makeCommunityFull(COMMUNITY_ID, 'About');
    initial.kicked_count = 1;
    reconcileCommunityFull(COMMUNITY_ID, initial);
    const stored = full();

    const updated = makeCommunityFull(COMMUNITY_ID, 'About');
    updated.kicked_count = 0;
    reconcileCommunityFull(COMMUNITY_ID, updated);

    expect(full()).toBe(stored);
    expect(full().kicked_count).toBe(0);
  });

  test('derives joined Communities from the mirrored app state order', () => {
    const joined = useJoinedCommunities();
    reconcilePeers({
      [COMMUNITY_ID.toPeerId(true)]: makeCommunity(COMMUNITY_ID, 'First'),
      [OTHER_COMMUNITY_ID.toPeerId(true)]: makeCommunity(OTHER_COMMUNITY_ID, 'Other')
    });

    setAppStateSilent('joinedCommunityIds', [
      OTHER_COMMUNITY_ID,
      COMMUNITY_ID
    ]);

    expect(joined()?.map((community) => community.id)).toEqual([
      OTHER_COMMUNITY_ID,
      COMMUNITY_ID
    ]);
  });

  test('reconciles and deletes computed Community dialogs', () => {
    const dialog = useCommunityDialog(() => COMMUNITY_ID);

    reconcileCommunityDialog(COMMUNITY_ID, makeCommunityDialog(COMMUNITY_ID, 3));
    const firstValue = dialog();
    expect(firstValue.unreadCount).toBe(3);

    reconcileCommunityDialog(COMMUNITY_ID, makeCommunityDialog(COMMUNITY_ID, 1));
    expect(dialog()).toBe(firstValue);
    expect(dialog().unreadCount).toBe(1);

    reconcileCommunityDialog(COMMUNITY_ID);
    expect(dialog()).toBeUndefined();
  });

  test('derives the collapsed Community dialog projection key', () => {
    const key = useCollapsedCommunityDialogsKey();
    setAppStateSilent('joinedCommunityIds', [COMMUNITY_ID]);

    reconcilePeer(
      COMMUNITY_ID.toPeerId(true),
      makeCommunity(COMMUNITY_ID, 'Community')
    );
    expect(key()).toBe('');

    const collapsedCommunity = makeCommunity(COMMUNITY_ID, 'Community');
    collapsedCommunity.pFlags.collapsed_in_dialogs = true;
    reconcilePeer(COMMUNITY_ID.toPeerId(true), collapsedCommunity);
    expect(key()).toBe(`${COMMUNITY_ID}:`);

    const peerId = 201 as PeerId;
    reconcileCommunityDialog(
      COMMUNITY_ID,
      makeCommunityDialog(COMMUNITY_ID, 0, [peerId])
    );
    expect(key()).toBe(`${COMMUNITY_ID}:${peerId}`);

    const leftCommunity = makeCommunity(COMMUNITY_ID, 'Community');
    leftCommunity.pFlags.collapsed_in_dialogs = true;
    leftCommunity.pFlags.left = true;
    reconcilePeer(COMMUNITY_ID.toPeerId(true), leftCommunity);
    expect(key()).toBe('');
  });

  // The key used to be derived with Object.values(peers). That enumerates the whole peer
  // store and, because it is a reactive proxy, subscribes the memo to every peer — so an
  // unrelated user coming online re-ran the entire walk (~1s of main thread on a large
  // account). Assert it now touches ONLY the Community ids and never enumerates.
  test('derives the projection key without enumerating the peer store', () => {
    const collapsed = makeCommunity(COMMUNITY_ID, 'Community');
    collapsed.pFlags.collapsed_in_dialogs = true;

    const backing: Record<string, any> = {
      [COMMUNITY_ID.toPeerId(true)]: collapsed
    };
    for(let i = 0; i < 500; ++i) {
      backing[900 + i] = {_: 'user', id: 900 + i, pFlags: {}};
    }

    const readKeys: string[] = [];
    let enumerated = 0;
    const peers = new Proxy(backing, {
      get(target, prop) {
        if(typeof prop === 'string') readKeys.push(prop);
        return target[prop as string];
      },
      ownKeys(target) {
        ++enumerated;
        return Reflect.ownKeys(target);
      }
    });

    const key = collectCollapsedCommunityDialogsKey(
      peers as any,
      {[COMMUNITY_ID]: makeCommunityDialog(COMMUNITY_ID, 0, [301 as PeerId])} as any,
      [COMMUNITY_ID]
    );

    expect(key).toBe(`${COMMUNITY_ID}:301`);
    expect(enumerated).toBe(0);
    expect(readKeys).toEqual(['' + COMMUNITY_ID.toPeerId(true)]);
  });

  test('still reacts to a Community collapsing and to its dialog list', () => {
    const key = useCollapsedCommunityDialogsKey();
    setAppStateSilent('joinedCommunityIds', [OTHER_COMMUNITY_ID]);

    const community = makeCommunity(OTHER_COMMUNITY_ID, 'Other');
    reconcilePeer(OTHER_COMMUNITY_ID.toPeerId(true), community);
    expect(key()).toBe('');

    const collapsed = makeCommunity(OTHER_COMMUNITY_ID, 'Other');
    collapsed.pFlags.collapsed_in_dialogs = true;
    reconcilePeer(OTHER_COMMUNITY_ID.toPeerId(true), collapsed);
    expect(key()).toBe(`${OTHER_COMMUNITY_ID}:`);

    reconcileCommunityDialog(
      OTHER_COMMUNITY_ID,
      makeCommunityDialog(OTHER_COMMUNITY_ID, 0, [301 as PeerId])
    );
    expect(key()).toBe(`${OTHER_COMMUNITY_ID}:301`);
  });

  // A Community known only through the mirrored dialogs map (not yet in
  // joinedCommunityIds) still has to show up in the key.
  test('picks up a Community that only exists in the dialogs store', () => {
    const key = useCollapsedCommunityDialogsKey();
    setAppStateSilent('joinedCommunityIds', null);

    const collapsed = makeCommunity(COMMUNITY_ID, 'Community');
    collapsed.pFlags.collapsed_in_dialogs = true;
    reconcilePeer(COMMUNITY_ID.toPeerId(true), collapsed);
    reconcileCommunityDialog(
      COMMUNITY_ID,
      makeCommunityDialog(COMMUNITY_ID, 0, [401 as PeerId])
    );

    expect(key()).toBe(`${COMMUNITY_ID}:401`);
  });

  test('reconciles peer-link request snapshots and keyed updates', () => {
    const requests = useCommunityPeerLinkRequests(() => COMMUNITY_ID);

    reconcileCommunityPeerLinkRequests({
      [COMMUNITY_ID]: makePeerLinkRequests(2)
    });
    const firstValue = requests();
    expect(firstValue.totalCount).toBe(2);

    reconcileCommunityPeerLinkRequestsState(COMMUNITY_ID, makePeerLinkRequests(1));
    expect(requests()).toBe(firstValue);
    expect(requests().totalCount).toBe(1);

    reconcileCommunityPeerLinkRequests({});
    expect(requests()).toBeUndefined();
  });

  test('uses the live peer-link request count over the full snapshot', () => {
    const count = useCommunityPendingRequestsCount(() => COMMUNITY_ID);
    const full = makeCommunityFull(COMMUNITY_ID, 'About');
    full.peer_link_requests_pending = 2;

    reconcileCommunityFull(COMMUNITY_ID, full);
    expect(count()).toBe(2);

    reconcileCommunityPeerLinkRequestsState(
      COMMUNITY_ID,
      makePeerLinkRequests(3)
    );
    expect(count()).toBe(3);

    const updatedFull = makeCommunityFull(COMMUNITY_ID, 'About');
    updatedFull.peer_link_requests_pending = 4;
    reconcileCommunityFull(COMMUNITY_ID, updatedFull);
    expect(count()).toBe(3);

    reconcileCommunityPeerLinkRequestsState(COMMUNITY_ID);
    expect(count()).toBe(4);
  });

  test('does not reuse nested array items for a different peer after reorder', () => {
    const firstUserId = 201 as UserId;
    const secondUserId = 202 as UserId;
    const firstPeerId = firstUserId as PeerId;
    const secondPeerId = secondUserId as PeerId;
    const dialog = useCommunityDialog(() => COMMUNITY_ID);
    const full = useCommunityFull(() => COMMUNITY_ID);
    const requests = useCommunityPeerLinkRequests(() => COMMUNITY_ID);

    reconcileCommunityDialog(
      COMMUNITY_ID,
      makeCommunityDialog(COMMUNITY_ID, 0, [firstPeerId, secondPeerId])
    );
    reconcileCommunityFull(
      COMMUNITY_ID,
      makeCommunityFull(COMMUNITY_ID, 'About', [firstUserId, secondUserId])
    );
    reconcileCommunityPeerLinkRequestsState(
      COMMUNITY_ID,
      makePeerLinkRequests(2, [firstUserId, secondUserId])
    );
    const oldFirstDialog = dialog().dialogs[0];
    const oldSecondDialog = dialog().dialogs[1];
    const oldFirstLinkedPeer = full().linked_peers[0];
    const oldSecondLinkedPeer = full().linked_peers[1];
    const oldFirstRequest = requests().requests[0];
    const oldSecondRequest = requests().requests[1];

    reconcileCommunityDialog(
      COMMUNITY_ID,
      makeCommunityDialog(COMMUNITY_ID, 0, [secondPeerId, firstPeerId])
    );
    reconcileCommunityFull(
      COMMUNITY_ID,
      makeCommunityFull(COMMUNITY_ID, 'About', [secondUserId, firstUserId])
    );
    reconcileCommunityPeerLinkRequestsState(
      COMMUNITY_ID,
      makePeerLinkRequests(2, [secondUserId, firstUserId])
    );

    expect(dialog().dialogs.map((item) => item.peerId)).toEqual([
      secondPeerId,
      firstPeerId
    ]);
    expect(dialog().dialogs[0]).not.toBe(oldFirstDialog);
    expect(dialog().dialogs[1]).not.toBe(oldSecondDialog);
    expect(full().linked_peers[0]).not.toBe(oldFirstLinkedPeer);
    expect(full().linked_peers[1]).not.toBe(oldSecondLinkedPeer);
    expect(requests().requests[0]).not.toBe(oldFirstRequest);
    expect(requests().requests[1]).not.toBe(oldSecondRequest);
  });
});
