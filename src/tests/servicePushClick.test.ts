/*
 * A click on a notification goes to a tab of the notification's account, and finding out which tab
 * that is waits for the tabs to say their accounts. A tab of another account pinging meanwhile must
 * not take the click as a pending one, nor leave the right tab with nothing.
 */
import {describe, expect, test, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  invokeVoid: vi.fn(),
  getClientAccount: vi.fn()
}));

vi.mock('@lib/serviceWorker/index.service', () => ({
  log: Object.assign(() => {}, {error: () => {}, warn: () => {}}),
  serviceMessagePort: {invokeVoid: mocks.invokeVoid}
}));
vi.mock('@lib/serviceWorker/clientAccounts', () => ({default: mocks.getClientAccount}));
vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({default: {isUsingPasscode: async() => false}}));
vi.mock('@lib/passcode/keyStore', () => ({default: {get: async(): Promise<undefined> => undefined}}));
vi.mock('@lib/files/idb', () => ({
  default: class {
    get() {
      return Promise.reject();
    }

    save() {}
  }
}));

import {onPing} from '@lib/serviceWorker/push';

const ping = (source?: any) => onPing({
  localNotifications: true,
  accounts: {1: 100, 2: 200}
} as any, source);

describe('a notification click', () => {
  test('waits for the tabs\' accounts without handing the click to a tab that pings meanwhile', async() => {
    const tabOfAccount1 = {focus: vi.fn()};
    const tabOfAccount2 = {focus: vi.fn()};
    (window as any).clients = {
      matchAll: async() => [tabOfAccount1, tabOfAccount2],
      openWindow: vi.fn()
    };
    await ping();

    let tellAccounts: () => void;
    const accountsTold = new Promise<void>((resolve) => tellAccounts = resolve);
    mocks.getClientAccount.mockImplementation(async(client: any) => {
      await accountsTold;
      return client === tabOfAccount1 ? 1 : 2;
    });

    const data = {user_id: 200, custom: {msg_id: '1'}};
    let handled: Promise<any>;
    window.dispatchEvent(Object.assign(new Event('notificationclick'), {
      notification: {close: () => {}, data},
      action: '',
      waitUntil: (promise: Promise<any>) => handled = promise
    }));
    await vi.waitFor(() => expect(mocks.getClientAccount).toHaveBeenCalled());

    // * account 1's tab pings while the accounts are asked
    await ping(tabOfAccount1);
    expect(mocks.invokeVoid).not.toHaveBeenCalledWith('pushClick', expect.anything(), tabOfAccount1);

    tellAccounts();
    await handled;
    expect(tabOfAccount2.focus).toHaveBeenCalled();
    expect(mocks.invokeVoid).toHaveBeenCalledWith('pushClick', expect.objectContaining({user_id: 200, accountNumber: 2}), tabOfAccount2);

    // * delivered: nothing is left pending for the next tab to ping
    await ping(tabOfAccount1);
    expect(mocks.invokeVoid).toHaveBeenCalledTimes(1);
  });

  test('delivered at once, it supersedes an earlier click still pending', async() => {
    mocks.getClientAccount.mockImplementation(async() => 2);
    const tabOfAccount2 = {focus: vi.fn()};
    (window as any).clients = {matchAll: async(): Promise<any[]> => [], openWindow: vi.fn()};
    await ping();
    mocks.invokeVoid.mockClear();
    const click = (data: any) => {
      let handled: Promise<any>;
      window.dispatchEvent(Object.assign(new Event('notificationclick'), {
        notification: {close: () => {}, data},
        action: '',
        waitUntil: (promise: Promise<any>) => handled = promise
      }));
      return handled;
    };

    // * no tab of the account yet: the first click waits for one, in a window opened for it
    (window as any).clients = {matchAll: async(): Promise<any[]> => [], openWindow: vi.fn()};
    await click({user_id: 200, custom: {msg_id: '1'}});
    // * the account's tab is there by the second click, which goes to it at once
    (window as any).clients = {matchAll: async() => [tabOfAccount2], openWindow: vi.fn()};
    await click({user_id: 200, custom: {msg_id: '2'}});
    expect(mocks.invokeVoid).toHaveBeenLastCalledWith('pushClick', expect.objectContaining({custom: {msg_id: '2'}}), tabOfAccount2);

    await ping(tabOfAccount2);
    expect(mocks.invokeVoid, 'the earlier click came again').toHaveBeenCalledTimes(1);
  });

  test('an older click delivered late leaves a newer one pending for the window opened for it', async() => {
    (window as any).clients = {matchAll: async(): Promise<any[]> => [], openWindow: vi.fn()};
    await ping();
    mocks.invokeVoid.mockClear();

    // * the first click's tab is slow to say its account; the second click finds no tab and opens one
    const slowTab = {focus: vi.fn()};
    let tellAccount: () => void;
    const accountTold = new Promise<void>((resolve) => tellAccount = resolve);
    mocks.getClientAccount.mockImplementation(async() => {
      await accountTold;
      return 2;
    });
    const lists = [[slowTab], []];
    (window as any).clients = {matchAll: async() => lists.shift(), openWindow: vi.fn()};
    const click = (data: any) => {
      let handled: Promise<any>;
      window.dispatchEvent(Object.assign(new Event('notificationclick'), {
        notification: {close: () => {}, data},
        action: '',
        waitUntil: (promise: Promise<any>) => handled = promise
      }));
      return handled;
    };

    const older = click({user_id: 200, custom: {msg_id: '1'}});
    await vi.waitFor(() => expect(mocks.getClientAccount).toHaveBeenCalled());
    await click({user_id: 200, custom: {msg_id: '2'}});
    tellAccount();
    await older;

    const newWindow = {};
    await ping(newWindow);
    expect(mocks.invokeVoid, 'the newer click was lost').toHaveBeenLastCalledWith('pushClick', expect.objectContaining({custom: {msg_id: '2'}}), newWindow);
  });
});
