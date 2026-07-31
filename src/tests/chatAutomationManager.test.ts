import AppBusinessManager from '@appManagers/appBusinessManager';
import '@helpers/peerIdPolyfill';
import {AccountConnectedBots, ConnectedBot, Updates} from '@layer';

function makeConnectedBot(botId: UserId, device: string): ConnectedBot.connectedBot {
  return {
    _: 'connectedBot',
    bot_id: botId,
    recipients: {
      _: 'businessBotRecipients',
      pFlags: {}
    },
    rights: {
      _: 'businessBotRights',
      pFlags: {}
    },
    device,
    date: 1_000,
    location: 'Dubai'
  };
}

function makeConnectedBotsResult(connectedBot?: ConnectedBot.connectedBot): AccountConnectedBots.accountConnectedBots {
  return {
    _: 'account.connectedBots',
    connected_bots: connectedBot ? [connectedBot] : [],
    users: []
  };
}

function makeManager(apiManager: {
  invokeApiSingleProcess: ReturnType<typeof vi.fn>,
  invokeApiSingle?: ReturnType<typeof vi.fn>
}) {
  const manager = new AppBusinessManager();
  Object.assign(manager, {
    apiManager,
    apiUpdatesManager: {
      processUpdateMessage: vi.fn()
    },
    appPeersManager: {
      saveApiPeers: vi.fn(),
      getInputPeerById: vi.fn(() => ({_: 'inputPeerUser'}))
    },
    appUsersManager: {
      getUserInput: vi.fn((userId: UserId) => ({
        _: 'inputUser',
        user_id: userId,
        access_hash: `hash-${userId}`
      }))
    },
    rootScope: {
      dispatchEvent: vi.fn()
    },
    appProfileManager: {
      modifyCachedPeerSettings: vi.fn(),
      refreshPeerSettings: vi.fn().mockResolvedValue(undefined)
    }
  });
  return manager;
}

async function makeReviewManager(options: {
  saved: Array<{botId: UserId, date: number}>,
  period: number
}) {
  const rootListeners: Record<string, (...args: any[]) => void> = {};
  const pushToState = vi.fn();
  const manager = new AppBusinessManager();
  const state = {
    appConfig: {authorization_autoconfirm_period: options.period},
    botConnectionReviews: options.saved
  };

  Object.assign(manager as any, {
    apiUpdatesManager: {
      addMultipleEventsListeners: vi.fn()
    },
    appStateManager: {
      getState: vi.fn().mockResolvedValue(state),
      pushToState
    },
    rootScope: {
      addEventListener: (name: string, listener: (...args: any[]) => void) => {
        rootListeners[name] = listener;
      },
      dispatchEvent: vi.fn()
    },
    timeManager: {
      getServerTimeOffset: () => 0
    },
    refreshConnectedBot: vi.fn()
  });

  await (manager as any).after();
  return {manager, pushToState, rootListeners};
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AppBusinessManager chat automation', () => {
  test('uses the fallback review period for zero and reschedules on app config updates', async() => {
    const now = 1_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    const review = {botId: 10 as UserId, date: now - 10};
    const {manager, pushToState, rootListeners} = await makeReviewManager({
      saved: [review],
      period: 0
    });

    expect((manager as any).botConnectionReviews).toEqual([review]);

    rootListeners.app_config({authorization_autoconfirm_period: 20});
    await vi.advanceTimersByTimeAsync(10_000);

    expect((manager as any).botConnectionReviews).toEqual([]);
    expect(pushToState).toHaveBeenLastCalledWith('botConnectionReviews', []);
  });

  test('forces an overwritten request and ignores an older response that finishes last', async() => {
    const pending: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pending.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const staleBot = makeConnectedBot(10, 'Old browser');
    const currentBot = makeConnectedBot(20, 'Current browser');

    const staleRequest = manager.getConnectedBot();
    const currentRequest = manager.getConnectedBot(true);

    expect(pending[1].request.options).toEqual({overwrite: true});

    pending[1].resolve(makeConnectedBotsResult(currentBot));
    await expect(currentRequest).resolves.toEqual(currentBot);

    pending[0].resolve(makeConnectedBotsResult(staleBot));
    await expect(staleRequest).resolves.toEqual(currentBot);
    await expect(manager.getConnectedBot()).resolves.toEqual(currentBot);
    expect((manager as any).appPeersManager.saveApiPeers).toHaveBeenCalledTimes(1);
  });

  test('keeps an older response pending until the overwritten request finishes', async() => {
    const pending: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pending.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const staleRequest = manager.getConnectedBot();
    const currentRequest = manager.getConnectedBot(true);
    const currentBot = makeConnectedBot(20, 'Current browser');
    let staleSettled = false;
    staleRequest.finally(() => staleSettled = true);

    pending[0].resolve(makeConnectedBotsResult(makeConnectedBot(10, 'Old browser')));
    await Promise.resolve();
    await Promise.resolve();
    expect(staleSettled).toBe(false);

    pending[1].resolve(makeConnectedBotsResult(currentBot));
    await expect(staleRequest).resolves.toEqual(currentBot);
    await expect(currentRequest).resolves.toEqual(currentBot);
  });

  test('propagates an overwritten request failure to the older caller', async() => {
    const pending: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void,
      reject: (error: Error) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve, reject) => {
        pending.push({request, resolve, reject});
      }).then((result) => request.processResult(result));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const staleRequest = manager.getConnectedBot();
    const currentRequest = manager.getConnectedBot(true);
    const currentError = new Error('current request failed');
    const currentExpectation = expect(currentRequest).rejects.toBe(currentError);
    const staleExpectation = expect(staleRequest).rejects.toBe(currentError);

    pending[1].reject(currentError);
    await currentExpectation;
    pending[0].resolve(makeConnectedBotsResult(makeConnectedBot(10, 'Old browser')));

    await staleExpectation;
    expect((manager as any).connectedBot).toBeUndefined();
    expect((manager as any).appPeersManager.saveApiPeers).not.toHaveBeenCalled();
  });

  test.each([
    ['confirm', (manager: AppBusinessManager, botId: UserId) => manager.confirmBotConnection(botId)],
    ['reject', (manager: AppBusinessManager, botId: UserId) => manager.rejectBotConnection(botId)]
  ])('keeps the review when %s preflight finds another connected bot', async(_name, action) => {
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      return request.processResult(makeConnectedBotsResult(makeConnectedBot(20, 'Current browser')));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const review = {botId: 10, device: 'Unknown browser'};
    (manager as any).botConnectionReviews = [review];

    await expect(action(manager, 10)).resolves.toBe(false);
    expect((manager as any).botConnectionReviews).toEqual([review]);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);
  });

  test('refetches canonical connection metadata after replacing a bot', async() => {
    const originalBot = makeConnectedBot(10, 'Old browser');
    const canonicalBot = makeConnectedBot(20, 'Chrome on macOS');
    const updates: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 1_000,
      seq: 1
    };
    let getCount = 0;
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      if(request.method === 'account.updateConnectedBot') {
        return request.processResult(updates);
      }

      return request.processResult(makeConnectedBotsResult(++getCount === 1 ? originalBot : canonicalBot));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const recipients = canonicalBot.recipients;
    const rights = canonicalBot.rights;

    await manager.updateConnectedBot({
      botId: 20,
      previousBotId: 10,
      recipients,
      rights
    });

    expect(invokeApiSingleProcess).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'account.getConnectedBots',
      options: {overwrite: true}
    }));
    expect((manager as any).connectedBot).toEqual(canonicalBot);
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenCalledWith(
      'chat_automation_update',
      canonicalBot
    );
  });

  test('keeps a successful update committed when the canonical refetch fails', async() => {
    const originalBot = makeConnectedBot(10, 'Old browser');
    const updates: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 1_000,
      seq: 1
    };
    let getCount = 0;
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      if(request.method === 'account.updateConnectedBot') {
        return request.processResult(updates);
      }
      if(++getCount === 1) {
        return request.processResult(makeConnectedBotsResult(originalBot));
      }

      throw new Error('network unavailable');
    });
    const manager = makeManager({invokeApiSingleProcess});
    const optimisticBot = makeConnectedBot(20, '');

    await expect(manager.updateConnectedBot({
      botId: 20,
      previousBotId: 10,
      recipients: optimisticBot.recipients,
      rights: optimisticBot.rights
    })).resolves.toBeUndefined();
    expect((manager as any).connectedBot).toMatchObject({
      _: 'connectedBot',
      bot_id: 20,
      recipients: optimisticBot.recipients,
      rights: optimisticBot.rights
    });
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenCalledWith(
      'chat_automation_update',
      expect.objectContaining({bot_id: 20})
    );
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(4);
  });

  test('propagates an exact username lookup failure', async() => {
    const manager = makeManager({invokeApiSingleProcess: vi.fn()});
    const error = new Error('network unavailable');
    Object.assign((manager as any).appUsersManager, {
      resolveUsername: vi.fn().mockRejectedValue(error)
    });

    await expect(manager.searchBusinessBots('automation_bot')).rejects.toBe(error);
  });

  test('reconciles a successful peer revoke after an overlapping stale read', async() => {
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    let resolveDisable: (value: boolean) => void;
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const invokeApiSingle = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveDisable = resolve;
    }));
    const manager = makeManager({
      invokeApiSingleProcess,
      invokeApiSingle
    });
    const originalBot = makeConnectedBot(10, 'Old browser');
    originalBot.recipients.users = [30];
    const revokedBot = makeConnectedBot(10, 'Old browser');
    revokedBot.recipients.exclude_users = [30];
    (manager as any).connectedBot = originalBot;

    const revoke = manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(1));

    const staleRead = manager.getConnectedBot(true);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));
    pendingGets[0].resolve(makeConnectedBotsResult(originalBot));
    pendingGets[1].resolve(makeConnectedBotsResult(originalBot));
    await expect(staleRead).resolves.toMatchObject({
      recipients: {
        users: undefined,
        exclude_users: [30]
      }
    });

    await vi.waitFor(() => expect(invokeApiSingle).toHaveBeenCalledTimes(1));
    resolveDisable(true);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(3));
    pendingGets[2].resolve(makeConnectedBotsResult(revokedBot));

    await expect(revoke).resolves.toBe(true);
    expect((manager as any).connectedBot).toEqual(revokedBot);
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenLastCalledWith(
      'chat_automation_update',
      revokedBot
    );
  });

  test('keeps a later queued revoke while an earlier failed revoke reconciles', async() => {
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const pendingDisables: Array<{
      resolve: (value: boolean) => void,
      reject: (error: Error) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const invokeApiSingle = vi.fn(() => new Promise<boolean>((resolve, reject) => {
      pendingDisables.push({resolve, reject});
    }));
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const originalBot = makeConnectedBot(10, 'Browser');
    originalBot.recipients.users = [30, 40];
    const secondRevokedBot = makeConnectedBot(10, 'Browser');
    secondRevokedBot.recipients.users = [30];
    secondRevokedBot.recipients.exclude_users = [40];
    (manager as any).connectedBot = originalBot;

    const firstRevoke = manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10);
    const secondRevoke = manager.disablePeerConnectedBot((40 as UserId).toPeerId(false), 10);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(1));
    pendingGets[0].resolve(makeConnectedBotsResult(originalBot));
    await vi.waitFor(() => expect(pendingDisables).toHaveLength(1));

    pendingDisables[0].reject(new Error('first revoke failed'));
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));
    pendingGets[1].resolve(makeConnectedBotsResult(originalBot));

    await expect(firstRevoke).rejects.toThrow('first revoke failed');
    await vi.waitFor(() => expect(pendingGets).toHaveLength(3));
    expect((manager as any).connectedBot).toMatchObject({
      recipients: {
        users: [30],
        exclude_users: [40]
      }
    });

    pendingGets[2].resolve(makeConnectedBotsResult(originalBot));
    await vi.waitFor(() => expect(pendingDisables).toHaveLength(2));
    pendingDisables[1].resolve(true);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(4));
    pendingGets[3].resolve(makeConnectedBotsResult(secondRevokedBot));

    await expect(secondRevoke).resolves.toBe(true);
    expect((manager as any).connectedBot).toEqual(secondRevokedBot);
  });

  test('does not revoke a replacement bot queued behind an older bot update', async() => {
    const canonicalBot = makeConnectedBot(20, 'New browser');
    const updates: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 1_000,
      seq: 1
    };
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      if(request.method === 'account.updateConnectedBot') {
        return Promise.resolve(request.processResult(updates));
      }

      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const invokeApiSingle = vi.fn();
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const originalBot = makeConnectedBot(10, 'Old browser');
    (manager as any).connectedBot = originalBot;

    const replace = manager.updateConnectedBot({
      botId: 20,
      previousBotId: 10,
      recipients: canonicalBot.recipients,
      rights: canonicalBot.rights
    });
    const staleRevoke = manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(1));
    pendingGets[0].resolve(makeConnectedBotsResult(originalBot));
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));
    pendingGets[1].resolve(makeConnectedBotsResult(canonicalBot));

    await expect(replace).resolves.toBeUndefined();
    await vi.waitFor(() => expect(pendingGets).toHaveLength(3));
    pendingGets[2].resolve(makeConnectedBotsResult(canonicalBot));
    await expect(staleRevoke).resolves.toBe(true);
    expect(invokeApiSingle).not.toHaveBeenCalled();
    expect((manager as any).connectedBot).toEqual(canonicalBot);
  });

  test('treats a peer revoke queued behind bot removal as already complete', async() => {
    const updates: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 1_000,
      seq: 1
    };
    let getCount = 0;
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      if(request.method === 'account.updateConnectedBot') {
        return request.processResult(updates);
      }

      return request.processResult(makeConnectedBotsResult(++getCount === 1 ? originalBot : undefined));
    });
    const invokeApiSingle = vi.fn();
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const originalBot = makeConnectedBot(10, 'Old browser');
    (manager as any).connectedBot = originalBot;

    const remove = manager.updateConnectedBot({previousBotId: 10});
    const staleRevoke = manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10);

    await expect(remove).resolves.toBeUndefined();
    await expect(staleRevoke).resolves.toBe(true);
    expect(invokeApiSingle).not.toHaveBeenCalled();
    expect((manager as any).connectedBot).toBeUndefined();
  });

  test('does not pause a replacement bot from a stale chat plate', async() => {
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const invokeApiSingle = vi.fn();
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const staleBot = makeConnectedBot(10, 'Old browser');
    const replacementBot = makeConnectedBot(20, 'New browser');
    (manager as any).connectedBotBase = staleBot;
    (manager as any).connectedBot = staleBot;

    const pendingRefresh = manager.getConnectedBot(true);
    const toggle = manager.toggleConnectedBotPaused((30 as UserId).toPeerId(false), true, 10);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));

    pendingGets[0].resolve(makeConnectedBotsResult(replacementBot));
    expect(invokeApiSingle).not.toHaveBeenCalled();
    pendingGets[1].resolve(makeConnectedBotsResult(replacementBot));

    await expect(pendingRefresh).resolves.toEqual(replacementBot);
    await expect(toggle).rejects.toThrow('CONNECTED_BOT_CHANGED');
    expect(invokeApiSingle).not.toHaveBeenCalled();
    expect((manager as any).appProfileManager.modifyCachedPeerSettings).not.toHaveBeenCalled();
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenLastCalledWith(
      'chat_automation_update',
      replacementBot
    );
  });

  test('does not run a bot-less action when the latest principal read fails', async() => {
    const pendingGets: Array<{
      request: any,
      reject: (error: Error) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((_resolve, reject) => {
        pendingGets.push({request, reject});
      }).then((result) => request.processResult(result));
    });
    const invokeApiSingle = vi.fn();
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const cachedBot = makeConnectedBot(10, 'Cached browser');
    (manager as any).connectedBotBase = cachedBot;
    (manager as any).connectedBot = cachedBot;

    const toggle = manager.toggleConnectedBotPaused((30 as UserId).toPeerId(false), true, 10);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(1));
    const publicRead = manager.getConnectedBot(true);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));
    const currentError = new Error('current principal read failed');
    const currentExpectation = expect(publicRead).rejects.toBe(currentError);
    const toggleExpectation = expect(toggle).rejects.toBe(currentError);

    pendingGets[1].reject(currentError);
    await currentExpectation;
    pendingGets[0].reject(new Error('stale principal read failed'));

    await toggleExpectation;
    expect(invokeApiSingle).not.toHaveBeenCalled();
  });

  test('does not mutate peer settings when pausing is rejected by the server', async() => {
    const connectedBot = makeConnectedBot(10, 'Browser');
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      return request.processResult(makeConnectedBotsResult(connectedBot));
    });
    const invokeApiSingle = vi.fn().mockResolvedValue(false);
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});

    await expect(
      manager.toggleConnectedBotPaused((30 as UserId).toPeerId(false), true, 10)
    ).rejects.toThrow('ACCOUNT_TOGGLE_CONNECTED_BOT_PAUSED_FAILED');
    expect((manager as any).appProfileManager.modifyCachedPeerSettings).not.toHaveBeenCalled();
  });

  test('forces a peer settings refresh when an overlapping read has evicted the cache', async() => {
    const connectedBot = makeConnectedBot(10, 'Browser');
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      return request.processResult(makeConnectedBotsResult(connectedBot));
    });
    const invokeApiSingle = vi.fn().mockResolvedValue(true);
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    const peerId = (30 as UserId).toPeerId(false);
    const profileManager = (manager as any).appProfileManager;
    profileManager.modifyCachedPeerSettings.mockReturnValue(false);

    await expect(
      manager.toggleConnectedBotPaused(peerId, true, 10)
    ).resolves.toBe(true);

    expect(profileManager.modifyCachedPeerSettings).toHaveBeenCalledWith(peerId, expect.any(Function));
    expect(profileManager.refreshPeerSettings).toHaveBeenCalledWith(peerId);
  });

  test('rolls back a failed revoke even when both reconciliation reads fail', async() => {
    const originalBot = makeConnectedBot(10, 'Browser');
    originalBot.recipients.users = [30];
    let getCount = 0;
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      if(++getCount === 1) {
        return request.processResult(makeConnectedBotsResult(originalBot));
      }

      throw new Error('network unavailable');
    });
    const invokeApiSingle = vi.fn().mockResolvedValue(false);
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    (manager as any).connectedBotBase = originalBot;
    (manager as any).connectedBot = originalBot;

    await expect(
      manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10)
    ).rejects.toThrow('ACCOUNT_DISABLE_PEER_CONNECTED_BOT_FAILED');
    await vi.waitFor(() => expect(invokeApiSingleProcess).toHaveBeenCalledTimes(3));

    expect((manager as any).connectedBot).toEqual(originalBot);
    expect((manager as any).pendingConnectedBotPeerRevokes.size).toBe(0);
  });

  test('accepts a later canonical read after two revoke reconciliation failures', async() => {
    const originalBot = makeConnectedBot(10, 'Browser');
    originalBot.recipients.users = [30];
    let getCount = 0;
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      ++getCount;
      if(getCount === 2 || getCount === 3) {
        throw new Error('network unavailable');
      }

      return request.processResult(makeConnectedBotsResult(originalBot));
    });
    const invokeApiSingle = vi.fn().mockResolvedValue(true);
    const manager = makeManager({invokeApiSingleProcess, invokeApiSingle});
    (manager as any).connectedBotBase = originalBot;
    (manager as any).connectedBot = originalBot;

    await expect(
      manager.disablePeerConnectedBot((30 as UserId).toPeerId(false), 10)
    ).resolves.toBe(true);
    await vi.waitFor(() => expect(invokeApiSingleProcess).toHaveBeenCalledTimes(3));
    expect((manager as any).connectedBot).toMatchObject({
      recipients: {
        users: undefined,
        exclude_users: [30]
      }
    });

    await expect(manager.getConnectedBot(true)).resolves.toEqual(originalBot);
    expect((manager as any).connectedBot).toEqual(originalBot);
    expect((manager as any).pendingConnectedBotPeerRevokes.size).toBe(0);
  });

  test('does not clear a revoke confirmed after a canonical request started', async() => {
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const invokeApiSingleProcess = vi.fn((request: any) => {
      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const canonicalBot = makeConnectedBot(10, 'Browser');
    canonicalBot.recipients.users = [40];
    canonicalBot.recipients.exclude_users = [30];
    (manager as any).pendingConnectedBotPeerRevokes.set(1, {
      botId: 10,
      userId: 30,
      confirmed: true
    });

    const read = manager.getConnectedBot(true);
    (manager as any).pendingConnectedBotPeerRevokes.set(2, {
      botId: 10,
      userId: 40,
      confirmed: true
    });
    pendingGets[0].resolve(makeConnectedBotsResult(canonicalBot));

    await expect(read).resolves.toMatchObject({
      recipients: {
        users: undefined,
        exclude_users: [30, 40]
      }
    });
    expect([...(manager as any).pendingConnectedBotPeerRevokes.keys()]).toEqual([2]);
  });

  test('keeps a later public canonical result over an update reconciliation response', async() => {
    const pendingGets: Array<{
      request: any,
      resolve: (result: AccountConnectedBots.accountConnectedBots) => void
    }> = [];
    const updates: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 1_000,
      seq: 1
    };
    const invokeApiSingleProcess = vi.fn((request: any) => {
      if(request.method === 'account.updateConnectedBot') {
        return Promise.resolve(request.processResult(updates));
      }

      return new Promise<AccountConnectedBots.accountConnectedBots>((resolve) => {
        pendingGets.push({request, resolve});
      }).then((result) => request.processResult(result));
    });
    const manager = makeManager({invokeApiSingleProcess});
    const originalBot = makeConnectedBot(10, 'Original browser');
    const updateResult = makeConnectedBot(10, 'Update response');
    const laterResult = makeConnectedBot(20, 'Later public response');

    const update = manager.updateConnectedBot({
      botId: 10,
      previousBotId: 10,
      recipients: updateResult.recipients,
      rights: updateResult.rights
    });
    await vi.waitFor(() => expect(pendingGets).toHaveLength(1));
    pendingGets[0].resolve(makeConnectedBotsResult(originalBot));
    await vi.waitFor(() => expect(pendingGets).toHaveLength(2));

    const publicRead = manager.getConnectedBot(true);
    await vi.waitFor(() => expect(pendingGets).toHaveLength(3));
    pendingGets[2].resolve(makeConnectedBotsResult(laterResult));
    await expect(publicRead).resolves.toEqual(laterResult);
    pendingGets[1].resolve(makeConnectedBotsResult(updateResult));

    await expect(update).resolves.toBeUndefined();
    expect((manager as any).connectedBot).toEqual(laterResult);
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenLastCalledWith(
      'chat_automation_update',
      laterResult
    );
  });

  test('rejects a stale editor save before updating the replacement bot', async() => {
    const replacementBot = makeConnectedBot(20, 'New browser');
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      return request.processResult(makeConnectedBotsResult(replacementBot));
    });
    const manager = makeManager({invokeApiSingleProcess});

    await expect(manager.updateConnectedBot({
      botId: 10,
      previousBotId: 10,
      recipients: makeConnectedBot(10, 'Old browser').recipients,
      rights: makeConnectedBot(10, 'Old browser').rights
    })).rejects.toThrow('CONNECTED_BOT_CHANGED');
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);
    expect(invokeApiSingleProcess).not.toHaveBeenCalledWith(
      expect.objectContaining({method: 'account.updateConnectedBot'})
    );
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenLastCalledWith(
      'chat_automation_update',
      replacementBot
    );
  });
});
