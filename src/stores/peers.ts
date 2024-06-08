// import {Accessor, createMemo} from 'solid-js';
import {Accessor, createMemo} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {Chat, User} from '../layer';

type Peer = Chat | User;

const [state, setState] = createStore<{[peerId: PeerId]: Peer}>({});

type ValueOrGetter<T> = T | Accessor<T>;

function createMemoOrReturn<T extends ValueOrGetter<any>, R, V = T extends Accessor<infer V> ? V : T>(valueOrGetter: T, callback: (value: V) => R): T extends Accessor<any> ? Accessor<R> : R {
  // @ts-ignore
  return typeof(valueOrGetter) === 'function' ? createMemo(() => callback((valueOrGetter as Accessor<T>)())) : callback(valueOrGetter);
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

export function reconcilePeer(peerId: PeerId, peer: Peer) {
  setState(peerId, reconcile(peer));
}

export function reconcilePeers(peers: {[peerId: PeerId]: Peer}) {
  setState(/* reconcile */(peers));
}
