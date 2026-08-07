import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => {
  class IntersectionObserverMock {
    public disconnect() {}
    public observe() {}
    public unobserve() {}
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {supports: () => false}
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/webp;base64,'
  });

  return {
    collected: undefined as Promise<void> | undefined,
    confirmationPopup: vi.fn().mockResolvedValue(undefined),
    guard: vi.fn(),
    myId: undefined as PeerId,
    tab: undefined as any
  };
});

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: mocks.guard
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/inputField', () => ({
  default: class {
    public container = document.createElement('div');
    public input = document.createElement('input');

    constructor() {
      this.container.append(this.input);
    }

    public get value() {
      return this.input.value;
    }

    public isValid() {
      return true;
    }

    public setOriginalValue(value: string) {
      this.input.value = value;
    }
  }
}));

vi.mock('@components/popups/channelsTooMuch', () => ({
  handleChannelsTooMuch: (callback: () => Promise<unknown>) => callback()
}));

vi.mock('@components/popups/datePicker', () => ({
  default: vi.fn()
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({
    collect: (promise: Promise<void>) => {
      mocks.collected = promise;
    }
  })
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/wrappers/getUserStatusString', () => ({
  default: () => document.createTextNode('online')
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn(async() => document.createTextNode('Admin'))
}));

vi.mock('@components/wrappers/wrapDuration', () => ({
  wrapFormattedDuration: vi.fn()
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    createChatList: () => document.createElement('div'),
    addDialogNew: (options: {container: HTMLElement}) => {
      const row = document.createElement('div');
      row.classList.add('chatlist-chat');
      const lastMessageSpan = document.createElement('span');
      row.append(lastMessageSpan);
      options.container.append(row);
      return {dom: {lastMessageSpan}};
    }
  }
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {}
}));

vi.mock('@lib/langPack', () => ({
  default: {
    getIsRTL: () => false
  },
  i18n: (key: string) => document.createTextNode(key),
  i18n_: (options: {element: HTMLElement, key: string}) => {
    options.element.textContent = options.key;
    return options.element;
  }
}));

vi.mock('@lib/appImManager', () => ({
  default: {
    setInnerPeer: vi.fn()
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    addEventListener: vi.fn(),
    get myId() {
      return mocks.myId;
    },
    removeEventListener: vi.fn()
  }
}));

import UserPermissions
from '@components/sidebarRight/tabs/userPermissions';

const communityId = 10 as ChatId;
const participantId = (20 as UserId).toPeerId(false);
const waitForStateUpdate = () => new Promise((resolve) => {
  setTimeout(resolve, 250);
});

describe('community admin rights shared tab', () => {
  let container: HTMLElement;
  let dispose: VoidFunction;
  let editAdmin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    mocks.myId = (1 as UserId).toPeerId(false);
    editAdmin = vi.fn().mockResolvedValue(undefined);

    const header = document.createElement('div');
    const content = document.createElement('div');
    const scrollable = document.createElement('div');
    const listenerSetter = {
      add: (target: EventTarget) => (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions
      ) => {
        target.addEventListener(type, listener, options);
        return () => target.removeEventListener(type, listener, options);
      },
      removeManual: (
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions
      ) => target.removeEventListener(type, listener, options)
    };
    const middleware = {
      onDestroy: vi.fn()
    };
    const participant = {
      _: 'channelParticipantAdmin',
      pFlags: {can_edit: true},
      user_id: participantId.toUserId(),
      promoted_by: mocks.myId.toUserId(),
      date: 1,
      admin_rights: {
        _: 'chatAdminRights',
        pFlags: {
          change_info: true,
          manage_linked_peers: true,
          ban_users: true,
          add_admins: true
        }
      },
      rank: 'Custom rank'
    };

    mocks.tab = {
      close: vi.fn(),
      container: document.createElement('div'),
      content,
      header,
      isConfirmationNeededOnClose: undefined,
      listenerSetter,
      managers: {
        appChatsManager: {
          editAdmin,
          getChat: vi.fn().mockResolvedValue({
            _: 'community',
            id: communityId,
            pFlags: {creator: true},
            title: 'Community',
            admin_rights: participant.admin_rights
          })
        },
        appCommunitiesManager: {
          reloadCommunity: vi.fn()
        },
        appUsersManager: {
          getUser: vi.fn().mockResolvedValue({
            _: 'user',
            id: participantId.toUserId(),
            pFlags: {},
            first_name: 'Admin'
          })
        }
      },
      middlewareHelper: {
        get: () => middleware
      },
      payload: {
        communityId,
        participantId,
        participant,
        editingAdmin: true,
        onUpdated: vi.fn()
      },
      scrollable
    };

    document.body.append(
      mocks.tab.container,
      header,
      content,
      scrollable
    );
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('uses the chat permissions layout and preserves the admin rank', async() => {
    dispose = render(() => <UserPermissions />, container);
    await mocks.collected;

    expect(mocks.guard).toHaveBeenCalledWith(mocks.tab, communityId);
    expect(mocks.tab.container.classList).toContain('edit-peer-container');
    expect(mocks.tab.container.classList)
    .toContain('user-permissions-container');
    const scrollable = mocks.tab.scrollable as HTMLElement;
    expect(scrollable.querySelector('.chatlist-chat')).not.toBeNull();
    expect(scrollable.querySelectorAll('input[type="checkbox"]'))
    .toHaveLength(4);
    expect(scrollable.querySelector('.input-wrapper')).toBeNull();

    await waitForStateUpdate();
    await mocks.tab.isConfirmationNeededOnClose();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();

    const saveButton = (mocks.tab.header as HTMLElement)
    .querySelector<HTMLElement>('.appear-zoom');
    expect(saveButton.classList).not.toContain('appear-zoom--active');

    const rights = scrollable.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    rights[0].click();
    rights[1].click();
    await waitForStateUpdate();
    expect(saveButton.classList).toContain('appear-zoom--active');
    saveButton.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));

    await vi.waitFor(() => {
      expect(editAdmin).toHaveBeenCalledOnce();
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(editAdmin).toHaveBeenCalledWith(
      communityId,
      mocks.tab.payload.participant,
      expect.objectContaining({
        _: 'chatAdminRights',
        pFlags: expect.not.objectContaining({
          change_info: true,
          manage_linked_peers: true
        })
      }),
      'Custom rank',
      true
    );
  });

  it('does not mark a read-only creator as changed on opening', async() => {
    mocks.tab.payload.participant = {
      _: 'channelParticipantCreator',
      pFlags: {},
      user_id: participantId.toUserId(),
      admin_rights: mocks.tab.payload.participant.admin_rights,
      rank: 'owner'
    };

    dispose = render(() => <UserPermissions />, container);
    await mocks.collected;
    await waitForStateUpdate();
    await mocks.tab.isConfirmationNeededOnClose();

    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(editAdmin).not.toHaveBeenCalled();
  });

  it('shows confirmation for a new admin with the initial rights', async() => {
    mocks.tab.payload.participant = undefined;

    dispose = render(() => <UserPermissions />, container);
    await mocks.collected;
    await waitForStateUpdate();

    const scrollable = mocks.tab.scrollable as HTMLElement;
    const saveButton = (mocks.tab.header as HTMLElement)
    .querySelector<HTMLElement>('.appear-zoom');
    expect(saveButton.classList).toContain('appear-zoom--active');
    expect(scrollable.querySelectorAll('input[type="checkbox"]'))
    .toHaveLength(4);
  });

  it('keeps a new admin when every visible right is disabled', async() => {
    mocks.tab.payload.participant = undefined;

    dispose = render(() => <UserPermissions />, container);
    await mocks.collected;

    const scrollable = mocks.tab.scrollable as HTMLElement;
    const rights = scrollable.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    rights.forEach((right) => {
      if(right.checked) {
        right.click();
      }
    });
    await waitForStateUpdate();

    const saveButton = (mocks.tab.header as HTMLElement)
    .querySelector<HTMLElement>('.appear-zoom');
    saveButton.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));

    await vi.waitFor(() => {
      expect(editAdmin).toHaveBeenCalledOnce();
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(editAdmin).toHaveBeenCalledWith(
      communityId,
      participantId,
      {
        _: 'chatAdminRights',
        pFlags: {other: true}
      },
      '',
      true
    );
    expect(mocks.tab.payload.onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        _: 'channelParticipantAdmin',
        admin_rights: {
          _: 'chatAdminRights',
          pFlags: {other: true}
        }
      })
    );
  });
});
