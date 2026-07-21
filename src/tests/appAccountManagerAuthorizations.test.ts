import {afterEach, describe, expect, it, vi} from 'vitest';
import AppAccountManager, {
  applyUnconfirmedAuthorizationUpdate,
  filterExpiredUnconfirmedAuthorizations,
  UnconfirmedAuthorization
} from '@appManagers/appAccountManager';
import {Authorization, Update} from '@layer';
import type {State} from '@config/state';

const NOW = 1_000_000;

function makeUpdate(
  hash: string | number,
  unconfirmed: boolean,
  overrides: Partial<Update.updateNewAuthorization> = {}
): Update.updateNewAuthorization {
  return {
    _: 'updateNewAuthorization',
    pFlags: unconfirmed ? {unconfirmed: true} : {},
    hash,
    date: NOW,
    device: 'Safari on iPhone',
    location: 'Dubai, UAE',
    ...overrides
  };
}

function makeAuthorization(
  hash: string | number,
  unconfirmed: boolean,
  date = NOW
): Authorization.authorization {
  return {
    _: 'authorization',
    pFlags: unconfirmed ? {unconfirmed: true} : {},
    hash,
    device_model: 'MacBook Pro',
    platform: 'macOS',
    system_version: '15.0',
    api_id: 1,
    app_name: 'Telegram Web',
    app_version: '1.0',
    date_created: date,
    date_active: date,
    ip: '127.0.0.1',
    country: 'UAE',
    region: 'Dubai'
  };
}

async function makeManager(options: {
  saved?: UnconfirmedAuthorization[],
  period?: number,
  invokeApi?: ReturnType<typeof vi.fn>,
  beforeStateLoaded?: (
    rootListeners: Record<string, (...args: any[]) => void>,
    updateListeners: Partial<Record<Update['_'], (update: Update) => void>>
  ) => void
} = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);

  const manager = new AppAccountManager();
  const dispatchEvent = vi.fn();
  const pushToState = vi.fn();
  const invokeApi = options.invokeApi ?? vi.fn();
  const rootListeners: Record<string, (...args: any[]) => void> = {};
  let updateListeners: Partial<Record<Update['_'], (update: Update) => void>>;
  const state = {
    appConfig: {
      authorization_autoconfirm_period: options.period ?? 100
    },
    unconfirmedAuthorizations: options.saved ?? []
  } as State;

  Object.assign(manager as any, {
    apiManager: {invokeApi},
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: typeof updateListeners) => updateListeners = listeners
    },
    appStateManager: {
      getState: () => Promise.resolve(state),
      pushToState
    },
    rootScope: {
      addEventListener: (name: string, listener: (...args: any[]) => void) => rootListeners[name] = listener,
      dispatchEvent
    }
  });

  const initialized = (manager as any).after();
  options.beforeStateLoaded?.(rootListeners, updateListeners);
  await initialized;
  return {dispatchEvent, invokeApi, manager, pushToState, rootListeners, updateListeners};
}

afterEach(() => {
  vi.useRealTimers();
});

describe('unconfirmed authorizations', () => {
  it('upserts an unconfirmed update and removes it when the flag is cleared', () => {
    const initial = applyUnconfirmedAuthorizationUpdate([], makeUpdate(1, true));
    const replaced = applyUnconfirmedAuthorizationUpdate(initial, makeUpdate('1', true, {
      device: 'Telegram Desktop'
    }));

    expect(replaced).toEqual([{
      hash: '1',
      date: NOW,
      device: 'Telegram Desktop',
      location: 'Dubai, UAE'
    }]);
    expect(applyUnconfirmedAuthorizationUpdate(replaced, makeUpdate(1, false))).toEqual([]);
  });

  it('filters cached entries after the server autoconfirm period', () => {
    const authorizations: UnconfirmedAuthorization[] = [{
      hash: 1,
      date: NOW - 9,
      device: 'First',
      location: 'Dubai'
    }, {
      hash: 2,
      date: NOW - 10,
      device: 'Second',
      location: 'Berlin'
    }];

    expect(filterExpiredUnconfirmedAuthorizations(authorizations, 10, NOW)).toEqual([authorizations[0]]);
  });

  it('restores, persists and expires cached entries', async() => {
    const active: UnconfirmedAuthorization = {
      hash: 1,
      date: NOW - 5,
      device: 'Safari',
      location: 'Dubai'
    };
    const expired: UnconfirmedAuthorization = {
      hash: 2,
      date: NOW - 11,
      device: 'Chrome',
      location: 'Berlin'
    };
    const {dispatchEvent, manager, pushToState} = await makeManager({
      saved: [active, expired],
      period: 10
    });

    expect(manager.getUnconfirmedAuthorizations()).toEqual([active]);
    expect(pushToState).toHaveBeenCalledWith('unconfirmedAuthorizations', [active]);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(manager.getUnconfirmedAuthorizations()).toEqual([]);
    expect(dispatchEvent).toHaveBeenCalledWith('unconfirmed_authorizations_update', []);
  });

  it('does not erase persisted entries when app config arrives before state', async() => {
    const saved: UnconfirmedAuthorization = {
      hash: 1,
      date: NOW - 5,
      device: 'Safari',
      location: 'Dubai'
    };
    const {manager, pushToState} = await makeManager({
      saved: [saved],
      period: 100,
      beforeStateLoaded: (rootListeners) => {
        rootListeners.app_config({authorization_autoconfirm_period: 200});
      }
    });

    expect(manager.getUnconfirmedAuthorizations()).toEqual([saved]);
    expect(pushToState).not.toHaveBeenCalled();
  });

  it('applies updates received before persisted state finishes loading', async() => {
    const saved: UnconfirmedAuthorization = {
      hash: 1,
      date: NOW - 5,
      device: 'Safari',
      location: 'Dubai'
    };
    const {manager} = await makeManager({
      saved: [saved],
      beforeStateLoaded: (_rootListeners, updateListeners) => {
        updateListeners.updateNewAuthorization(makeUpdate(2, true));
      }
    });

    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([2, 1]);
  });

  it('refreshes unconfirmed sessions after user authentication', async() => {
    const invokeApi = vi.fn().mockResolvedValue({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(20, true)]
    });
    const {manager, rootListeners} = await makeManager({invokeApi});

    rootListeners.user_auth();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeApi).toHaveBeenCalledWith('account.getAuthorizations');
    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([20]);
  });

  it('persists updateNewAuthorization changes and broadcasts them', async() => {
    const {dispatchEvent, manager, pushToState, updateListeners} = await makeManager();

    updateListeners.updateNewAuthorization(makeUpdate(10, true));

    expect(manager.getUnconfirmedAuthorizations()).toEqual([{
      hash: 10,
      date: NOW,
      device: 'Safari on iPhone',
      location: 'Dubai, UAE'
    }]);
    expect(pushToState).toHaveBeenLastCalledWith(
      'unconfirmedAuthorizations',
      manager.getUnconfirmedAuthorizations()
    );
    expect(dispatchEvent).toHaveBeenLastCalledWith(
      'unconfirmed_authorizations_update',
      manager.getUnconfirmedAuthorizations()
    );

    updateListeners.updateNewAuthorization(makeUpdate(10, false));
    expect(manager.getUnconfirmedAuthorizations()).toEqual([]);
  });

  it('reconciles persisted reviews with account.getAuthorizations', async() => {
    const invokeApi = vi.fn().mockResolvedValue({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [
        makeAuthorization(10, false),
        makeAuthorization(20, true, NOW - 1)
      ]
    });
    const {manager} = await makeManager({invokeApi});

    await manager.getAuthorizations();

    expect(manager.getUnconfirmedAuthorizations()).toEqual([{
      hash: 20,
      date: NOW - 1,
      device: 'MacBook Pro, macOS',
      location: 'Dubai, UAE'
    }]);
  });

  it('deduplicates parallel authorizations requests', async() => {
    let resolveRequest: (value: any) => void;
    const response = new Promise<any>((resolve) => resolveRequest = resolve);
    const invokeApi = vi.fn().mockReturnValue(response);
    const {manager} = await makeManager({invokeApi});

    const firstRequest = manager.getAuthorizations();
    const secondRequest = manager.getAuthorizations();
    expect(invokeApi).toHaveBeenCalledTimes(1);
    resolveRequest({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(20, true)]
    });
    await Promise.all([firstRequest, secondRequest]);

    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([20]);
  });

  it('allows retrying authorizations after a failed request', async() => {
    const invokeApi = vi.fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(20, true)]
    });
    const {manager} = await makeManager({invokeApi});

    await expect(manager.getAuthorizations()).rejects.toThrow('network');
    await manager.getAuthorizations();

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([20]);
  });

  it('replays a new authorization update over an in-flight sessions response', async() => {
    let resolveRequest: (value: any) => void;
    const response = new Promise<any>((resolve) => resolveRequest = resolve);
    const invokeApi = vi.fn().mockReturnValue(response);
    const {manager, updateListeners} = await makeManager({invokeApi});

    const request = manager.getAuthorizations();
    updateListeners.updateNewAuthorization(makeUpdate(20, true));
    resolveRequest({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(10, true, NOW - 1)]
    });
    await request;

    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([20, 10]);
  });

  it('replays a confirmation update over an in-flight sessions response', async() => {
    let resolveRequest: (value: any) => void;
    const response = new Promise<any>((resolve) => resolveRequest = resolve);
    const invokeApi = vi.fn().mockReturnValue(response);
    const {manager, updateListeners} = await makeManager({invokeApi});

    const request = manager.getAuthorizations();
    updateListeners.updateNewAuthorization(makeUpdate(10, false));
    resolveRequest({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(10, true)]
    });
    await request;

    expect(manager.getUnconfirmedAuthorizations()).toEqual([]);
  });

  it('keeps a bulk sessions reset over an in-flight sessions response', async() => {
    let resolveRequest: (value: any) => void;
    const response = new Promise<any>((resolve) => resolveRequest = resolve);
    const invokeApi = vi.fn((method: string) => {
      return method === 'account.getAuthorizations' ? response : Promise.resolve(true);
    });
    const {manager} = await makeManager({invokeApi});

    const request = manager.getAuthorizations();
    await manager.resetAuthorizations();
    resolveRequest({
      _: 'account.authorizations',
      authorization_ttl_days: 30,
      authorizations: [makeAuthorization(10, true)]
    });
    await request;

    expect(invokeApi).toHaveBeenCalledWith('auth.resetAuthorizations');
    expect(manager.getUnconfirmedAuthorizations()).toEqual([]);
  });

  it('confirms or resets through the account manager before removing the review', async() => {
    const invokeApi = vi.fn().mockResolvedValue(true);
    const {manager, updateListeners} = await makeManager({invokeApi});
    updateListeners.updateNewAuthorization(makeUpdate(10, true));
    updateListeners.updateNewAuthorization(makeUpdate(20, true));

    await manager.confirmUnconfirmedAuthorization(20);
    expect(invokeApi).toHaveBeenCalledWith('account.changeAuthorizationSettings', {
      hash: 20,
      call_requests_disabled: undefined,
      encrypted_requests_disabled: undefined,
      confirmed: true
    });
    expect(manager.getUnconfirmedAuthorizations().map(({hash}) => hash)).toEqual([10]);

    await manager.resetAuthorization(10);
    expect(invokeApi).toHaveBeenCalledWith('account.resetAuthorization', {hash: 10});
    expect(manager.getUnconfirmedAuthorizations()).toEqual([]);
  });
});
