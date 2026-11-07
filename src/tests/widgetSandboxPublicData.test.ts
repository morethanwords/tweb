import {trackWidgetCarrier} from '@lib/widgetSandbox/publicData';
import type {AppManagers} from '@lib/managers';
import {getCurrentAccount, setCurrentAccount} from '@lib/accounts/getCurrentAccount';
import type {ActiveAccountNumber} from '@lib/accounts/types';

/**
 * Managers whose poll answers at once that the next one goes `delay` ms later (what the account's worker says:
 * appWidgetsManager.pollWidgetPublicData), counting through which message it went.
 */
function createManagers(delay = 5e3) {
  const polls: number[] = [];
  const managers = {
    appWidgetsManager: {
      pollWidgetPublicData: async(peerId: PeerId, mid: number) => (polls.push(mid), Date.now() + delay)
    }
  } as any as AppManagers;
  return {managers, polls};
}

describe('polling a shared widget\'s shared state (docs/integration.md)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('goes through a message the server knows, not one still being sent', async() => {
    const {managers, polls} = createManagers();
    const sending = trackWidgetCarrier('w1', {peerId: 1 as PeerId, mid: 7.0001, managers});
    const sent = trackWidgetCarrier('w1', {peerId: 1 as PeerId, mid: 8, managers});
    sending.setActive(true);
    sent.setActive(true);
    await vi.advanceTimersByTimeAsync(30e3);
    expect(polls).toEqual([8]);
    sending.dispose();
    sent.dispose();
  });

  test('a chat reopened before the next poll would go does not poll again before then', async() => {
    const {managers, polls} = createManagers(5e3);
    const first = trackWidgetCarrier('w2', {peerId: 1 as PeerId, mid: 9, managers});
    first.setActive(true);
    await vi.advanceTimersByTimeAsync(30e3);
    expect(polls).toEqual([9]);
    first.dispose();

    const again = trackWidgetCarrier('w2', {peerId: 1 as PeerId, mid: 9, managers});
    again.setActive(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(polls).toEqual([9]);
    await vi.advanceTimersByTimeAsync(4500);
    expect(polls).toEqual([9, 9]);
    again.dispose();
  });

  test('the first poll waits the default period: the message came with the shared state current then', async() => {
    const {managers, polls} = createManagers(5e3);
    const carrier = trackWidgetCarrier('w3', {peerId: 1 as PeerId, mid: 10, managers});
    // tracked a minute before it is seen: the period starts as it is seen
    await vi.advanceTimersByTimeAsync(60e3);
    carrier.setActive(true);
    await vi.advanceTimersByTimeAsync(29e3);
    expect(polls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1e3);
    expect(polls).toEqual([10]);
    carrier.dispose();
  });

  test('the next poll goes when the worker says — whatever it waits for (a period, a flood wait, a failure) — and not while no carrier of it is seen', async() => {
    const polls: number[] = [];
    let delay = 30e3;
    const managers = {
      appWidgetsManager: {
        pollWidgetPublicData: async(peerId: PeerId, mid: number) => (polls.push(mid), Date.now() + delay)
      }
    } as any as AppManagers;
    const carrier = trackWidgetCarrier('w5', {peerId: 1 as PeerId, mid: 12, managers});
    carrier.setActive(true);
    await vi.advanceTimersByTimeAsync(30e3);
    expect(polls).toEqual([12]);
    await vi.advanceTimersByTimeAsync(29e3);
    expect(polls).toEqual([12]);
    carrier.setActive(false);
    await vi.advanceTimersByTimeAsync(60e3);
    expect(polls).toEqual([12]);
    delay = 4e3;
    carrier.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(polls).toEqual([12, 12]);
    await vi.advanceTimersByTimeAsync(3.9e3);
    expect(polls).toEqual([12, 12]);
    await vi.advanceTimersByTimeAsync(0.1e3);
    expect(polls).toEqual([12, 12, 12]);
    carrier.dispose();
  });

  test('a poll the worker does not answer is asked again the default period later', async() => {
    const polls: number[] = [];
    let answers = false;
    const managers = {
      appWidgetsManager: {
        pollWidgetPublicData: async(peerId: PeerId, mid: number) => {
          polls.push(mid);
          if(!answers) throw {type: 'MIDDLEWARE'};
          return Date.now() + 5e3;
        }
      }
    } as any as AppManagers;
    const carrier = trackWidgetCarrier('w8', {peerId: 1 as PeerId, mid: 17, managers});
    carrier.setActive(true);
    await vi.advanceTimersByTimeAsync(30e3);
    answers = true;
    await vi.advanceTimersByTimeAsync(29e3);
    expect(polls).toEqual([17]);
    await vi.advanceTimersByTimeAsync(1e3);
    expect(polls).toEqual([17, 17]);
    carrier.dispose();
  });

  test('each account polls on its own: when one\'s worker says to wait, or one\'s poll is still out, holds nothing of another\'s after a switch in place', async() => {
    const account = getCurrentAccount();
    const other = (account === 1 ? 2 : 1) as ActiveAccountNumber;
    const polls: string[] = [];
    // * the first account's worker says to wait an hour for one widget (a flood wait), of another the poll never comes back
    const first = {
      appWidgetsManager: {
        pollWidgetPublicData: (peerId: PeerId, mid: number) => {
          polls.push('first ' + mid);
          return mid === 13 ? Promise.resolve(Date.now() + 3600e3) : new Promise(() => {});
        }
      }
    } as any as AppManagers;
    const waits = trackWidgetCarrier('w6', {peerId: 1 as PeerId, mid: 13, managers: first});
    const out = trackWidgetCarrier('w7', {peerId: 1 as PeerId, mid: 14, managers: first});
    waits.setActive(true);
    out.setActive(true);
    await vi.advanceTimersByTimeAsync(30e3);
    expect(polls).toEqual(['first 13', 'first 14']);
    // * the switch closes its chats
    waits.dispose();
    out.dispose();

    setCurrentAccount(other);
    try {
      const {managers, polls: secondPolls} = createManagers(5e3);
      const same = [trackWidgetCarrier('w6', {peerId: 2 as PeerId, mid: 15, managers}), trackWidgetCarrier('w7', {peerId: 2 as PeerId, mid: 16, managers})];
      same.forEach((carrier) => carrier.setActive(true));
      await vi.advanceTimersByTimeAsync(30e3);
      expect(secondPolls).toEqual([15, 16]);
      same.forEach((carrier) => carrier.dispose());
    } finally {
      setCurrentAccount(account);
    }
  });
});
