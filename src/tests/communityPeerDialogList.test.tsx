import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {resizeObserverInstances} from './mocks/resizeObserver';

const mocks = vi.hoisted(() => ({
  addDialogNew: vi.fn(),
  addListDialog: vi.fn(),
  createChatList: vi.fn(),
  createContextMenu: vi.fn(),
  communityFulls: {} as Record<ChatId, any>,
  dialogs: new Map<PeerId, any>(),
  contextMenuDestroys: [] as ReturnType<typeof vi.fn>[],
  setListClickListener: vi.fn()
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    addDialogNew: mocks.addDialogNew,
    addListDialog: mocks.addListDialog,
    createChatList: mocks.createChatList,
    setListClickListener: mocks.setListClickListener
  }
}));

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: mocks.createContextMenu
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: unknown[]) => {
    return document.createTextNode(
      `${key}${args ? `:${args.join(',')}` : ''}`
    );
  }
}));

vi.mock('@stores/communities', () => ({
  useCommunityFulls: () => mocks.communityFulls
}));

vi.mock('@stores/peers', () => ({
  usePeer: (getPeerId: () => PeerId) => () => ({
    _: getPeerId().isUser() ? 'user' : 'channel',
    pFlags: {}
  })
}));

vi.mock('@components/communities/communityPeerStatus', () => ({
  getCommunityPeerSubtitle: () => 'default subtitle'
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: {peerId: PeerId, class?: string}) => (
    <span
      class={props.class}
      data-testid="avatar-overlay"
      data-peer-id={props.peerId}
    />
  )
}));

vi.mock('@components/communities/communityAvatar', () => ({
  default: (props: {title?: string, class?: string}) => (
    <span class={props.class} data-testid="community-avatar">
      {props.title}
    </span>
  )
}));

import CommunityPeerDialogList, {CommunityDialogList}
from '@components/communities/communityPeerDialogList';

type Item = {
  peerId: PeerId,
  subtitle: string,
  kind?: string,
  class?: string,
  rightInteractive?: boolean,
  overlayPeerId?: PeerId,
  community?: {
    _: 'community',
    id: ChatId,
    pFlags: {},
    title: string
  }
};

let dispose: VoidFunction;

function createFakeDialog(peerId: PeerId) {
  const element = document.createElement('a');
  element.classList.add('row', 'chatlist-chat');
  element.dataset.peerId = String(peerId);

  const titleRow = document.createElement('div');
  const titleSpanContainer = document.createElement('div');
  const titleSpan = document.createElement('span');
  const titleRight = document.createElement('div');
  titleSpan.textContent = `Peer ${peerId}`;
  titleSpanContainer.append(titleSpan);
  titleRow.append(titleSpanContainer, titleRight);

  const subtitleEl = document.createElement('div');
  const lastMessageSpan = document.createElement('span');
  subtitleEl.append(lastMessageSpan);

  const avatar = document.createElement('span');
  avatar.classList.add('row-media', 'row-media-abitbigger');
  element.append(titleRow, subtitleEl, avatar);

  const dialog = {
    container: element,
    dom: {
      avatarEl: {node: avatar},
      lastMessageSpan,
      listEl: element,
      titleSpan,
      titleSpanContainer
    },
    media: avatar,
    remove: vi.fn(() => element.remove()),
    titleRight
  };
  mocks.dialogs.set(peerId, dialog);
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  resizeObserverInstances.length = 0;
  for(const key in mocks.communityFulls) {
    delete mocks.communityFulls[key as unknown as ChatId];
  }
  mocks.dialogs.clear();
  mocks.contextMenuDestroys.length = 0;
  mocks.createChatList.mockImplementation(() => {
    const list = document.createElement('ul');
    list.classList.add('chatlist');
    return list;
  });
  mocks.addDialogNew.mockImplementation(({peerId}: {peerId: PeerId}) => {
    return createFakeDialog(peerId);
  });
  mocks.addListDialog.mockImplementation(({
    peerId,
    onInitPromise
  }: {
    peerId: PeerId,
    onInitPromise?: (promise: Promise<void>) => void
  }) => {
    onInitPromise?.(Promise.resolve());
    return createFakeDialog(peerId);
  });
  mocks.setListClickListener.mockImplementation(({
    list,
    onFound
  }: {
    list: HTMLElement,
    onFound: (element: HTMLElement) => boolean
  }) => {
    list.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement;
      if(target.closest('[data-dialog-list-action]')) {
        return;
      }
      const element = target.closest<HTMLElement>('[data-peer-id]');
      if(element) {
        onFound(element);
      }
    }, {capture: true});
    list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if(target.closest('[data-dialog-list-action]')) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true});
  });
  mocks.createContextMenu.mockImplementation(() => {
    const destroy = vi.fn();
    mocks.contextMenuDestroys.push(destroy);
    return {
      destroy,
      open: vi.fn()
    };
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe('CommunityPeerDialogList', () => {
  it('reconciles real DialogElements and destroys removed rows', async() => {
    const firstPeerId = (1 as ChatId).toPeerId(true);
    const secondPeerId = (2 as ChatId).toPeerId(true);
    const overlayPeerId = (3 as UserId).toPeerId(false);
    const [items, setItems] = createSignal<Item[]>([{
      peerId: firstPeerId,
      subtitle: 'First subtitle',
      class: 'first-row',
      overlayPeerId,
      community: {
        _: 'community',
        id: 1 as ChatId,
        pFlags: {},
        title: 'Community One'
      }
    }, {
      peerId: secondPeerId,
      subtitle: 'Second subtitle'
    }]);
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityPeerDialogList
        avatarSize="abitbigger"
        class="community-peer-list"
        items={items()}
        middleware={{} as any}
        getPeerId={(item) => item.peerId}
        getSubtitle={(item) => item.subtitle}
        getTitleAccessory={(item) => `${item.peerId} accessory`}
        getAvatarOverlayPeerId={(item) => item.overlayPeerId}
        getCommunity={(item) => item.community as any}
        getClass={(item) => item.class}
      />
    ), container);

    expect(mocks.createChatList).toHaveBeenCalledOnce();
    expect(mocks.addListDialog).not.toHaveBeenCalled();
    expect(mocks.addDialogNew).toHaveBeenCalledTimes(2);
    expect(mocks.addDialogNew).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomous: false,
        avatarSize: 'abitbigger',
        controlled: true,
        peerId: secondPeerId,
        withStories: true
      })
    );
    expect(mocks.addDialogNew).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomous: true,
        peerId: firstPeerId
      })
    );
    const list = container.querySelector('ul');
    expect(list.classList.contains('community-peer-list')).toBe(true);
    expect(list.children).toHaveLength(2);

    const first = mocks.dialogs.get(firstPeerId);
    const second = mocks.dialogs.get(secondPeerId);
    expect(list.firstElementChild).toBe(first.dom.listEl);
    expect(first.dom.listEl.classList.contains('first-row')).toBe(true);
    expect(first.dom.lastMessageSpan.textContent).toBe('First subtitle');
    expect(first.dom.titleSpan.textContent).toBe('Community One');
    expect(first.dom.titleSpanContainer.textContent)
    .toContain(`${firstPeerId} accessory`);
    expect([...first.dom.titleSpanContainer.children])
    .toEqual([first.dom.titleSpan]);
    expect(first.dom.listEl.querySelector('[data-testid="community-avatar"]'))
    .not.toBeNull();
    expect(first.dom.listEl.querySelector('[data-testid="avatar-overlay"]')
      ?.getAttribute('data-peer-id')).toBe(String(overlayPeerId));
    expect(second.dom.titleSpan.textContent).toBe(`Peer ${secondPeerId}`);

    setItems([{
      ...items()[0],
      subtitle: 'Updated subtitle',
      class: 'updated-row'
    }]);

    await vi.waitFor(() => {
      expect(first.dom.lastMessageSpan.textContent).toBe('Updated subtitle');
      expect(second.remove).toHaveBeenCalledOnce();
    });
    expect(mocks.addListDialog).not.toHaveBeenCalled();
    expect(first.dom.listEl.classList.contains('first-row')).toBe(false);
    expect(first.dom.listEl.classList.contains('updated-row')).toBe(true);

    dispose();
    dispose = undefined;
    expect(first.remove).toHaveBeenCalledOnce();
  });

  it('activates on click without opening popups during mousedown', () => {
    const peerId = (4 as ChatId).toPeerId(true);
    const item: Item = {
      peerId,
      subtitle: 'Chat',
      rightInteractive: true
    };
    const onClick = vi.fn();
    const listRef = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityPeerDialogList
        items={[item]}
        middleware={{} as any}
        getPeerId={(value) => value.peerId}
        getSubtitle={(value) => value.subtitle}
        getRight={(value) => (
          <button type="button">{value.subtitle} action</button>
        )}
        isRightInteractive={(value) => value.rightInteractive}
        onClick={onClick}
        getContextMenu={() => ({
          buttons: []
        })}
        listRef={listRef}
      />
    ), container);

    expect(mocks.setListClickListener).toHaveBeenCalledOnce();
    expect(listRef).toHaveBeenCalledOnce();
    expect(mocks.createContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        listenTo: mocks.dialogs.get(peerId).dom.listEl
      })
    );

    const row = mocks.dialogs.get(peerId).dom.listEl as HTMLElement;
    row.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0
    }));
    expect(onClick).not.toHaveBeenCalled();
    row.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0
    }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith(item, expect.any(MouseEvent));

    const action = row.querySelector('button');
    expect(action.closest('[data-dialog-list-action]')).not.toBeNull();
    action.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0
    }));
    action.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0
    }));
    expect(onClick).toHaveBeenCalledOnce();

    row.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
    expect(onClick).toHaveBeenCalledTimes(2);
    row.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      repeat: true
    }));
    expect(onClick).toHaveBeenCalledTimes(2);

    row.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' '
    }));
    expect(onClick).toHaveBeenCalledTimes(2);
    row.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: ' '
    }));
    expect(onClick).toHaveBeenCalledTimes(3);

    dispose();
    dispose = undefined;
    expect(mocks.contextMenuDestroys[0]).toHaveBeenCalledOnce();
  });

  it('shares one observer and observes only interactive actions', () => {
    const interactivePeerId = (5 as ChatId).toPeerId(true);
    const passivePeerId = (6 as ChatId).toPeerId(true);
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityPeerDialogList
        items={[
          {
            peerId: interactivePeerId,
            subtitle: 'Interactive',
            rightInteractive: true
          },
          {
            peerId: passivePeerId,
            subtitle: 'Passive',
            rightInteractive: false
          }
        ]}
        middleware={{} as any}
        getPeerId={(value) => value.peerId}
        getSubtitle={(value) => value.subtitle}
        getRight={(value) => <button type="button">{value.subtitle}</button>}
        isRightInteractive={(value) => value.rightInteractive}
      />
    ), container);

    expect(resizeObserverInstances).toHaveLength(1);
    expect(resizeObserverInstances[0].observe).toHaveBeenCalledOnce();
    expect(
      mocks.dialogs
      .get(passivePeerId)
      .dom.listEl.style.getPropertyValue(
        '--community-peer-dialog-action-width'
      )
    ).toBe('');

    dispose();
    dispose = undefined;
    expect(resizeObserverInstances[0].unobserve).toHaveBeenCalledOnce();
    expect(resizeObserverInstances[0].disconnect).toHaveBeenCalledOnce();
  });

  it('hands rows to the shared dialog menu with what it reads off them', () => {
    const peerId = (7 as ChatId).toPeerId(true);
    const [items, setItems] = createSignal<Item[]>([{
      peerId,
      subtitle: 'Chat',
      kind: 'requestable'
    }]);
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityPeerDialogList
        items={items()}
        middleware={{} as any}
        getPeerId={(item) => item.peerId}
        getSubtitle={(item) => item.subtitle}
        withDialogContextMenu
        getDataset={(item) => ({
          communityId: '5',
          communityChatKind: item.kind
        })}
      />
    ), container);

    expect(mocks.setListClickListener).toHaveBeenCalledWith(
      expect.objectContaining({withContext: true})
    );
    const row = mocks.dialogs.get(peerId).dom.listEl as HTMLElement;
    expect(row.dataset.communityId).toBe('5');
    expect(row.dataset.communityChatKind).toBe('requestable');

    // the kind follows the item, and a dropped key leaves nothing stale behind
    setItems([{peerId, subtitle: 'Chat', kind: 'hidden'}]);
    expect(row.dataset.communityChatKind).toBe('hidden');
  });

  it('renders Community chat counts with a title fallback', () => {
    const first = {
      _: 'community',
      id: 11 as ChatId,
      pFlags: {},
      title: 'First'
    } as const;
    const second = {
      _: 'community',
      id: 12 as ChatId,
      pFlags: {},
      title: 'Second'
    } as const;
    mocks.communityFulls[first.id] = {
      linked_peers: [{}, {}]
    };
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityDialogList
        communities={[first, second] as any}
        middleware={{} as any}
      />
    ), container);

    expect(
      mocks.dialogs.get(first.id.toPeerId(true)).dom.lastMessageSpan.textContent
    ).toBe('Community.ChatsCount:2');
    expect(
      mocks.dialogs.get(second.id.toPeerId(true)).dom.lastMessageSpan.textContent
    ).toBe('Community.Title');
  });
});
