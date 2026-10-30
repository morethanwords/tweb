import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSignal, type JSX} from 'solid-js';
import {createStore} from 'solid-js/store';
import {render} from 'solid-js/web';

const mocks = vi.hoisted(() => ({
  state: {} as any,
  visible: (): boolean => true,
  getTopPeers: vi.fn(async() => [] as {id: number}[]),
  getAvatar: vi.fn(),
  renderPeer: vi.fn(),
  destroyBatch: vi.fn()
}));

vi.mock('@stores/appState', () => ({useAppState: () => [mocks.state]}));
vi.mock('@lib/langPack', () => ({i18n: (key: string) => key}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({useHotReloadGuard: () => ({
  appSidebarLeft: {},
  rootScope: {managers: {appUsersManager: {getTopPeers: mocks.getTopPeers}}}
})}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({hotReloadGuard: {appDialogsManager: {setListClickListener: vi.fn()}}}));
vi.mock('@helpers/solid/createMiddleware', () => ({default: () => ({get: () => () => true, destroy: mocks.destroyBatch})}));
vi.mock('@components/topPeersList', () => ({renderTopPeerItem: ({peerId, container}: {peerId: number, container: HTMLElement}) => {
  mocks.renderPeer(peerId);
  mocks.getAvatar(peerId);
  const item = document.createElement('div');
  item.dataset.fixturePeer = String(peerId);
  container.append(item);
}}));
vi.mock('@components/chatTips/tipCard', () => ({
  default: (props: {buttons: {text: JSX.Element}[], children: JSX.Element}) => <div>
    <div>{props.buttons.map((button) => <span>{button.text}</span>)}</div>
    {props.children}
  </div>,
  useTipReady: () => () => {},
  useTipVisibility: () => () => mocks.visible()
}));

import ChatsTipCard from '@components/chatTips/chatsCard';

let dispose: () => void;
let container: HTMLDivElement;
function mount(initialVisible = true) {
  const [state, setState] = createStore({recentSearch: [] as PeerId[], recentlyClosedChats: [1, 2] as PeerId[]});
  const [visible, setVisible] = createSignal(initialVisible);
  mocks.state = state;
  mocks.visible = visible;
  container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => <ChatsTipCard />, container);
  const peers = () => [...container.querySelectorAll<HTMLElement>('[data-fixture-peer]')];
  return {setState, setVisible, peers};
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  dispose?.();
  container?.remove();
  document.documentElement.removeAttribute('dir');
});

describe('the covered chat-tip peer grid', () => {
  it.each(['ltr', 'rtl'])('keeps its nodes and avatars while hidden, then renders the current list once (%s)', async(direction) => {
    document.documentElement.dir = direction;
    const {setState, setVisible, peers} = mount();
    await vi.waitFor(() => expect(peers()).toHaveLength(2));
    const original = peers();
    const rendered = mocks.renderPeer.mock.calls.length;
    const avatars = mocks.getAvatar.mock.calls.length;
    const destroyed = mocks.destroyBatch.mock.calls.length;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(container, {childList: true, subtree: true, attributes: true, characterData: true});
    try {
      setVisible(false);
      setState('recentlyClosedChats', [3, 1, 2] as PeerId[]);
      setState('recentlyClosedChats', [4, 3, 1, 2] as PeerId[]);
      setState('recentSearch', [9] as PeerId[]);
      await Promise.resolve();
      expect(peers()).toEqual(original);
      expect(mutations).toHaveLength(0);
      expect(mocks.renderPeer).toHaveBeenCalledTimes(rendered);
      expect(mocks.getAvatar).toHaveBeenCalledTimes(avatars);
      expect(mocks.destroyBatch).toHaveBeenCalledTimes(destroyed);

      // Showing reads the newest snapshot synchronously; there is no stale-card frame or timer.
      setVisible(true);
      expect(peers().map((item) => item.dataset.fixturePeer)).toEqual(['9']);
      expect(mocks.renderPeer).toHaveBeenCalledTimes(rendered + 1);
      expect(mocks.getAvatar).toHaveBeenCalledTimes(avatars + 1);
      expect(mocks.destroyBatch).toHaveBeenCalledTimes(destroyed + 1);
    } finally {
      observer.disconnect();
    }
  });

  it('does not build peers when mounted behind a conversation and catches up on the first reveal', async() => {
    const {setState, setVisible, peers} = mount(false);
    await vi.waitFor(() => expect(mocks.getTopPeers).toHaveBeenCalledOnce());
    setState('recentlyClosedChats', [5, 4, 3] as PeerId[]);
    await Promise.resolve();
    expect(peers()).toHaveLength(0);
    expect(mocks.renderPeer).not.toHaveBeenCalled();
    expect(mocks.getAvatar).not.toHaveBeenCalled();
    setVisible(true);
    expect(peers().map((item) => item.dataset.fixturePeer)).toEqual(['5', '4', '3']);
    expect(mocks.renderPeer).toHaveBeenCalledTimes(3);
  });

  it('asks for the popular peers again when Suggest Frequent Contacts flips', async() => {
    mocks.getTopPeers.mockResolvedValueOnce([{id: 7}]).mockResolvedValueOnce([]);
    const {setState, peers} = mount();
    await vi.waitFor(() => expect(peers().map((item) => item.dataset.fixturePeer)).toEqual(['7']));

    // * the mirrored cache of the people list, turned off
    (setState as any)('topPeersCache', {correspondents: {peers: [], cachedTime: 1, disabled: true}});
    await vi.waitFor(() => expect(peers().map((item) => item.dataset.fixturePeer)).toEqual(['1', '2']));
    expect(mocks.getTopPeers).toHaveBeenCalledTimes(2);
  });
});
