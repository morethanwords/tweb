import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {getMiddleware} from '@helpers/middleware';
import deferred from '@/tests/helpers/deferred';
import pause from '@helpers/schedulers/pause';
import '@helpers/peerIdPolyfill';

/**
 * A chat closed (Escape, the back of a phone) puts the default background in its place first, and takes its list,
 * input and side media away once that is up (`publishBackground` for a chat of a background of its own). A chat opened
 * before then sets a background of its own, which finished the one in progress: the closing went on in the middle of
 * the opening - it took the new chat's list load over (`bubbles.setPeer` of no peer), cleaned its parts up and said the
 * peer changed - and the chat opened stayed half open, the same chat clicked again doing nothing.
 */

vi.mock('@hooks/useAutoDownloadSettings', () => ({default: () => ({})}));
vi.mock('@hooks/usePeerTranslation', () => ({default: (): undefined => undefined}));

let Chat: typeof import('@components/chat/chat').default;

beforeAll(async() => {
  await loadChatBubbles();
  Chat = (await import('@components/chat/chat')).default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const toggleSidebar = vi.fn();
registerHotReloadGuard({appSidebarRight: {toggleSidebar} as any});

function makeHarness() {
  const background = deferred();
  const appImManager: any = {
    isSamePeer: (chat: {peerId: PeerId}, options: {peerId: PeerId}) => (chat.peerId || 0) === (options.peerId || 0),
    dispatchEvent: vi.fn()
  };
  const harness: any = Object.assign(Object.create(Chat.prototype), {
    // * a chat of a background of its own is open
    peerId: 10,
    // * built when it was first opened
    inited: true,
    init: null,
    appImManager,
    peerIdSignal: [() => harness.peerId, vi.fn()],
    middlewareHelper: getMiddleware(),
    excludeParts: {sharedMedia: true},
    managers: {appMessagesManager: {toggleHistoryKeySubscription: vi.fn()}},
    // * the default background put in place of it: up once the next background is asked for, or it is drawn
    publishBackground: vi.fn(() => background.promise),
    cleanup: vi.fn(),
    bubbles: {setPeer: vi.fn(() => Promise.resolve({cached: true, promise: Promise.resolve()}))}
  });
  appImManager.chat = harness;

  return {harness, appImManager, background};
}

test('a chat closed takes its parts away once the default background is up', async() => {
  const {harness, appImManager, background} = makeHarness();
  harness.setPeer({peerId: 0});
  expect(harness.cleanup).not.toHaveBeenCalled();

  background.resolve();
  await pause(0);
  expect(harness.cleanup).toHaveBeenCalledWith(true);
  expect(harness.bubbles.setPeer).toHaveBeenCalledWith({peerId: 0, samePeer: false, sameSearch: false});
  expect(appImManager.dispatchEvent).toHaveBeenCalledWith('peer_changed', harness);
});

test('a chat opened before the default background is up is not closed by it', async() => {
  const {harness, appImManager, background} = makeHarness();
  harness.setPeer({peerId: 0});
  harness.setPeer({peerId: 20});
  expect(harness.bubbles.setPeer).toHaveBeenCalledTimes(1);
  expect(harness.bubbles.setPeer).toHaveBeenLastCalledWith(expect.objectContaining({peerId: 20}));

  // * the new chat's background finishes the default one in progress
  background.resolve();
  await pause(0);
  expect(harness.peerId).toBe(20);
  expect(harness.bubbles.setPeer).toHaveBeenCalledTimes(1);
  expect(harness.cleanup).not.toHaveBeenCalled();
  expect(appImManager.dispatchEvent).not.toHaveBeenCalledWith('peer_changed', harness);
});
