import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRoot, createSignal} from 'solid-js';

const toasts: string[] = [];
vi.mock('@components/toast', () => ({
  toastNew: ({langPackKey}: {langPackKey: string}) => toasts.push(langPackKey)
}));

// `vi.mock` above is hoisted over this import
import createFeeCode, {FREE_SECONDS} from '@components/popups/myQrCode/feeCode';

const lastToast = () => toasts[toasts.length - 1];

type Token = {_: 'exportedNoPaidMessagesToken', token: string, url: string, expires?: number};

/** A server whose answers are let go one by one, so the order they come in is the test's */
function makeManagers() {
  const asked: {params: {revoke?: boolean, temporary?: boolean}, resolve: (token: Token) => void, reject: (error: unknown) => void}[] = [];
  let tokens = 0;
  const managers = {
    appPrivacyManager: {getGlobalPrivacySettings: async() => ({noncontact_peers_paid_stars: 50})},
    appUsersManager: {
      getKeptNoPaidMessagesToken: async(): Promise<any> => null,
      setKeptNoPaidMessagesTokenPermanent: vi.fn(async() => {}),
      exportNoPaidMessagesToken: (params: {revoke?: boolean, temporary?: boolean}) => new Promise<Token>((resolve, reject) => {
        asked.push({params, resolve, reject});
      })
    }
  };

  const answer = (index = asked.length - 1) => {
    const {params, resolve} = asked[index];
    const token = 't' + ++tokens;
    resolve({
      _: 'exportedNoPaidMessagesToken',
      token,
      url: 'https://t.me/u?free=' + token,
      expires: params.temporary ? Math.floor(Date.now() / 1000) + 60 : undefined
    });
  };

  return {managers: managers as any, asked, answer};
}

async function setup() {
  const server = makeManagers();
  const [decided, setDecided] = createSignal(false);
  let fee: ReturnType<typeof createFeeCode>, dispose: () => void;
  createRoot((d) => {
    dispose = d;
    fee = createFeeCode({managers: server.managers, enabled: true, temporaryOnly: () => false, decided});
  });
  setDecided(true);
  await vi.advanceTimersByTimeAsync(0);
  return {...server, fee, dispose};
}

describe('the fee code, as Android keeps it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    toasts.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns free at the tap, and starts the minute when the code comes', async() => {
    const {fee, asked, answer, dispose} = await setup();
    expect(fee.visible()).toBe(true);

    fee.removeFee();
    expect(fee.mode()).toBe('temporary');
    expect(toasts).toEqual(['QRCode.NoPaid.Toast.Expires']);
    expect(asked[0].params).toEqual({temporary: true});
    // the fee's code stays on screen until the free one comes, and the whole minute is left
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u');
    await vi.advanceTimersByTimeAsync(5000);
    expect(fee.left()).toBe(FREE_SECONDS);

    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fee.left()).toBe(FREE_SECONDS - 10);
    dispose();
  });

  it('replaces the code every 30 s without moving the minute, and brings the fee back at its end', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(asked.length).toBe(2);
    // a replacement on its way is not asked for again
    await vi.advanceTimersByTimeAsync(5000);
    expect(asked.length).toBe(2);
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t2');
    expect(fee.left()).toBe(FREE_SECONDS - 36);

    await vi.advanceTimersByTimeAsync(24_000);
    expect(fee.mode()).toBe('fee');
    expect(lastToast()).toBe('QRCode.NoPaid.Toast.Expired');
    dispose();
  });

  it('lets a reset wait for the replacement on its way: that one counts, and the reset\'s code stays', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(asked.length).toBe(2);

    fee.resetCode();
    expect(asked.length).toBe(2);
    expect(toasts[toasts.length - 1]).toBe('QRCode.NoPaid.Toast.Expires');
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(asked[2].params).toEqual({revoke: true, temporary: true});
    answer(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t3');
    dispose();
  });

  it('goes back to the fee when no code of the kind asked for has come, and only says so otherwise', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    asked[0].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('fee');
    expect(lastToast()).toBe('Error.AnError');

    fee.removeFee();
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    fee.resetCode();
    asked[2].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('temporary');
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t1');
    dispose();
  });

  it('keeps the minute of the code on screen when a reset fails', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(10_000);
    fee.resetCode();
    expect(fee.left()).toBe(FREE_SECONDS);
    asked[1].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('temporary');
    expect(fee.left()).toBe(FREE_SECONDS - 10);
    dispose();
  });

  it('starts the minute of a reset from its own code, not from a replacement that was on its way', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(asked.length).toBe(2);
    fee.resetCode();
    // the replacement comes back 10 s later: the minute still waits for the reset's code
    await vi.advanceTimersByTimeAsync(10_000);
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.left()).toBe(FREE_SECONDS);
    answer(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.left()).toBe(FREE_SECONDS);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fee.left()).toBe(FREE_SECONDS - 20);
    dispose();
  });

  it('sends nothing that waited once the screen has gone', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    fee.resetCode();
    dispose();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(asked.length).toBe(1);
  });

  it('tries a failed replacement again a while later, and says nothing of it', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(31_000);
    const shown = toasts.length;
    // asked at 30 s, failed at 31 s: the next try is 3 s after the last one
    asked[1].reject(new Error('FLOOD_WAIT_100'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked.length).toBe(3);
    expect(toasts.length).toBe(shown);
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t1');
    dispose();
  });

  it('keeps the minute through resets that pile up and fail', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(10_000);
    fee.resetCode();
    fee.resetCode();
    asked[1].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    asked[2].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.left()).toBe(FREE_SECONDS - 10);
    dispose();
  });

  it('keeps the minute when the timer goes off and on and the ask for it fails', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(10_000);
    fee.toggleTimer();
    fee.toggleTimer();
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    asked[2].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('temporary');
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t1');
    expect(fee.left()).toBe(FREE_SECONDS - 10);
    dispose();
  });

  it('shows the code of a reset that came before the one after it failed: the old one is revoked', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    fee.toggleTimer();
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    fee.resetCode();
    fee.resetCode();
    answer(2);
    await vi.advanceTimersByTimeAsync(0);
    asked[3].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('permanent');
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u?free=t3');
    dispose();
  });

  it('keeps the mode for the next open as it is chosen, as Android does', async() => {
    const {fee, managers, answer, dispose} = await setup();
    const setPermanent = managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent;
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    fee.toggleTimer();
    expect(setPermanent).toHaveBeenLastCalledWith(true);
    fee.toggleTimer();
    expect(setPermanent).toHaveBeenLastCalledWith(false);
    // the permanent answer that comes after the timer was turned on again does not make it the mode
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(setPermanent).toHaveBeenLastCalledWith(false);
    dispose();
  });

  it('takes off the screen a code that a revoke answered while the mode had changed', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    fee.resetCode();
    fee.toggleTimer();
    // the reset's answer: the code on screen is revoked, and the permanent one asked for is on its way
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.urlFor('https://t.me/u')).toBe('https://t.me/u');
    expect(fee.pending()).toBe(true);
    fee.toggleTimer();
    asked[2].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    asked[3].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('fee');
    dispose();
  });

  it('brings the fee back when a code on the timer that stays has no minute to go back to', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(31_000);
    // a replacement is on its way; the fee comes back and is taken off again
    fee.restoreFee();
    fee.removeFee();
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    asked[2].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('fee');
    dispose();
  });

  it('brings the fee back when the code on screen has run out on the server and none replaced it', async() => {
    const {fee, asked, dispose} = await setup();
    fee.removeFee();
    // a code with 20 s of the server's time left
    asked[0].resolve({_: 'exportedNoPaidMessagesToken', token: 'short', url: 'u', expires: Math.floor(Date.now() / 1000) + 20});
    await vi.advanceTimersByTimeAsync(16_000);
    // its replacement is asked for 5 s before its end, and fails
    asked[1].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fee.mode()).toBe('fee');
    expect(lastToast()).toBe('QRCode.NoPaid.Toast.Expired');
    dispose();
  });

  it('falls back only on a code that is on screen: a failed ask after the fee came back brings it back again', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    fee.restoreFee();
    fee.removeFee();
    asked[1].reject(new Error('fail'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.mode()).toBe('fee');
    expect(lastToast()).toBe('Error.AnError');
    dispose();
  });

  it('holds a code of the other kind as pending until the one asked for comes', async() => {
    const {fee, answer, dispose} = await setup();
    fee.removeFee();
    expect(fee.pending()).toBe(true);
    answer(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.pending()).toBe(false);
    fee.toggleTimer();
    // the code on the timer is still on screen: not one to hand out as one without a limit
    expect(fee.pending()).toBe(true);
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.pending()).toBe(false);
    dispose();
  });

  it('turns the timer off and on: no limit at once, a new minute on again', async() => {
    const {fee, asked, answer, dispose} = await setup();
    fee.removeFee();
    answer(0);
    await vi.advanceTimersByTimeAsync(20_000);

    fee.toggleTimer();
    expect(fee.mode()).toBe('permanent');
    expect(lastToast()).toBe('QRCode.NoPaid.Toast.NoTimeLimit');
    expect(asked[1].params).toEqual({temporary: false});
    answer(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fee.left()).toBeUndefined();

    fee.toggleTimer();
    expect(fee.mode()).toBe('temporary');
    expect(fee.left()).toBe(FREE_SECONDS);
    fee.restoreFee();
    expect(fee.mode()).toBe('fee');
    expect(lastToast()).toBe('QRCode.NoPaid.Toast.FeeRestored');
    dispose();
  });
});
