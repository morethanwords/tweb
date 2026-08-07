import {AppMessagesManager, HistoryType} from '@appManagers/appMessagesManager';
import getHistoryStorageKey from '@appManagers/utils/messages/getHistoryStorageKey';
import '@helpers/peerIdPolyfill';

describe('community message search', () => {
  test('routes through searchGlobal with a community and no folder', async() => {
    const invokeApiSingle = vi.fn().mockResolvedValue({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: []
    });
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      apiManager: {invokeApiSingle},
      appChatsManager: {
        getChannelInput: (communityId: ChatId) => ({
          _: 'inputChannel',
          channel_id: communityId,
          access_hash: `community-${communityId}`
        })
      },
      appPeersManager: {
        getInputPeerById: () => ({_: 'inputPeerEmpty'})
      },
      log: vi.fn(),
      saveApiResult: vi.fn()
    });

    await manager.requestHistory({
      communityId: 200 as ChatId,
      folderId: 0,
      historyType: HistoryType.Chat,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      limit: 20,
      query: 'needle'
    });

    expect(invokeApiSingle).toHaveBeenCalledWith(
      'messages.searchGlobal',
      expect.objectContaining({
        q: 'needle',
        folder_id: undefined,
        community: {
          _: 'inputChannel',
          channel_id: 200,
          access_hash: 'community-200'
        }
      }),
      {noErrorBox: true}
    );
  });

  test('skips peer restriction lookup only for peerless searches', async() => {
    const isPeerRestricted = vi.fn((peerId: PeerId) => {
      if(!peerId) {
        throw new Error('peerId is required');
      }

      return false;
    });
    const fillHistoryStorage = vi.fn().mockResolvedValue({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: []
    });
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appPeersManager: {isPeerRestricted},
      fillHistoryStorage
    });

    const search = (peerId?: PeerId, communityId?: ChatId) => manager.getHistory({
      peerId,
      communityId,
      historyStorage: {
        _maxId: 0,
        count: 0,
        key: 'search_0_empty_0',
        type: 'search',
        history: {
          slice: {
            getEnds: vi.fn().mockReturnValue(0)
          }
        },
        searchHistory: {
          sliceMe: vi.fn().mockReturnValue(undefined)
        }
      } as any,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      limit: 20,
      query: 'needle'
    });

    await search();
    await search(undefined, 200 as ChatId);

    expect(isPeerRestricted).not.toHaveBeenCalled();

    const peerId = 100 as PeerId;
    await search(peerId);

    expect(isPeerRestricted).toHaveBeenCalledOnce();
    expect(isPeerRestricted).toHaveBeenCalledWith(peerId);
    expect(fillHistoryStorage).toHaveBeenCalledTimes(3);
  });

  test('does not resolve chat migration for peerless community search', async() => {
    const getPeerMigratedTo = vi.fn((peerId: PeerId) => {
      if(!peerId) {
        throw new Error('peerId is required');
      }

      return peerId;
    });
    const requestHistory = vi.fn().mockResolvedValue({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: []
    });
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appPeersManager: {
        getPeerMigratedTo,
        isPeerRestricted: vi.fn()
      },
      middleware: {
        get: () => () => true
      },
      mergeHistoryResult: vi.fn().mockReturnValue({
        count: 0,
        isBottomEnd: true,
        isTopEnd: true,
        slice: [],
        messages: [],
        topWasMeantToLoad: 20,
        bottomWasMeantToLoad: 0,
        topLoaded: 0,
        bottomLoaded: 0
      }),
      requestHistory
    });

    const makeHistoryStorage = () => ({
      _maxId: 0,
      count: 0,
      key: 'search_inputMessagesFilterEmpty_needle_community-200',
      type: 'search',
      history: {
        slice: {
          getEnds: vi.fn().mockReturnValue(0)
        }
      },
      searchHistory: {
        sliceMe: vi.fn().mockReturnValue(undefined)
      }
    }) as any;

    const result = await manager.getHistory({
      communityId: 200 as ChatId,
      historyStorage: makeHistoryStorage(),
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      limit: 20,
      query: 'needle'
    });

    expect(getPeerMigratedTo).not.toHaveBeenCalled();
    expect(requestHistory).toHaveBeenCalledWith(expect.objectContaining({
      peerId: undefined,
      communityId: 200
    }));
    expect(result).toMatchObject({
      count: 0,
      history: [],
      messages: []
    });

    const peerId = 100 as PeerId;
    await manager.getHistory({
      peerId,
      historyStorage: makeHistoryStorage(),
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      limit: 20,
      query: 'needle'
    });

    expect(getPeerMigratedTo).toHaveBeenCalledOnce();
    expect(getPeerMigratedTo).toHaveBeenCalledWith(peerId);
  });

  test('separates community searches in the history storage key', () => {
    const common = {
      type: 'search' as const,
      inputFilter: {_: 'inputMessagesFilterEmpty' as const},
      query: 'needle'
    };

    expect(getHistoryStorageKey({...common, communityId: 200 as ChatId}))
    .not.toBe(getHistoryStorageKey({...common, communityId: 201 as ChatId}));
  });
});
