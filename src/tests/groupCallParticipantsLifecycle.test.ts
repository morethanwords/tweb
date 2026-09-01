import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  buttonMenuGates: [] as Array<Promise<void>>,
  buttonMenuStarted: vi.fn(),
  contextCallback: undefined as ((event: Event) => Promise<void>) | undefined,
  contextClose: vi.fn(),
  contextOpen: vi.fn(),
  contextOnClose: undefined as (() => void) | undefined,
  currentMenu: undefined as HTMLElement | undefined,
  menuProbe: vi.fn(),
  menus: [] as HTMLElement[],
  positionMenu: vi.fn(),
  scrollables: [] as Array<{destroy: ReturnType<typeof vi.fn>}>,
  lists: [] as Array<{
    add: ReturnType<typeof vi.fn>,
    delete: ReturnType<typeof vi.fn>,
    destroy: ReturnType<typeof vi.fn>,
    has: ReturnType<typeof vi.fn>,
    update: ReturnType<typeof vi.fn>
  }>,
  toastNew: vi.fn(),
  videos: [] as Array<{destroy: ReturnType<typeof vi.fn>}>
}));

vi.mock('@components/groupCall', () => ({default: class PopupGroupCallMock {}}));

vi.mock('@helpers/appWindow', () => ({
  getAppWindow: () => window,
  getOverlayRoot: () => document.body,
  onAppWindowChange: () => {}
}));

vi.mock('@helpers/contextMenuController', () => ({
  default: {
    close: () => {
      mocks.contextClose();
      mocks.currentMenu?.classList.remove('active');
      mocks.currentMenu = undefined;
      const onClose = mocks.contextOnClose;
      mocks.contextOnClose = undefined;
      onClose?.();
    },
    openBtnMenu: (element: HTMLElement, onClose?: () => void) => {
      mocks.contextOpen(element);
      mocks.currentMenu = element;
      mocks.contextOnClose = onClose;
      element.classList.add('active');
    }
  }
}));

vi.mock('@helpers/dom/attachContextMenuListener', () => ({
  attachContextMenuListener: ({callback}: {callback: (event: Event) => Promise<void>}) => {
    mocks.contextCallback = callback;
  }
}));

vi.mock('@helpers/dom/fullScreen', () => ({
  addFullScreenListener: () => {},
  isFullScreen: () => false
}));

vi.mock('@helpers/positionMenu', () => ({default: mocks.positionMenu}));

vi.mock('@components/buttonMenu', () => ({
  default: async({buttons, listenerSetter}: {
    buttons: Array<{element?: HTMLElement}>,
    listenerSetter: ListenerSetter
  }) => {
    mocks.buttonMenuStarted();
    await mocks.buttonMenuGates.shift();
    const menu = document.createElement('div');
    menu.classList.add('btn-menu');
    buttons.forEach((button) => {
      const element = button.element = document.createElement('div');
      menu.append(element);
    });
    listenerSetter.add(menu)('menu-probe', mocks.menuProbe);
    mocks.menus.push(menu);
    return menu;
  }
}));

vi.mock('@components/confirmationPopup', () => ({default: () => Promise.resolve()}));
vi.mock('@components/peerTitle', () => ({
  default: class PeerTitleMock {
    public element = document.createElement('span');
  }
}));
vi.mock('@components/popups', () => ({
  default: class PopupElementMock {
    public static getPopups(): any[] { return []; }
  }
}));
vi.mock('@lib/appImManager', () => ({default: {setInnerPeer: vi.fn()}}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@appManagers/utils/peers/getPeerId', () => ({
  default: (peer: {user_id: number}) => peer.user_id as PeerId
}));
vi.mock('@lib/rootScope', () => ({default: new EventTarget()}));

vi.mock('@components/scrollable', () => ({
  default: class ScrollableMock {
    public container = document.createElement('div');
    public destroy = vi.fn();
    public onScrolledBottom: (() => void) | null;

    constructor() {
      mocks.scrollables.push(this);
    }

    public append(...elements: Node[]) {
      this.container.append(...elements);
    }

    public checkForTriggers() {}
  }
}));

vi.mock('@components/groupCall/participantsList', () => ({
  default: class GroupCallParticipantsListMock {
    public list = document.createElement('ul');
    public destroy = vi.fn();
    public add = vi.fn();
    public delete = vi.fn();
    public has = vi.fn().mockReturnValue(false);
    public update = vi.fn();

    constructor() {
      mocks.lists.push(this);
    }
  }
}));

vi.mock('@components/groupCall/participantVideos', () => ({
  default: class GroupCallParticipantsVideoElementMock extends EventTarget {
    public destroy = vi.fn();

    constructor() {
      super();
      mocks.videos.push(this);
    }
  }
}));

import ListenerSetter from '@helpers/listenerSetter';
import EventListenerBase from '@helpers/eventListenerBase';
import GroupCallParticipantsElement, {
  GroupCallParticipantContextMenu
} from '@components/groupCall/participants';

const participant = (userId: number) => ({
  _: 'groupCallParticipant',
  date: 1,
  peer: {_: 'peerUser', user_id: userId},
  pFlags: {can_self_unmute: true},
  source: userId
}) as any;

function makeInstance(getParticipantByPeerId = vi.fn().mockResolvedValue(participant(1))) {
  return Object.assign(new EventListenerBase<{
    membersWithAccess: (payload: {current: PeerId[], previous: PeerId[]}) => void
  }>(), {
    chatId: 10 as ChatId,
    id: 20,
    participants: Promise.resolve(new Map()),
    memberWithAccessPeerIds: [] as PeerId[],
    getParticipantByPeerId,
    isMemberWithAccess: vi.fn().mockReturnValue(false),
    editParticipant: vi.fn()
  });
}

function makeManagers() {
  return {
    appChatsManager: {
      hasRights: vi.fn().mockResolvedValue(true),
      isBroadcast: vi.fn().mockResolvedValue(false),
      kickFromChat: vi.fn()
    },
    appGroupCallsManager: {
      getGroupCallParticipants: vi.fn().mockResolvedValue({participants: [], isEnd: true})
    }
  } as any;
}

function makeContextTarget(peerId: number) {
  const container = document.createElement('ul');
  const row = document.createElement('li');
  row.classList.add('group-call-participant');
  row.dataset.peerId = String(peerId);
  container.append(row);
  return {container, row};
}

afterEach(() => {
  mocks.buttonMenuGates.length = 0;
  mocks.buttonMenuStarted.mockClear();
  mocks.contextCallback = undefined;
  mocks.contextClose.mockClear();
  mocks.contextOpen.mockClear();
  mocks.contextOnClose = undefined;
  mocks.currentMenu = undefined;
  mocks.menuProbe.mockClear();
  mocks.menus.length = 0;
  mocks.positionMenu.mockClear();
  mocks.scrollables.length = 0;
  mocks.lists.length = 0;
  mocks.videos.length = 0;
  mocks.toastNew.mockClear();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('group call participant UI teardown', () => {
  it('invalidates pending context-menu work when destroyed', async() => {
    let resolveParticipant: (value: ReturnType<typeof participant>) => void;
    const pending = new Promise<ReturnType<typeof participant>>((resolve) => {
      resolveParticipant = resolve;
    });
    const instance = makeInstance(vi.fn().mockReturnValue(pending));
    const listenerSetter = new ListenerSetter();
    const {container, row} = makeContextTarget(1);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: container,
      managers: makeManagers(),
      instance: instance as any
    });

    const event = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(event, 'target', {value: row});
    const openPromise = mocks.contextCallback(event);
    menu.destroy();
    resolveParticipant(participant(1));
    await openPromise;

    expect(mocks.contextOpen).not.toHaveBeenCalled();
    expect(mocks.menus).toHaveLength(0);
    listenerSetter.removeAll();
  });

  it('lets only the latest async context-open publish a menu', async() => {
    let resolveFirst: (value: ReturnType<typeof participant>) => void;
    const first = new Promise<ReturnType<typeof participant>>((resolve) => {
      resolveFirst = resolve;
    });
    const getParticipant = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(participant(2));
    const instance = makeInstance(getParticipant);
    const listenerSetter = new ListenerSetter();
    const firstTarget = makeContextTarget(1);
    const secondTarget = makeContextTarget(2);
    const root = document.createElement('div');
    root.append(firstTarget.container, secondTarget.container);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: root,
      managers: makeManagers(),
      instance: instance as any
    });

    const firstEvent = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(firstEvent, 'target', {value: firstTarget.row});
    const firstOpen = mocks.contextCallback(firstEvent);
    const secondEvent = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(secondEvent, 'target', {value: secondTarget.row});
    await mocks.contextCallback(secondEvent);
    resolveFirst(participant(1));
    await firstOpen;

    expect(mocks.contextOpen).toHaveBeenCalledTimes(1);
    expect(mocks.positionMenu).toHaveBeenCalledTimes(1);
    menu.destroy();
    expect(mocks.contextClose).toHaveBeenCalledTimes(1);
    expect(mocks.menus[0].isConnected).toBe(false);
    listenerSetter.removeAll();
  });

  it('does not let a stale menu creation remove the current menu listeners', async() => {
    let resolveFirstMenu: () => void;
    mocks.buttonMenuGates.push(new Promise<void>((resolve) => {
      resolveFirstMenu = resolve;
    }));

    const instance = makeInstance();
    const listenerSetter = new ListenerSetter();
    const firstTarget = makeContextTarget(1);
    const secondTarget = makeContextTarget(2);
    const root = document.createElement('div');
    root.append(firstTarget.container, secondTarget.container);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: root,
      managers: makeManagers(),
      instance: instance as any
    });

    const firstEvent = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(firstEvent, 'target', {value: firstTarget.row});
    const firstOpen = mocks.contextCallback(firstEvent);
    await vi.waitFor(() => expect(mocks.buttonMenuStarted).toHaveBeenCalledTimes(1));

    const secondEvent = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(secondEvent, 'target', {value: secondTarget.row});
    await mocks.contextCallback(secondEvent);
    expect(mocks.contextOpen).toHaveBeenCalledTimes(1);

    resolveFirstMenu();
    await firstOpen;
    mocks.currentMenu.dispatchEvent(new Event('menu-probe'));

    expect(mocks.menuProbe).toHaveBeenCalledTimes(1);
    menu.destroy();
    listenerSetter.removeAll();
  });

  it('destroys both scroll surfaces, the rows, video tiles and context menu', () => {
    const listenerSetter = new ListenerSetter();
    const host = document.createElement('div');
    document.body.append(host);
    const element = new GroupCallParticipantsElement({
      appendTo: host,
      instance: makeInstance() as any,
      listenerSetter,
      managers: makeManagers()
    });

    element.destroy();
    element.destroy();

    expect(mocks.scrollables[0].destroy).toHaveBeenCalledTimes(1);
    expect(mocks.lists[0].destroy).toHaveBeenCalledTimes(1);
    expect(mocks.videos[0].destroy).toHaveBeenCalledTimes(1);
    expect(mocks.menus).toHaveLength(0);
    listenerSetter.removeAll();
  });

  it('closes participant actions when the target becomes chain-only', async() => {
    const instance = makeInstance();
    const listenerSetter = new ListenerSetter();
    const {container, row} = makeContextTarget(1);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: container,
      managers: makeManagers(),
      instance: instance as any
    });

    const event = new MouseEvent('contextmenu', {bubbles: true});
    Object.defineProperty(event, 'target', {value: row});
    await mocks.contextCallback(event);
    expect(mocks.contextOpen).toHaveBeenCalledTimes(1);

    instance.dispatchEvent('membersWithAccess', {
      current: [1 as PeerId],
      previous: [] as PeerId[]
    });

    expect(mocks.contextClose).toHaveBeenCalledTimes(1);
    expect(mocks.currentMenu).toBeUndefined();
    menu.destroy();
    listenerSetter.removeAll();
  });

  it('handles initial participant loading and row mutations rejecting', async() => {
    const initialError = new Error('initial participants failed');
    const addError = new Error('participant add failed');
    const updateError = new Error('participant update failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = makeInstance();
    instance.participants = Promise.reject(initialError);
    const listenerSetter = new ListenerSetter();
    const host = document.createElement('div');
    const element = new GroupCallParticipantsElement({
      appendTo: host,
      instance: instance as any,
      listenerSetter,
      managers: makeManagers()
    });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('load group call participants failed', initialError);
    });

    const list = mocks.lists[0];
    list.add.mockRejectedValueOnce(addError);
    list.has.mockReturnValueOnce(false).mockReturnValueOnce(true);
    (element as any).updateParticipant(participant(1));
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('group call participant row add failed', addError);
    });
    expect(list.delete).toHaveBeenCalledWith(1, true);

    list.has.mockReturnValue(true);
    list.update.mockRejectedValueOnce(updateError);
    (element as any).updateParticipant(participant(1));
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('group call participant row update failed', updateError);
    });

    element.destroy();
    listenerSetter.removeAll();
  });

  it('reports a rejected participant mute without leaking the rejection', async() => {
    const error = new Error('mute failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = makeInstance();
    instance.editParticipant.mockRejectedValue(error);
    const listenerSetter = new ListenerSetter();
    const {container} = makeContextTarget(1);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: container,
      managers: makeManagers(),
      instance: instance as any
    });
    (menu as any).participant = participant(1);

    await (menu as any).toggleParticipantMuted(true);

    expect(consoleError).toHaveBeenCalledWith('edit group call participant failed', error);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
    menu.destroy();
    listenerSetter.removeAll();
  });

  it('observes a rejected confirmed participant removal', async() => {
    const error = new Error('kick failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const managers = makeManagers();
    managers.appChatsManager.kickFromChat.mockRejectedValue(error);
    const listenerSetter = new ListenerSetter();
    const {container} = makeContextTarget(1);
    const menu = new GroupCallParticipantContextMenu({
      listenerSetter,
      onContextElement: container,
      managers,
      instance: makeInstance() as any
    });
    Object.assign(menu as any, {targetPeerId: 1 as PeerId});

    (menu as any).buttons[5].onClick();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('remove group call participant failed', error);
    });

    expect(managers.appChatsManager.kickFromChat).toHaveBeenCalledWith(10, 1);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
    menu.destroy();
    listenerSetter.removeAll();
  });

  it('observes a synchronous row refresh failure while the instance is live', async() => {
    const error = new Error('row refresh failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listenerSetter = new ListenerSetter();
    const host = document.createElement('div');
    const element = new GroupCallParticipantsElement({
      appendTo: host,
      instance: makeInstance() as any,
      listenerSetter,
      managers: makeManagers()
    });
    mocks.lists[0].has.mockImplementationOnce(() => {
      throw error;
    });

    void (element as any).refreshRow(1 as PeerId);
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('refresh group call participant row failed', error);
    });

    element.destroy();
    listenerSetter.removeAll();
  });
});
