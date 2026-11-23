// The tab tells the service worker every 10 s that it is alive, with the push settings and the signed in accounts
// (the worker stores them for the pushes it shows). One ping is under way at a time: a settings change sends one at
// once in its place. Each ping set its next one only after asking the tab's worker for the accounts, so a ping
// already on its way when the next started — the two at the app's start, a burst of settings changes (a slider
// dragged) — went on as a loop of its own, for as long as the tab lived.

vi.mock('@lib/apiManagerProxy', () => ({
  default: {pushSingleManager: {getKeysIdsBase64: () => Promise.resolve([])}}
}));
vi.mock('@lib/accounts/accountController', () => ({
  default: {getAccounts: () => Promise.resolve([])}
}));
vi.mock('@components/appNavigationController', () => ({default: {}}));

import {WebPushApiManager} from '@lib/webPushApiManager';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';

function setup() {
  const manager = new WebPushApiManager();
  manager.isAvailable = true;
  const invokeVoid = vi.fn();
  manager.serviceMessagePort = {invokeVoid} as any;
  const pings = () => dispatchedEvents(invokeVoid, 'pushPing').length;
  return {manager, pings};
}

/** once what was started is sent: one ping every 10 s from then on, and the count it started from */
async function expectOnePingEvery10s(pings: () => number) {
  await vi.advanceTimersByTimeAsync(0);
  const first = pings();
  await vi.advanceTimersByTimeAsync(30e3);
  expect(pings() - first).toBe(3);
  return first;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the push ping', () => {
  test('started twice at once runs once', async() => {
    const {manager, pings} = setup();

    manager.setSettings({} as any);
    manager.isAliveNotify();

    expect(await expectOnePingEvery10s(pings)).toBeGreaterThanOrEqual(1);
  });

  test('a burst of settings changes leaves one ping every 10 s', async() => {
    const {manager, pings} = setup();

    for(let i = 0; i < 5; ++i) {
      manager.setSettings({volume: i / 10} as any);
    }

    await expectOnePingEvery10s(pings);
  });
});
