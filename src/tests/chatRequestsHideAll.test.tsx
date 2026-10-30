import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  confirmationPopup: vi.fn(),
  toastNew: vi.fn(),
  loaderOptions: undefined as any,
  loader: undefined as any,
  selectorOptions: undefined as any,
  selector: undefined as any,
  tab: undefined as any
}));

vi.mock('@components/sidebarRight/tabs/participantsSelector', () => ({
  createSelectorForTab: (options: any) => {
    mocks.selectorOptions = options;
    return {selector: mocks.selector, loadPromise: Promise.resolve()};
  }
}));
vi.mock('@components/sidebarRight/tabs/chatInviteLinkShared', () => ({
  getImportersLoader: (options: any) => {
    mocks.loaderOptions = options;
    // * 3 is loaded, its row not drawn yet
    return mocks.loader = {importersMap: new Map([[1, {}], [3, {}]]), deleteImporter: vi.fn(), load: vi.fn(), reset: vi.fn()};
  }
}));
vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: (promise: Promise<void>) => mocks.collected = promise})
}));
vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({appImManager: {setInnerPeer: vi.fn()}})
}));
vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@components/button', () => ({default: () => document.createElement('button')}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn()}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: vi.fn(), removeEventListener: vi.fn()}}));
vi.mock('@lib/langPack', () => ({
  default: {format: (key: string) => key},
  i18n: (key: string) => {
    const span = document.createElement('span');
    span.textContent = key;
    return span;
  }
}));

let ChatRequests: typeof import('@components/sidebarRight/tabs/chatRequests')['default'];
// * the rows' graph wants the browser APIs jsdom lacks on import
beforeAll(async() => {
  stubBrowserGlobals();
  ChatRequests = (await import('@components/sidebarRight/tabs/chatRequests')).default;
}, 60_000);

const CHAT_ID = 100 as ChatId;
const REQUESTERS = [(1 as UserId).toPeerId(false), (2 as UserId).toPeerId(false)];

let dispose: VoidFunction;
let hideAllChatJoinRequests: ReturnType<typeof vi.fn>;

beforeEach(async() => {
  const container = document.createElement('div');
  mocks.selector = {
    scrollable: {container, append: (...elements: Node[]) => container.append(...elements)},
    deletePeerId: vi.fn(),
    reload: vi.fn()
  };
  hideAllChatJoinRequests = vi.fn().mockResolvedValue(undefined);
  mocks.tab = {
    payload: CHAT_ID,
    managers: {appChatsManager: {isBroadcast: async() => false, hideAllChatJoinRequests}},
    container: document.createElement('div'),
    title: document.createElement('div'),
    content: document.createElement('div'),
    middlewareHelper: getMiddleware(),
    listenerSetter: new ListenerSetter(),
    eventListener: {addEventListener: vi.fn(), dispatchEvent: vi.fn()}
  };
  mocks.confirmationPopup.mockResolvedValue(undefined);
  dispose = render(() => <ChatRequests />, document.body);
  document.body.append(container);
  await mocks.collected;
  for(const peerId of REQUESTERS) {
    mocks.selectorOptions.processElementAfter(peerId, {container: document.createElement('div')});
  }
});

afterEach(() => {
  dispose();
  mocks.tab.middlewareHelper.destroy();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const findRow = (key: string) => [...document.querySelectorAll<HTMLElement>('.row')]
.find((row) => row.textContent.includes(key));

test('answers the whole queue only when there is more than one request', () => {
  mocks.loaderOptions.onCount(1);
  expect(findRow('JoinRequestAcceptAll')).toBeUndefined();

  mocks.loaderOptions.onCount(2);
  expect(findRow('JoinRequestAcceptAll')).toBeDefined();
  expect(findRow('JoinRequestDismissAll')).toBeDefined();
  // * the tab is not narrowed to one link, so the whole queue goes
  expect(mocks.loaderOptions.link).toBeUndefined();
});

test('accepts all after a confirmation, then empties the list', async() => {
  mocks.loaderOptions.onCount(2);
  findRow('JoinRequestAcceptAll').click();
  await vi.waitFor(() => expect(hideAllChatJoinRequests).toHaveBeenCalledWith(CHAT_ID, true));

  expect(mocks.confirmationPopup).toHaveBeenCalledWith(expect.objectContaining({
    titleLangKey: 'JoinRequestAcceptAllTitle',
    descriptionLangKey: 'JoinRequestAcceptAllDescription'
  }));
  await vi.waitFor(() => expect(mocks.loader.reset).toHaveBeenCalledOnce());
  // * the row still being drawn goes too
  expect(mocks.selector.deletePeerId.mock.calls.map(([peerId]: [PeerId]) => peerId).sort()).toEqual([...REQUESTERS, 3]);
  expect(findRow('JoinRequestAcceptAll')).toBeUndefined();
  // * then the queue is read anew from its start, after the loader has forgotten the old one
  expect(mocks.selector.reload).toHaveBeenCalledOnce();
  expect(mocks.loader.reset.mock.invocationCallOrder[0]).toBeLessThan(mocks.selector.reload.mock.invocationCallOrder[0]);
});

test('the selector takes a row out of the list still shown while a search is on its way too', async() => {
  const {default: AppSelectPeers} = await vi.importActual<typeof import('@components/appSelectPeers')>('@components/appSelectPeers');
  const row = (peerId: PeerId) => {
    const element = document.createElement('div');
    element.dataset.peerId = '' + peerId;
    return element;
  };
  const list = document.createElement('div'), oldList = document.createElement('div');
  list.append(row(REQUESTERS[0]));
  oldList.append(row(REQUESTERS[0]), row(REQUESTERS[1]));
  const selector = {
    list,
    oldList,
    pendingLists: new Set(),
    renderedPeerIds: new Set(REQUESTERS),
    channelParticipantsSkipped: new Set(),
    promise: Promise.resolve()
  };

  for(const peerId of REQUESTERS) {
    AppSelectPeers.prototype.deletePeerId.call(selector, peerId);
  }

  expect(list.childElementCount).toBe(0);
  expect(oldList.childElementCount).toBe(0);
  expect(selector.renderedPeerIds.size).toBe(0);
}, 60_000);

test('the loader drops a page asked for before the whole queue was answered, and a count behind one answer', async() => {
  const {getImportersLoader} = await vi.importActual<typeof import('@components/sidebarRight/tabs/chatInviteLinkShared')>('@components/sidebarRight/tabs/chatInviteLinkShared');
  const pages: ((page: any) => void)[] = [];
  const getChatInviteImporters = vi.fn((_options: object) => new Promise((resolve) => pages.push(resolve)));
  const onCount = vi.fn();
  const loader = getImportersLoader({
    chatId: CHAT_ID,
    managers: {appChatInvitesManager: {getChatInviteImporters}} as any,
    requested: true,
    onCount
  });
  const importer = (userId: number) => ({_: 'chatInviteImporter', user_id: userId, date: userId});
  const middleware = () => true;

  // * on its way while every request is answered
  const stale = loader.load('', middleware);
  loader.reset();
  pages[0]({count: 2, importers: [importer(1), importer(2)]});
  expect(await stale).toEqual({result: [], isEnd: false});
  expect(onCount).not.toHaveBeenCalled();
  expect(loader.importersMap.size).toBe(0);

  // * asked for anew, from the start
  const fresh = loader.load('', middleware);
  expect(getChatInviteImporters).toHaveBeenLastCalledWith(expect.objectContaining({offsetDate: undefined, offsetUserId: undefined}));
  pages[1]({count: 1, importers: [importer(3)]});
  expect((await fresh).result).toEqual([(3 as UserId).toPeerId(false)]);
  expect(onCount).toHaveBeenCalledExactlyOnceWith(1);

  // * one answered while the next page is on its way: the page's rows hold, its count does not
  const next = loader.load('', middleware);
  loader.deleteImporter((3 as UserId).toPeerId(false));
  pages[2]({count: 2, importers: [importer(4)]});
  expect((await next).result).toEqual([(4 as UserId).toPeerId(false)]);
  expect(onCount).toHaveBeenCalledOnce();
}, 60_000);

test('a cancelled confirmation sends nothing; a refusal keeps the list', async() => {
  mocks.loaderOptions.onCount(2);
  mocks.confirmationPopup.mockRejectedValueOnce(undefined);
  findRow('JoinRequestDismissAll').click();
  await Promise.resolve();
  expect(hideAllChatJoinRequests).not.toHaveBeenCalled();

  hideAllChatJoinRequests.mockRejectedValueOnce({type: 'CHAT_ADMIN_REQUIRED'});
  findRow('JoinRequestDismissAll').click();
  await vi.waitFor(() => expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'}));
  // * once: the cancelled one sent nothing
  expect(hideAllChatJoinRequests).toHaveBeenCalledExactlyOnceWith(CHAT_ID, false);
  expect(mocks.selector.deletePeerId).not.toHaveBeenCalled();
  expect(mocks.selector.reload).not.toHaveBeenCalled();
  expect(findRow('JoinRequestDismissAll')).toBeDefined();
});
