import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@lib/appImManager', () => ({
  default: {
    addEventListener: vi.fn(),
    getPeerTyping: vi.fn(),
    isSamePeer: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@environment/webpSupport', () => ({
  default: true
}));

import type {Dialog} from '@appManagers/appMessagesManager';
import {
  AutonomousCommunityDialogList,
  CommunityDialogListItem
} from '@components/autonomousDialogList/communityDialogs';
import {getMiddleware} from '@helpers/middleware';
import rootScope from '@lib/rootScope';

const dialog = (
  peerId: PeerId,
  topMessage = 1,
  ttlPeriod?: number
) => ({
  _: 'dialog',
  peerId,
  pFlags: {},
  top_message: topMessage,
  index_0: topMessage,
  ttl_period: ttlPeriod
}) as Dialog;

const item = (
  peerId: PeerId,
  kind: CommunityDialogListItem['kind'],
  value?: Dialog,
  visible?: boolean
) => ({
  linked: {
    _: 'communityPeer',
    pFlags: {},
    peer: {_: 'peerChannel', channel_id: peerId as number},
    visible
  },
  peerId,
  dialog: value,
  kind,
  order: 0
}) as CommunityDialogListItem;

function createFakeDialogsManager() {
  const elements = new Map<PeerId, any>();
  const listListeners: any[] = [];
  const addListDialog = vi.fn(({
    onInitPromise,
    peerId
  }: {
    onInitPromise?: (promise: Promise<unknown>) => void,
    peerId: PeerId
  }) => {
    const listEl = document.createElement('a');
    listEl.dataset.peerId = '' + peerId;
    listEl.classList.add('chatlist-chat');
    const titleSpanContainer = document.createElement('span');
    const titleSpan = document.createElement('span');
    titleSpanContainer.append(titleSpan);
    listEl.append(titleSpanContainer);
    const dialogElement = {
      dom: {
        avatarEl: {
          setAutoDeletePeriod: vi.fn()
        },
        listEl,
        lastMessageSpan: document.createElement('span'),
        titleSpan,
        titleSpanContainer
      },
      destroy: vi.fn(),
      setMuted: vi.fn((muted: boolean) => {
        listEl.classList.toggle('is-muted', muted);
      }),
      remove: vi.fn(() => listEl.remove())
    };
    elements.set(peerId, dialogElement);
    onInitPromise?.(Promise.resolve());
    return dialogElement;
  });
  const manager = {
    addListDialog,
    createChatList: vi.fn(() => document.createElement('ul')),
    setListClickListener: vi.fn((options) => {
      listListeners.push(options);
    }),
    setLastMessageN: vi.fn(() => Promise.resolve()),
    initDialog: vi.fn(() => Promise.resolve()),
    setDialogActive: vi.fn()
  };
  const managers = {
    appMessagesManager: {
      getConversationPreviews: vi.fn().mockImplementation(
        async(peerIds: PeerId[]) => peerIds.map((peerId) => ({peerId}))
      ),
      getDialogOnly: vi.fn().mockResolvedValue(undefined),
      getMessageByPeer: vi.fn(),
      loadConversationPreviews: vi.fn().mockImplementation(
        async(peerIds: PeerId[]) => peerIds.map((peerId) => ({peerId}))
      )
    }
  };
  return {manager, managers, elements, listListeners};
}

let controller: AutonomousCommunityDialogList;

function setManagers(managers: ReturnType<
  typeof createFakeDialogsManager
>['managers']) {
  (controller as any).managers = managers;
}

afterEach(() => {
  controller?.destroy();
  controller = undefined;
});

describe('AutonomousCommunityDialogList', () => {
  it('mounts joined and viewable peers as ordinary dialog elements', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const joined = item(
      1 as PeerId,
      'joined',
      dialog(1 as PeerId, 1, 60)
    );
    const viewable = item(2 as PeerId, 'viewable');

    controller.setItems([joined, viewable]);

    expect(manager.addListDialog).toHaveBeenCalledTimes(2);
    expect(controller.getList('joined').firstElementChild)
    .toBe(elements.get(joined.peerId).dom.listEl);
    expect(controller.getList('viewable').firstElementChild)
    .toBe(elements.get(viewable.peerId).dom.listEl);
    expect(elements.get(viewable.peerId).dom.listEl.dataset.communityDialog)
    .toBe('true');
    expect(elements.get(viewable.peerId).dom.listEl.dataset.communityId)
    .toBe('100');
    expect(manager.addListDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        autoDeletePeriod: 60,
        dontSetActive: false,
        isMainList: false,
        peerId: joined.peerId
      })
    );
    expect(manager.addListDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        dontSetActive: true,
        peerId: viewable.peerId
      })
    );
    expect(manager.setLastMessageN).not.toHaveBeenCalled();
  });

  it('moves one dialog element between sections without recreating it', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const peerId = 1 as PeerId;
    controller.setItems([item(peerId, 'joined', dialog(peerId))]);
    const element = elements.get(peerId).dom.listEl;
    expect(controller.getDialogElement(peerId))
    .toBe(elements.get(peerId));

    controller.setItems([item(peerId, 'viewable')]);

    expect(manager.addListDialog).toHaveBeenCalledTimes(1);
    expect(controller.getList('viewable').firstElementChild).toBe(element);
    expect(controller.getDialogElement(peerId))
    .toBe(elements.get(peerId));
    expect(manager.setLastMessageN).not.toHaveBeenCalled();

    controller.setItems([
      item(peerId, 'viewable', dialog(peerId, 1, 120))
    ]);
    expect(elements.get(peerId).dom.avatarEl.setAutoDeletePeriod)
    .toHaveBeenLastCalledWith(120);
  });

  it('leaves the rows in place when the same items are applied again', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const first = 1 as PeerId;
    const second = 2 as PeerId;
    const items = [
      item(first, 'joined', dialog(first), false),
      item(second, 'joined', dialog(second))
    ];
    controller.setItems(items);
    const list = controller.getList('joined');
    const observer = new MutationObserver(() => {});
    observer.observe(list, {childList: true, subtree: true});

    // reprojecting the same state must not touch the DOM: reinserting a row
    // detaches everything rendered inside it
    controller.setItems(items.map((value) => ({...value})));

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    expect([...list.children]).toEqual([
      elements.get(first).dom.listEl,
      elements.get(second).dom.listEl
    ]);
  });

  it('applies the projected mute state synchronously', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const peerId = 1 as PeerId;

    controller.setItems([{
      ...item(peerId, 'joined', dialog(peerId)),
      muted: true
    }]);

    expect(elements.get(peerId).setMuted).toHaveBeenCalledWith(true, 0);
    expect(elements.get(peerId).dom.listEl.classList.contains('is-muted'))
    .toBe(true);
  });

  it('keeps eye2 before mute for explicitly hidden dialog rows', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const peerId = 1 as PeerId;
    const hidden = item(peerId, 'joined', dialog(peerId), false);

    controller.setItems([hidden]);
    const {titleSpanContainer} = elements.get(peerId).dom;
    const hiddenIcon = titleSpanContainer.querySelector('.tgico');
    expect(hiddenIcon?.textContent).not.toBe('');
    expect(hiddenIcon?.classList.contains('inline-icon')).toBe(true);
    expect(hiddenIcon?.classList.contains('inline-icon-right')).toBe(true);

    const mutedIcon = document.createElement('span');
    mutedIcon.classList.add('dialog-muted-icon');
    elements.get(peerId).dom.mutedIcon = mutedIcon;
    titleSpanContainer.append(mutedIcon);
    controller.setItems([hidden]);

    expect([...titleSpanContainer.children].indexOf(hiddenIcon))
    .toBeLessThan([...titleSpanContainer.children].indexOf(mutedIcon));

    controller.setItems([
      item(peerId, 'joined', dialog(peerId))
    ]);
    expect(titleSpanContainer.contains(hiddenIcon)).toBe(false);
    expect(manager.addListDialog).toHaveBeenCalledOnce();
  });

  it('keeps linked membership on dialog drop and stops updates on destroy', () => {
    const {manager, managers, elements} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const peerId = 1 as PeerId;
    const value = dialog(peerId);
    controller.setItems([item(peerId, 'viewable', value)]);

    rootScope.dispatchEventSingle('dialogs_multiupdate', new Map([
      [peerId, {dialog: value}]
    ]));
    expect(manager.setLastMessageN).toHaveBeenCalledWith({
      dialog: value,
      dialogElement: elements.get(peerId),
      setUnread: true
    });

    rootScope.dispatchEventSingle('dialog_drop', value);

    expect(manager.initDialog).toHaveBeenCalled();
    expect(controller.getDialogElement(peerId)).toBe(elements.get(peerId));

    controller.destroy();
    controller = undefined;
    manager.setLastMessageN.mockClear();
    rootScope.dispatchEventSingle('dialogs_multiupdate', new Map([
      [peerId, {dialog: value}]
    ]));

    expect(manager.setLastMessageN).not.toHaveBeenCalled();
  });

  it('uses the standard dialog click flow without intercepting it', () => {
    const {manager, managers, listListeners} = createFakeDialogsManager();
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    const joinedListener = listListeners.find(({list}) => {
      return list === controller.getList('joined');
    });

    expect(joinedListener).toEqual({
      list: controller.getList('joined'),
      withContext: true
    });
  });

  it('hydrates a viewable row with its latest service message', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    const serviceMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 7,
      date: 1,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;
    managers.appMessagesManager.loadConversationPreviews.mockResolvedValue([{
      peerId,
      lastMessage: serviceMessage
    }]);
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems([item(peerId, 'viewable')]);

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith({
        dialog: {
          _: 'dialog',
          peerId,
          pFlags: {}
        },
        dialogElement: elements.get(peerId),
        lastMessage: serviceMessage,
        setUnread: true
      });
    });
    expect(managers.appMessagesManager.loadConversationPreviews)
    .toHaveBeenCalledWith([peerId]);
  });

  it('renders a cached preview without waiting for the batched reload', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    const serviceMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 7,
      date: 1,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;
    let resolveReload: (previews: any[]) => void;
    const reloadGate = new Promise<any[]>((resolve) => {
      resolveReload = resolve;
    });
    managers.appMessagesManager.getConversationPreviews.mockResolvedValue([{
      peerId,
      lastMessage: serviceMessage
    }]);
    managers.appMessagesManager.loadConversationPreviews
    .mockReturnValue(reloadGate);
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems([item(peerId, 'viewable')]);

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith({
        dialog: {
          _: 'dialog',
          peerId,
          pFlags: {}
        },
        dialogElement: elements.get(peerId),
        lastMessage: serviceMessage,
        setUnread: true
      });
    });
    resolveReload([{peerId, lastMessage: serviceMessage}]);
    await reloadGate;
  });

  it('hydrates all viewable rows through one batched manager call', async() => {
    const {manager, managers} = createFakeDialogsManager();
    const peerIds = [2 as PeerId, 3 as PeerId];
    managers.appMessagesManager.loadConversationPreviews
    .mockImplementation(async(ids: PeerId[]) => ids.map((peerId) => ({
      peerId,
      lastMessage: {
        _: 'message',
        pFlags: {},
        peerId,
        mid: peerId,
        date: peerId,
        message: ''
      }
    })));
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems(peerIds.map((peerId) => item(peerId, 'viewable')));

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledTimes(2);
    });
    expect(managers.appMessagesManager.loadConversationPreviews)
    .toHaveBeenCalledOnce();
    expect(managers.appMessagesManager.loadConversationPreviews)
    .toHaveBeenCalledWith(peerIds);
    expect(managers.appMessagesManager.getConversationPreviews)
    .toHaveBeenCalledOnce();
    expect(managers.appMessagesManager.getConversationPreviews)
    .toHaveBeenCalledWith(peerIds);
  });

  it('uses a mirrored top message without another message request', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    const serviceMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 7,
      date: 1,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;
    const value = dialog(peerId, serviceMessage.mid);
    managers.appMessagesManager.getDialogOnly.mockResolvedValue(value);
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems([{
      ...item(peerId, 'viewable', value),
      lastMessage: serviceMessage
    }]);

    expect(manager.addListDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        dialog: value,
        lastMessage: serviceMessage,
        peerId
      })
    );
    expect(manager.setLastMessageN).not.toHaveBeenCalled();
    expect(managers.appMessagesManager.getDialogOnly).not.toHaveBeenCalled();
    expect(managers.appMessagesManager.getMessageByPeer)
    .not.toHaveBeenCalled();
    expect(managers.appMessagesManager.loadConversationPreviews)
    .not.toHaveBeenCalled();
    expect(managers.appMessagesManager.getConversationPreviews)
    .not.toHaveBeenCalled();
  });

  it('renders a cached service action for a viewable dialog top message', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    const serviceMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 7,
      date: 1,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;
    managers.appMessagesManager.getMessageByPeer
    .mockResolvedValue(serviceMessage);
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems([
      item(peerId, 'viewable', dialog(peerId, serviceMessage.mid))
    ]);

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith({
        dialog: expect.objectContaining({
          _: 'dialog',
          peerId
        }),
        dialogElement: elements.get(peerId),
        lastMessage: serviceMessage,
        setUnread: true
      });
    });
    expect(managers.appMessagesManager.loadConversationPreviews)
    .not.toHaveBeenCalled();
  });

  it('sorts viewable rows by their hydrated preview timestamps', async() => {
    const {manager, managers} = createFakeDialogsManager();
    const olderPeerId = 2 as PeerId;
    const newerPeerId = 3 as PeerId;
    managers.appMessagesManager.getMessageByPeer.mockImplementation(
      async(peerId: PeerId, mid: number) => ({
        _: 'message',
        pFlags: {},
        peerId,
        mid,
        date: peerId === newerPeerId ? 20 : 10,
        message: ''
      })
    );
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);

    controller.setItems([
      item(olderPeerId, 'viewable', dialog(olderPeerId, 7)),
      item(newerPeerId, 'viewable', dialog(newerPeerId, 8))
    ]);

    await vi.waitFor(() => {
      expect(
        controller.getList('viewable').firstElementChild?.getAttribute(
          'data-peer-id'
        )
      ).toBe(String(newerPeerId));
    });
  });

  it('refreshes a viewable preview from history events', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    controller.setItems([item(peerId, 'viewable')]);
    manager.setLastMessageN.mockClear();
    const serviceMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 8,
      date: 2,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;

    rootScope.dispatchEventSingle('history_append', {
      message: serviceMessage,
      storage: undefined
    } as any);

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith({
        dialog: {
          _: 'dialog',
          peerId,
          pFlags: {}
        },
        dialogElement: elements.get(peerId),
        lastMessage: serviceMessage,
        setUnread: true
      });
    });
  });

  it('renders a newer history event without waiting for the dialog worker', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    controller.setItems([item(peerId, 'viewable')]);
    await vi.waitFor(() => {
      expect(managers.appMessagesManager.loadConversationPreviews)
      .toHaveBeenCalled();
    });

    managers.appMessagesManager.getDialogOnly.mockReturnValue(
      new Promise(() => {})
    );
    const newerMessage = {
      _: 'message',
      pFlags: {},
      peerId,
      mid: 8,
      date: 2,
      message: 'newer'
    } as any;
    const olderMessage = {
      ...newerMessage,
      mid: 7,
      date: 1,
      message: 'older'
    };

    rootScope.dispatchEventSingle('history_append', {
      message: newerMessage,
      storage: undefined
    } as any);
    rootScope.dispatchEventSingle('history_append', {
      message: olderMessage,
      storage: undefined
    } as any);

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith({
        dialog: {
          _: 'dialog',
          peerId,
          pFlags: {}
        },
        dialogElement: elements.get(peerId),
        lastMessage: newerMessage,
        setUnread: true
      });
    });
    expect(managers.appMessagesManager.getDialogOnly).not.toHaveBeenCalled();
    expect(manager.setLastMessageN).not.toHaveBeenCalledWith(
      expect.objectContaining({lastMessage: olderMessage})
    );
  });

  it('rehydrates a viewable preview when its top message is deleted', async() => {
    const {manager, managers, elements} = createFakeDialogsManager();
    const peerId = 2 as PeerId;
    const deletedMessage = {
      _: 'messageService',
      pFlags: {},
      peerId,
      mid: 8,
      date: 2,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: 100
      }
    } as any;
    const replacementMessage = {
      ...deletedMessage,
      mid: 7,
      date: 1
    };
    managers.appMessagesManager.loadConversationPreviews
    .mockResolvedValueOnce([{
      peerId,
      lastMessage: deletedMessage
    }])
    .mockResolvedValueOnce([{
      peerId,
      lastMessage: replacementMessage
    }]);
    controller = new AutonomousCommunityDialogList({
      appDialogsManager: manager as any,
      communityId: 100 as ChatId,
      middleware: getMiddleware().get()
    });
    setManagers(managers);
    controller.setItems([item(peerId, 'viewable')]);
    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith(
        expect.objectContaining({lastMessage: deletedMessage})
      );
    });
    manager.setLastMessageN.mockClear();

    rootScope.dispatchEventSingle('history_delete', {
      peerId,
      msgs: new Set([deletedMessage.mid])
    });

    await vi.waitFor(() => {
      expect(manager.setLastMessageN).toHaveBeenCalledWith(
        expect.objectContaining({lastMessage: replacementMessage})
      );
    });
  });
});
