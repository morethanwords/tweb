const {invoke} = vi.hoisted(() => ({
  invoke: vi.fn((..._args: any[]): Promise<any> => Promise.resolve('ok'))
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {invoke}
}));

vi.mock('@config/debug', () => ({
  DEBUG: false,
  MOUNT_CLASS_TO: {},
  default: false
}));

import getProxiedManagers, {createProxiedManagersForAccount, getAccountManagers, getOtherAccountManagers} from '@lib/getProxiedManagers';
import {bindManagersToSession, getSessionOf} from '@lib/accounts/bindManagersToAccount';
import {getAccountSession, isSessionLeaving, setAccountSwitchingTo, setCurrentAccount} from '@lib/accounts/getCurrentAccount';

describe('proxied app managers', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(() => Promise.resolve('ok'));
    setCurrentAccount(1);
    setAccountSwitchingTo(undefined);
  });

  test('does not turn Promise and JSON introspection into worker manager calls', () => {
    const managers = createProxiedManagersForAccount(1);
    const draftsManager = managers.appDraftsManager;

    expect((managers as any).then).toBeUndefined();
    expect((managers as any).toJSON).toBeUndefined();
    expect((draftsManager as any).then).toBeUndefined();
    expect((draftsManager as any).toJSON).toBeUndefined();
    expect(JSON.stringify({managers, draftsManager})).toBe(
      '{"managers":{"acknowledged":{},"all":{},"appDraftsManager":{}},"draftsManager":{}}'
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  test('continues forwarding real manager methods', async() => {
    const managers = getProxiedManagers();

    await managers.appDraftsManager.getDraft(123 as PeerId);

    expect(invoke).toHaveBeenCalledWith('manager', {
      name: 'appDraftsManager',
      method: 'getDraft',
      args: [123],
      accountNumber: 1
    }, false);
  });

  test('the current-account proxy follows an account switch, a captured manager too', async() => {
    const draftsManager = getProxiedManagers().appDraftsManager;
    setCurrentAccount(2);

    await draftsManager.getDraft(123 as PeerId);

    expect(invoke.mock.calls[0][1].accountNumber).toBe(2);
  });

  test('a result that arrives after the switch is dropped as MIDDLEWARE', async() => {
    let resolve: (value: any) => void;
    invoke.mockImplementation(() => new Promise((r) => resolve = r));
    const promise = getProxiedManagers().appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    resolve('draft of account 1');

    await expect(promise).rejects.toMatchObject({type: 'MIDDLEWARE'});
  });

  test('an acknowledged result is dropped as well', async() => {
    let resolve: (value: any) => void;
    invoke.mockImplementation(() => Promise.resolve({
      cached: false,
      result: new Promise((r) => resolve = r)
    }));
    const acked = await getProxiedManagers().acknowledged.appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    resolve('draft of account 1');

    await expect(acked.result).rejects.toMatchObject({type: 'MIDDLEWARE'});
  });

  test('a proxy for an explicit account and the all-accounts proxy are not affected', async() => {
    const managers = createProxiedManagersForAccount(3);
    const promise = managers.appDraftsManager.getDraft(123 as PeerId);
    const allPromise = getProxiedManagers().all.appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);

    await expect(promise).resolves.toBe('ok');
    await expect(allPromise).resolves.toBe('ok');
    expect(invoke.mock.calls[0][1].accountNumber).toBe(3);
    expect(invoke.mock.calls[1][1].accountNumber).toBeUndefined();
  });

  test('managers of a screen that is gone send what it asks, and drop what comes back', async() => {
    let alive = true;
    let resolve: (value: any) => void;
    invoke.mockImplementation(() => new Promise((r) => resolve = r));
    const managers = createProxiedManagersForAccount(1, () => alive);

    const promise = managers.appDraftsManager.getDraft(123 as PeerId);
    alive = false;
    resolve('draft');

    await expect(promise).rejects.toMatchObject({type: 'MIDDLEWARE'});
    // * the request went out all the same, to the account the managers are bound to
    expect(invoke.mock.calls[0][1]).toMatchObject({method: 'getDraft', accountNumber: 1});

    // * while it is there, results land - whichever account the tab shows
    alive = true;
    setCurrentAccount(2);
    invoke.mockImplementation(() => Promise.resolve('ok'));
    await expect(managers.appDraftsManager.getDraft(123 as PeerId)).resolves.toBe('ok');
  });

  test('a session\'s managers keep to its account, and do nothing once the tab has switched to another', async() => {
    const managers = bindManagersToSession(getProxiedManagers());
    await managers.appDraftsManager.getDraft(123 as PeerId);
    expect(invoke.mock.calls[0][1].accountNumber).toBe(1);

    setCurrentAccount(2);
    // * an action that waited through the switch stops at its next call: nothing reaches either account
    await expect(managers.appDraftsManager.clearAllDrafts()).rejects.toMatchObject({type: 'MIDDLEWARE'});
    await expect(managers.acknowledged.appDraftsManager.getDraft(123 as PeerId)).rejects.toMatchObject({type: 'MIDDLEWARE'});
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test('what comes back to a session\'s managers after the switch is dropped', async() => {
    let resolve: (value: any) => void;
    invoke.mockImplementation(() => new Promise((r) => resolve = r));
    const promise = bindManagersToSession(getProxiedManagers()).appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    resolve('draft of account 1');

    await expect(promise).rejects.toMatchObject({type: 'MIDDLEWARE'});
  });

  test('an error that comes back after the switch is dropped too: nobody acts on it with a retry', async() => {
    const rejects: ((err: any) => void)[] = [];
    invoke.mockImplementation(() => new Promise((_, r) => rejects.push(r)));
    const managers = bindManagersToSession(getProxiedManagers());
    const promise = managers.appDraftsManager.getDraft(123 as PeerId);
    const tabPromise = getProxiedManagers().appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    rejects.forEach((reject) => reject({type: 'FORM_EXPIRED'}));

    await expect(promise).rejects.toMatchObject({type: 'MIDDLEWARE'});
    await expect(tabPromise).rejects.toMatchObject({type: 'MIDDLEWARE'});

    // * while the session lasts, the error reaches whoever asked
    invoke.mockImplementation(() => Promise.reject({type: 'FORM_EXPIRED'}));
    await expect(getProxiedManagers().appDraftsManager.getDraft(123 as PeerId)).rejects.toMatchObject({type: 'FORM_EXPIRED'});
  });

  test('an acknowledgement that comes after the switch is dropped, and its result left to nobody unhandled', async() => {
    let acknowledge: (value: any) => void;
    invoke.mockImplementation(() => new Promise((r) => acknowledge = r));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    const promise = bindManagersToSession(getProxiedManagers()).acknowledged.appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    let failResult: (err: any) => void;
    acknowledge({cached: false, result: new Promise((_, reject) => failResult = reject)});
    await expect(promise).rejects.toMatchObject({type: 'MIDDLEWARE'});

    failResult({type: 'FILE_REFERENCE_EXPIRED'});
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });

  test('the tab\'s managers bind to the session it is in: one set a session, a new one after the switch', () => {
    const tabManagers = getProxiedManagers();
    const first = bindManagersToSession(tabManagers);
    expect(bindManagersToSession(tabManagers)).toBe(first);
    // * a session's own, and managers tied to an account for good, stay as they are
    expect(bindManagersToSession(first)).toBe(first);
    const forGood = createProxiedManagersForAccount(3);
    expect(bindManagersToSession(forGood)).toBe(forGood);
    expect(getSessionOf(first)).toBe(getAccountSession());
    expect(getSessionOf(forGood)).toBeUndefined();

    const session = getAccountSession();
    setCurrentAccount(2);
    const second = bindManagersToSession(tabManagers);
    expect(second).not.toBe(first);
    expect(session.ended).toBe(true);
    expect(getSessionOf(second)).toMatchObject({accountNumber: 2, ended: false});
  });

  test('a session is on its way out once a switch from it to another account runs', () => {
    const session = getAccountSession();
    expect(isSessionLeaving(session)).toBe(false);

    setAccountSwitchingTo(2);
    expect(isSessionLeaving(session)).toBe(true);

    // * the session of the account switched to is not
    setCurrentAccount(2);
    expect(isSessionLeaving(getAccountSession())).toBe(false);
    setAccountSwitchingTo(undefined);
    expect(isSessionLeaving(session)).toBe(true);
  });

  test('an account\'s own managers, one set for good: what they asked for still lands after a switch', async() => {
    expect(getAccountManagers(1)).toBe(getAccountManagers(1));
    expect(getOtherAccountManagers(1)).toBeUndefined();
    expect(getOtherAccountManagers(2)).toBe(getAccountManagers(2));

    let resolve: (value: any) => void;
    invoke.mockImplementation(() => new Promise((r) => resolve = r));
    // * an avatar a call's panel asked for while its account was the one shown
    const promise = getAccountManagers(1).appDraftsManager.getDraft(123 as PeerId);
    setCurrentAccount(2);
    resolve('draft of account 1');

    await expect(promise).resolves.toBe('draft of account 1');
    expect(invoke.mock.calls[0][1].accountNumber).toBe(1);
  });
});
