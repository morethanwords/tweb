/*
 * The worker tells every tab what the tabs are (`tabsUpdated`): their accounts and idle times, which a tab reads to
 * count them and to look for one of an account. A tab connected a moment ago has not said its state yet - it is
 * not among them until it does, rather than an empty entry the readers fall over.
 */
import {describe, expect, test, vi} from 'vitest';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppTabsManager} from '@appManagers/appTabsManager';

describe('the tabs the worker tells the tabs of', () => {
  test('are the ones that have said their state', () => {
    const port = new MTProtoMessagePort<false>(false);
    const invokeVoid = vi.spyOn(port, 'invokeVoid').mockImplementation(() => {});
    const tabsManager = new AppTabsManager();
    tabsManager.start();

    const tabA = {} as MessageEventSource, tabB = {} as MessageEventSource, tabC = {} as MessageEventSource;
    const stateA = {id: 1, accountNumber: 1, chatPeerIds: [], idleStartTime: 0} as any;
    const stateC = {id: 3, accountNumber: 2, chatPeerIds: [], idleStartTime: 0} as any;
    tabsManager.addTab(tabA);
    tabsManager.addTab(tabB);
    tabsManager.addTab(tabC);
    // * tab A says its state before B has (B connected a moment ago), and C after
    port.dispatchEvent('tabState', stateA, tabA);
    port.dispatchEvent('tabState', stateC, tabC);
    expect(invokeVoid).toHaveBeenLastCalledWith('tabsUpdated', [stateA, stateC]);

    tabsManager.deleteTab(tabA);
    expect(invokeVoid).toHaveBeenLastCalledWith('tabsUpdated', [stateC]);
  });
});
