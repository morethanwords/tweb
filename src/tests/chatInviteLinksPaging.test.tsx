import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import AppChatInvitesManager from '@appManagers/appChatInvitesManager';
import {ExportedChatInvite, MessagesExportedChatInvites} from '@layer';
import type {ChatInvite} from '@components/sidebarRight/tabs/chatInviteLinkShared';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  tab: undefined as any
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: (promise: Promise<void>) => mocks.collected = promise})
}));
vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({hotReloadGuard: {}}));
vi.mock('@lib/lottie/lottieLoader', () => ({
  default: {loadAnimationFromURLManually: vi.fn(), waitForFirstFrame: async() => {}}
}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}, myId: 0, addEventListener: vi.fn(), removeEventListener: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getChat: vi.fn()}}));
vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => {
    const span = document.createElement('span');
    span.textContent = key;
    return span;
  },
  joinElementsWith: (elements: Node[]) => elements
}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({default: (text: string) => text}));
vi.mock('@lib/richTextProcessor/wrapPlainText', () => ({default: (text: string) => text}));
vi.mock('@helpers/dom/createContextMenu', () => ({default: () => {}}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/toastError', () => ({default: vi.fn()}));
vi.mock('@components/button', () => ({default: () => document.createElement('button')}));
vi.mock('@components/stars/starsAmount', () => ({StarsAmount: () => document.createElement('span')}));
vi.mock('@components/wrappers/peerTitle', () => ({default: async() => document.createElement('span')}));
vi.mock('@components/wrappers/wrapDuration', () => ({wrapLeftDuration: () => document.createElement('span')}));
vi.mock('@components/sidebarLeft/tabs/inviteLink', () => ({
  InviteLink: class {
    public container = document.createElement('div');
    public buttonText = document.createElement('span');
    public url: string;
    public onButtonClick: () => void;
    constructor(public options: any) {}
    public setUrl(url: string) {
      this.url = url;
    }
  }
}));
// * a row of a link: its title is the link
vi.mock('@components/usernameRow', () => ({
  default: (props: any) => {
    const row = document.createElement('div');
    row.classList.add('is-link');
    const media = document.createElement('div'), title = document.createElement('div'), subtitle = document.createElement('div');
    title.classList.add('link-title');
    title.append(props.title);
    props.mediaRef?.(media);
    props.titleRef?.(title);
    props.subtitleRef?.(subtitle);
    row.append(media, title, subtitle);
    return row;
  }
}));

const CHAT_ID = 100 as ChatId;
const PAGE = 50;

// * newer links first, as the server lists them
const invite = (n: number, revoked?: boolean): ChatInvite => ({
  _: 'chatInviteExported',
  pFlags: revoked ? {revoked: true} : {},
  link: 'https://t.me/+' + n,
  admin_id: 1,
  date: 100000 - n
});
const range = (from: number, to: number, revoked?: boolean) => {
  const invites: ChatInvite[] = [];
  for(let n = from; n <= to; ++n) {
    invites.push(invite(n, revoked));
  }

  return invites;
};
const links = (invites: ChatInvite[]) => invites.map((invite) => invite.link);
const page = (invites: ExportedChatInvite[], count = invites.length): MessagesExportedChatInvites => ({
  _: 'messages.exportedChatInvites',
  count,
  invites,
  users: []
});

/** the manager's pages, each given when the test says so */
const pagesOnDemand = () => {
  const answers: ((page: MessagesExportedChatInvites) => void)[] = [];
  const getExportedChatInvites = vi.fn((_options: object) => new Promise<MessagesExportedChatInvites>((resolve) => answers.push(resolve)));
  return {getExportedChatInvites, answer: (result: MessagesExportedChatInvites) => answers.shift()(result)};
};

describe('appChatInvitesManager.getExportedChatInvites', () => {
  const makeManager = () => {
    const manager = new AppChatInvitesManager() as any;
    const invokeApi = vi.fn(async(_method: string, _params: object) => page([]));
    Object.assign(manager, {
      apiManager: {invokeApi},
      appChatsManager: {getInputPeer: () => ({_: 'inputPeerChannel', channel_id: CHAT_ID, access_hash: '1'})},
      appUsersManager: {getUserInput: (userId: UserId) => ({_: 'inputUser', user_id: userId, access_hash: '1'}), saveApiUsers: vi.fn()}
    });
    return {manager: manager as AppChatInvitesManager, invokeApi};
  };

  test('the first page goes without an offset, as before', async() => {
    const {manager, invokeApi} = makeManager();
    await manager.getExportedChatInvites({chatId: CHAT_ID, revoked: true});
    const params = invokeApi.mock.calls[0][1] as any;
    expect(params).toMatchObject({admin_id: {_: 'inputUserSelf'}, limit: 50, revoked: true});
    // * neither of the two fields under the offset's flag
    expect(params.offset_date).toBeUndefined();
    expect(params.offset_link).toBeUndefined();
  });

  test('a next page goes on from the date and the link given, both of them', async() => {
    const {manager, invokeApi} = makeManager();
    await manager.getExportedChatInvites({chatId: CHAT_ID, adminId: 5 as UserId, limit: 20, offsetDate: 123, offsetLink: 'https://t.me/+1'});
    expect(invokeApi).toHaveBeenCalledWith('messages.getExportedChatInvites', expect.objectContaining({
      admin_id: {_: 'inputUser', user_id: 5, access_hash: '1'},
      limit: 20,
      offset_date: 123,
      offset_link: 'https://t.me/+1'
    }));
  });
});

describe('getChatInvitesLoader', () => {
  const makeLoader = async() => {
    const {getChatInvitesLoader} = await import('@components/sidebarRight/tabs/chatInviteLinkShared');
    const {getExportedChatInvites, answer} = pagesOnDemand();
    const loader = getChatInvitesLoader({
      chatId: CHAT_ID,
      managers: {appChatInvitesManager: {getExportedChatInvites}} as any
    });
    return {loader, getExportedChatInvites, answer};
  };

  test('asks for each page of a list from the last link of the one before, to a short page', async() => {
    const {loader, getExportedChatInvites, answer} = await makeLoader();
    loader.takePage(false, page(range(1, PAGE), 120));
    loader.takePage(true, page(range(1001, 1000 + PAGE, true), 70));
    expect(loader.isEnd(false)).toBe(false);
    expect(loader.isEnd(true)).toBe(false);

    let promise = loader.loadMore(false);
    expect(getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      revoked: false,
      limit: PAGE,
      offsetDate: invite(PAGE).date,
      offsetLink: invite(PAGE).link
    }));
    answer(page(range(PAGE + 1, PAGE * 2), 120));
    expect(links(await promise)).toEqual(links(range(PAGE + 1, PAGE * 2)));

    promise = loader.loadMore(false);
    expect(getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      revoked: false,
      offsetLink: invite(PAGE * 2).link
    }));
    answer(page(range(PAGE * 2 + 1, 120), 120));
    expect(links(await promise)).toEqual(links(range(PAGE * 2 + 1, 120)));
    expect(loader.isEnd(false)).toBe(true);
    expect(await loader.loadMore(false)).toBeUndefined();

    // * the revoked links go on from their own last one
    promise = loader.loadMore(true);
    expect(getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      revoked: true,
      offsetDate: invite(1000 + PAGE).date,
      offsetLink: invite(1000 + PAGE).link
    }));
    answer(page(range(1000 + PAGE + 1, 1070, true), 70));
    expect(await promise).toEqual(range(1000 + PAGE + 1, 1070, true));
    expect(loader.isEnd(true)).toBe(true);
    expect(getExportedChatInvites).toHaveBeenCalledTimes(3);
  });

  test('a link already shown - the main one, one created or revoked meanwhile - is not given again', async() => {
    const {loader, answer} = await makeLoader();
    loader.remember(invite(0).link);
    expect(links(loader.takePage(false, page([invite(0), ...range(1, PAGE - 1)])))).toEqual(links(range(1, PAGE - 1)));
    loader.takePage(true, page(range(1001, 1000 + PAGE, true)));

    // * created here: newer than the first page, not in any after it
    loader.remember(invite(-1).link);
    // * revoked here: the server now lists it among the revoked ones
    loader.remember(invite(3).link);

    // * both lists on their way at once
    const active = loader.loadMore(false), revoked = loader.loadMore(true);
    answer(page([invite(-1), invite(0), invite(PAGE), invite(PAGE + 1)]));
    answer(page([invite(3, true), invite(1000 + PAGE + 1, true)]));
    expect(links(await active)).toEqual(links([invite(PAGE), invite(PAGE + 1)]));
    expect(links(await revoked)).toEqual([invite(1000 + PAGE + 1).link]);
  });

  test('a page of revoked links on its way when every revoked link is deleted is dropped, and none is asked for after', async() => {
    const {loader, getExportedChatInvites, answer} = await makeLoader();
    loader.takePage(false, page(range(1, 3)));
    loader.takePage(true, page(range(1001, 1000 + PAGE, true)));

    const promise = loader.loadMore(true);
    loader.endRevoked();
    answer(page(range(1000 + PAGE + 1, 1000 + PAGE * 2, true)));
    expect(await promise).toBeUndefined();
    expect(loader.isEnd(true)).toBe(true);
    expect(await loader.loadMore(true)).toBeUndefined();
    expect(getExportedChatInvites).toHaveBeenCalledOnce();
  });

  test('a page that does not move past the one before ends the list', async() => {
    const {loader, answer} = await makeLoader();
    loader.takePage(false, page(range(1, PAGE)));

    const promise = loader.loadMore(false);
    answer(page(range(1, PAGE)));
    expect(await promise).toEqual([]);
    expect(loader.isEnd(false)).toBe(true);
  });
});

/** an observer whose target comes into view (or not) when the test says so */
class IntersectionObserverMock {
  public static instances: IntersectionObserverMock[] = [];
  public targets: Set<Element> = new Set();

  constructor(public callback: IntersectionObserverCallback, public options: IntersectionObserverInit) {
    IntersectionObserverMock.instances.push(this);
  }

  public observe(target: Element) {
    this.targets.add(target);
  }

  public unobserve(target: Element) {
    this.targets.delete(target);
  }

  public disconnect() {
    this.targets.clear();
  }

  public fire(isIntersecting: boolean) {
    this.targets.forEach((target) => this.callback([{target, isIntersecting} as IntersectionObserverEntry], this as any));
  }
}

describe('the invite links tab', () => {
  let ChatInviteLinks: typeof import('@components/sidebarRight/tabs/chatInviteLinks')['default'];
  // * the rows' graph wants the browser APIs jsdom lacks on import
  beforeAll(async() => {
    stubBrowserGlobals();
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    ChatInviteLinks = (await import('@components/sidebarRight/tabs/chatInviteLinks')).default;
  }, 60_000);

  let dispose: VoidFunction;
  let container: HTMLElement;
  let scrollable: {
    container: HTMLElement,
    append: (...nodes: Node[]) => void,
    checkForTriggers: ReturnType<typeof vi.fn>,
    onScrolledBottom: () => void,
    onScrollOffset: number
  };
  let pages: ReturnType<typeof pagesOnDemand>;

  const open = async(invites: MessagesExportedChatInvites, invitesRevoked: MessagesExportedChatInvites) => {
    container = document.createElement('div');
    document.body.append(container);
    scrollable = {
      container,
      append: (...nodes: Node[]) => container.append(...nodes),
      checkForTriggers: vi.fn(),
      onScrolledBottom: undefined,
      onScrollOffset: 300
    };
    pages = pagesOnDemand();
    IntersectionObserverMock.instances = [];
    mocks.tab = {
      payload: {
        chatId: CHAT_ID,
        p: {
          animationData: Promise.resolve(async() => ({})),
          invites: Promise.resolve(invites),
          invitesRevoked: Promise.resolve(invitesRevoked),
          adminsInvites: false,
          chatFull: Promise.resolve({_: 'channelFull', exported_invite: invite(0)})
        }
      },
      managers: {
        appChatsManager: {getChat: async() => ({_: 'channel', id: CHAT_ID})},
        appChatInvitesManager: {getExportedChatInvites: pages.getExportedChatInvites}
      },
      container: document.createElement('div'),
      scrollable,
      middlewareHelper: getMiddleware(),
      listenerSetter: new ListenerSetter()
    };
    dispose = render(() => <ChatInviteLinks />, document.createElement('div'));
    await mocks.collected;
  };

  const getSection = (name: string) => [...container.querySelectorAll<HTMLElement>('.sidebar-left-section-container')]
  .find((element) => element.querySelector('.sidebar-left-section-name')?.textContent === name);
  const sectionLinks = (name: string) => [...getSection(name).querySelectorAll('.link-title')].map((title) => 'https://' + title.textContent);

  afterEach(() => {
    dispose?.();
    mocks.tab?.middlewareHelper.destroy();
    document.body.replaceChildren();
  });

  test('the active links go on as the end of their section comes near, a page at a time, and no link is drawn twice', async() => {
    // * the main link is among the first page, and is not drawn as a row
    await open(page([invite(0), ...range(1, PAGE - 1)], 80), page(range(1001, 1002, true)));
    expect(sectionLinks('InviteLinks.Additional')).toEqual(links(range(1, PAGE - 1)));
    expect(sectionLinks('RevokedLinks')).toEqual(links([invite(1001), invite(1002)]));
    // * the end of the tab is the revoked links', which are all there
    expect(scrollable.onScrolledBottom).toBeUndefined();

    // * what is watched is the end of the active links, not the end of the tab
    const [observer] = IntersectionObserverMock.instances;
    expect(observer.options).toMatchObject({root: container, rootMargin: '0px 0px 300px'});
    const [end] = observer.targets;
    expect(getSection('InviteLinks.Additional').contains(end)).toBe(true);
    expect(pages.getExportedChatInvites).not.toHaveBeenCalled();

    observer.fire(false);
    expect(pages.getExportedChatInvites).not.toHaveBeenCalled();
    observer.fire(true);
    // * the end coming near again while a page is on its way asks for nothing more
    observer.fire(true);
    expect(pages.getExportedChatInvites).toHaveBeenCalledOnce();
    expect(pages.getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      chatId: CHAT_ID,
      revoked: false,
      offsetDate: invite(PAGE - 1).date,
      offsetLink: invite(PAGE - 1).link
    }));

    // * a full page: one link of it is shown already, the main one too
    const observe = vi.spyOn(observer, 'observe');
    pages.answer(page([invite(0), invite(PAGE - 1), ...range(PAGE, PAGE * 2 - 3)], 80));
    await vi.waitFor(() => expect(sectionLinks('InviteLinks.Additional')).toEqual(links(range(1, PAGE * 2 - 3))));
    // * observed anew, which tells whether the end is still near
    expect(observe).toHaveBeenCalledExactlyOnceWith(end);
    // * the end stays after the last row
    expect(end.previousElementSibling.lastElementChild.querySelector('.link-title').textContent).toBe('t.me/+' + (PAGE * 2 - 3));

    observer.fire(true);
    expect(pages.getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      revoked: false,
      offsetLink: invite(PAGE * 2 - 3).link
    }));
    // * a short page: the list is all there, and nothing is watched any more
    pages.answer(page(range(PAGE * 2 - 2, 100), 80));
    await vi.waitFor(() => expect(observer.targets.size).toBe(0));
    expect(end.isConnected).toBe(false);
    expect(sectionLinks('InviteLinks.Additional')).toEqual(links(range(1, 100)));
    expect(sectionLinks('RevokedLinks')).toEqual(links([invite(1001), invite(1002)]));
    expect(pages.getExportedChatInvites).toHaveBeenCalledTimes(2);
  });

  test('the revoked links go on as the end of the tab comes near', async() => {
    await open(page([invite(0), ...range(1, 3)]), page(range(1001, 1000 + PAGE, true), 60));
    expect(IntersectionObserverMock.instances).toEqual([]);

    scrollable.onScrolledBottom();
    // * a scroll while a page is on its way asks for nothing more
    scrollable.onScrolledBottom();
    expect(pages.getExportedChatInvites).toHaveBeenCalledOnce();
    expect(pages.getExportedChatInvites).toHaveBeenLastCalledWith(expect.objectContaining({
      revoked: true,
      offsetDate: invite(1000 + PAGE).date,
      offsetLink: invite(1000 + PAGE).link
    }));
    pages.answer(page(range(1000 + PAGE + 1, 1060, true), 60));
    await vi.waitFor(() => expect(scrollable.onScrolledBottom).toBeNull());
    expect(sectionLinks('RevokedLinks')).toEqual(links(range(1001, 1060)));
    expect(sectionLinks('InviteLinks.Additional')).toEqual(links(range(1, 3)));
  });

  test('lists that fit their first pages ask for nothing more', async() => {
    await open(page([invite(0), ...range(1, 3)]), page(range(1001, 1002, true)));
    expect(scrollable.onScrolledBottom).toBeUndefined();
    expect(IntersectionObserverMock.instances).toEqual([]);
  });
});
