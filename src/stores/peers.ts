import {createStore, reconcile} from 'solid-js/store';
import {Chat, User} from '@layer';
import createMemoOrReturn, {ValueOrGetter} from '@helpers/solid/createMemoOrReturn';

type NotEmptyPeer = Exclude<Chat, Chat.chatEmpty> | User.user;

const [state, setState] = createStore<{[peerId: PeerId]: NotEmptyPeer}>({});

export function usePeers() {
  return state;
}

export function usePeer<T extends ValueOrGetter<PeerId>>(peerId: T) {
  return createMemoOrReturn(peerId, (peerId) => state[peerId]);
}

export function useChat<T extends ValueOrGetter<ChatId>>(chatId: T) {
  return createMemoOrReturn<T, Chat>(chatId, (chatId) => state[chatId?.toPeerId(true)] as Chat);
}

export function useUser<T extends ValueOrGetter<UserId>>(userId: T) {
  return createMemoOrReturn<T, User>(userId, (userId) => state[userId?.toPeerId(false)] as User);
}

export function reconcilePeer(peerId: PeerId, peer?: NotEmptyPeer) {
  setState(peerId, peer === undefined ? undefined : reconcile(peer));
}

export function reconcilePeers(peers: {[peerId: PeerId]: NotEmptyPeer}) {
  setState(/* reconcile */(peers));
}
