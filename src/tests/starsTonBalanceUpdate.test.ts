import {describe, expect, it, vi} from 'vitest';
import AppPaymentsManager from '@appManagers/appPaymentsManager';
import {PaymentsStarsStatus, StarsAmount, Update} from '@layer';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';
import '@helpers/peerIdPolyfill';

/**
 * The TON balance comes from the server in nanotons, and the tab keeps it so: the wallet and Settings
 * compare and format nanotons, and the store's balance is a big integer of them. A balance the
 * server changes (`updateStarsBalance`) has to reach the tab in the same unit — 25.3 TON handed over
 * as 25.3 is not a whole number of nanotons, and 25 TON as 25 is 25 nanotons.
 */

const fake = vi.hoisted(() => ({
  rootScope: undefined as any
}));

vi.mock('@lib/rootScope', async() => {
  const {default: EventListenerBase} = await import('@helpers/eventListenerBase');
  const status = (balance: StarsAmount) => Promise.resolve({balance});
  fake.rootScope = Object.assign(new EventListenerBase(), {
    managers: {
      appPaymentsManager: {
        getStarsStatus: () => status({_: 'starsAmount', amount: '100', nanos: 0}),
        getStarsStatusTon: () => status({_: 'starsTonAmount', amount: '1000000000'})
      }
    }
  });
  return {default: fake.rootScope};
});

const tonUpdate = (amount: string): Update.updateStarsBalance => ({
  _: 'updateStarsBalance',
  balance: {_: 'starsTonAmount', amount}
});

function harness() {
  const dispatchEvent = vi.fn();
  const manager = new AppPaymentsManager();
  Object.assign(manager, {
    rootScope: {myId: (1 as UserId).toPeerId(false), dispatchEvent},
    apiManager: {
      invokeApiSingleProcess: ({processResult}: any) => Promise.resolve({
        _: 'payments.starsStatus',
        balance: {_: 'starsTonAmount', amount: '1000000000'},
        chats: [],
        users: []
      } as PaymentsStarsStatus).then(processResult)
    },
    appPeersManager: {saveApiPeers: vi.fn()}
  });
  return {manager, events: () => dispatchedEvents(dispatchEvent, 'stars_balance')};
}

/** The TON balance known, then changed by the server to 25.3 TON */
async function changedTonBalance() {
  const h = harness();
  await h.manager.getStarsStatusTon();
  (h.manager as any).onUpdateStarsBalance(tonUpdate('25300000000'));
  return h;
}

describe('A TON balance the server changes', () => {
  it('reaches the tab in nanotons', async() => {
    const h = await changedTonBalance();

    expect(h.events()).toEqual([{balance: '25300000000', ton: true}]);
  });

  it('is shown as it is by the wallet and Settings', async() => {
    const {default: useStars} = await import('@stores/stars');
    const ton = useStars(true);
    await vi.waitFor(() => expect(ton()).toBe('1000000000'));

    const h = await changedTonBalance();
    const [event] = h.events();
    fake.rootScope.dispatchEvent('stars_balance', event);

    expect(ton()).toBe('25300000000');
  });
});
