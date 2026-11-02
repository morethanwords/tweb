import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {simulateClickEvent} from '@helpers/dom/clickEvent';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  toastNew: vi.fn(),
  tab: undefined as any
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: (promise: Promise<void>) => mocks.collected = promise})
}));
vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn(), getAppConfig: vi.fn(), getCacheContext: vi.fn()}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: vi.fn(), removeEventListener: vi.fn()}}));
vi.mock('@lib/langPack', () => ({
  default: {format: (key: string) => key},
  i18n: (key: string) => {
    const span = document.createElement('span');
    span.textContent = key;
    return span;
  },
  join: (elements: any[]) => elements
}));

let EditChatInviteLink: typeof import('@components/sidebarRight/tabs/editChatInviteLink')['default'];
// * the tab's graph wants the browser APIs jsdom lacks on import
beforeAll(async() => {
  stubBrowserGlobals();
  EditChatInviteLink = (await import('@components/sidebarRight/tabs/editChatInviteLink')).default;
}, 60_000);

let dispose: VoidFunction;
let exportChatInvite: ReturnType<typeof vi.fn>;

beforeEach(async() => {
  exportChatInvite = vi.fn();
  mocks.tab = {
    payload: {chatId: 100 as ChatId},
    managers: {
      appChatsManager: {isBroadcast: async() => false},
      apiManager: {getAppConfig: async() => ({})},
      appChatInvitesManager: {exportChatInvite}
    },
    content: document.createElement('div'),
    middlewareHelper: getMiddleware(),
    listenerSetter: new ListenerSetter(),
    eventListener: {addEventListener: vi.fn(), dispatchEvent: vi.fn()},
    close: vi.fn()
  };
  document.body.append(mocks.tab.content);
  dispose = render(() => <EditChatInviteLink />, mocks.tab.content);
  await mocks.collected;
});

afterEach(() => {
  dispose();
  mocks.tab.middlewareHelper.destroy();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const confirmButton = () => mocks.tab.content.querySelector('.btn-corner') as HTMLButtonElement;

// * a link the server refused left the save button spinning for good, with no word of what happened
test('a link the server refuses brings the button back and says so', async() => {
  exportChatInvite.mockRejectedValue({type: 'USAGE_LIMIT_INVALID'});
  simulateClickEvent(confirmButton());
  expect(confirmButton().disabled).toBe(true);

  await vi.waitFor(() => expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'}));
  expect(confirmButton().disabled).toBe(false);
  expect(confirmButton().querySelector('.preloader')).toBeNull();
  expect(mocks.tab.close).not.toHaveBeenCalled();
  expect(mocks.tab.eventListener.dispatchEvent).not.toHaveBeenCalled();
});

test('a link the server takes closes the screen with it', async() => {
  const invite = {_: 'chatInviteExported', link: 'https://t.me/+x'};
  exportChatInvite.mockResolvedValue(invite);
  simulateClickEvent(confirmButton());

  await vi.waitFor(() => expect(mocks.tab.close).toHaveBeenCalled());
  expect(mocks.tab.eventListener.dispatchEvent).toHaveBeenCalledWith('finish', invite);
  expect(mocks.toastNew).not.toHaveBeenCalled();
});

// * an account switch drops the answer of the session it left: nothing to say about it over the next account
test('a save its session left is not shown as an error', async() => {
  exportChatInvite.mockRejectedValue({type: 'MIDDLEWARE'});
  simulateClickEvent(confirmButton());

  await vi.waitFor(() => expect(confirmButton().disabled).toBe(false));
  expect(mocks.toastNew).not.toHaveBeenCalled();
  expect(mocks.tab.close).not.toHaveBeenCalled();
});
