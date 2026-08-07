vi.mock('@lib/appImManager', () => ({
  default: {}
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {},
  AppDialogsManager: class {},
  DialogElement: class {}
}));

vi.mock('@components/archiveDialog', () => ({
  default: class {},
  createArchiveDialogState: vi.fn()
}));

vi.mock('@components/communities/communityDialog', () => ({
  createCommunityDialogListElement: vi.fn()
}));

vi.mock('@components/groupCallActiveIcon', () => ({
  default: vi.fn()
}));

vi.mock('@components/scrollable', () => ({
  default: class {}
}));

vi.mock('@components/singleTransition', () => ({
  default: vi.fn()
}));

vi.mock('@components/sortedDialogList', () => ({
  default: class {},
  CustomPinnedDialog: class {},
  CustomSortedDialog: class {}
}));

vi.mock('@environment/groupCallSupport', () => ({
  default: false
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {}
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {},
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }
}));

vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: class {}
}));

vi.mock('@lib/solidjs/runWithHotReloadGuard', () => ({
  runWithHotReloadGuard: (callback: () => unknown) => callback()
}));

vi.mock('@stores/communities', () => ({
  useCommunities: () => ({}),
  useCommunityDialogs: () => ({})
}));

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
});

import {Dialog} from '@appManagers/appMessagesManager';
import {AutonomousDialogListBase} from '@components/autonomousDialogList/base';
import {
  AutonomousDialogList,
  getCommunityProjectionFolderCountDelta
} from '@components/autonomousDialogList/dialogs';
import {FilterType} from '@lib/storages/dialogs';
import DialogsStorage from '@lib/storages/dialogs';
import '@helpers/peerIdPolyfill';


describe('Community dialog projection counts', () => {
  test('keeps first-load animations blocked through Community projection', async() => {
    const events: string[] = [];
    const baseLoad = vi.spyOn(
      AutonomousDialogListBase.prototype as any,
      'loadDialogsInner'
    ).mockImplementation(async() => {
      events.push('base-load');
      return {
        cursor: 1,
        count: 1,
        totalCount: 2
      };
    });
    const list = Object.create(AutonomousDialogList.prototype) as any;
    Object.assign(list, {
      sortedList: {
        blockAnimation: () => {
          events.push('block');
          return () => events.push('unblock');
        },
        itemsLength: () => 1
      },
      ensureArchiveDialogHydrated: vi.fn(),
      scheduleCommunityProjection: vi.fn(async() => {
        events.push('projection');
      })
    });

    try {
      await expect(list.loadDialogsInner({
        offsetIndex: 0,
        canFinish: () => true
      })).resolves.toMatchObject({totalCount: 1});
      expect(events).toEqual([
        'block',
        'base-load',
        'projection',
        'unblock'
      ]);
    } finally {
      baseLoad.mockRestore();
    }
  });

  test.each([true, false])(
    'keeps the normalized ordinary-dialog count when isEnd is %s',
    async(isEnd) => {
    const dialogs = [
      {peerId: 1 as PeerId},
      {peerId: 2 as PeerId}
    ] as Dialog[];
    const folder: {count: number} = {count: null};
    const storage = new DialogsStorage();

    Object.assign(storage as any, {
      appMessagesManager: {
        getTopMessages: vi.fn().mockResolvedValue({
          count: 2,
          isEnd
        })
      },
      appPeersManager: {
        isBotforum: () => false
      },
      cachedResults: {
        count: 0,
        dialogs: [],
        folderId: 0,
        query: ''
      },
      getDialogIndexKeyByFilterId: () => 'index_0',
      getFilterType: () => FilterType.Folder,
      getFolder: () => folder,
      getFolderDialogs: () => dialogs,
      getOffsetDate: () => 0,
      isDialogsLoaded: () => false,
      isFilterIdForForum: () => false,
      isVirtualFilter: () => false
    });

    const result = await storage.getDialogs({limit: 20});

      expect(result.count).toBe(2);
      expect(folder.count).toBe(2);
    }
  );

  test('keeps real-folder counts stable when a hidden chat is archived', () => {
    const peerId = (100 as ChatId).toPeerId(true);
    const previous = new Map<PeerId, number>([[peerId, 0]]);
    const next = new Map<PeerId, number>([[peerId, 1]]);

    expect(getCommunityProjectionFolderCountDelta(previous, next, 0)).toBe(-1);
    expect(getCommunityProjectionFolderCountDelta(previous, next, 1)).toBe(1);
  });

  test('does not alter folder counts for link or collapse transitions', () => {
    const peerId = (100 as ChatId).toPeerId(true);
    const empty = new Map<PeerId, number>();
    const projected = new Map<PeerId, number>([[peerId, 0]]);

    expect(getCommunityProjectionFolderCountDelta(empty, projected, 0)).toBe(0);
    expect(getCommunityProjectionFolderCountDelta(projected, empty, 0)).toBe(0);
  });
});
