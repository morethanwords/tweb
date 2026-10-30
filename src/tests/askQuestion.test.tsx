import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {createSignal, JSX} from 'solid-js';
import '@helpers/peerIdPolyfill';
import askQuestion from '@components/askQuestion';
import InactivityPeriodRow, {ACCOUNT_TTL_OPTIONS, nearestInactivityPeriod, SESSION_TTL_OPTIONS} from '@components/sidebarLeft/tabs/inactivityPeriodRow';
import createOptimisticSave from '@helpers/createOptimisticSave';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn(),
  toastNew: vi.fn(),
  safeWindowOpen: vi.fn(),
  setInnerPeer: vi.fn(),
  selectPeriod: undefined as (days: number) => void
}));

vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@helpers/dom/safeWindowOpen', () => ({default: mocks.safeWindowOpen}));

vi.mock('@components/sidebarLeft/tabs/passcodeLock/inlineSelect', () => ({
  default: (props: {value: number, onChange: (days: number) => void}) => {
    mocks.selectPeriod = props.onChange;
    return <div class="inline-select" data-value={'' + props.value} />;
  }
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => {
  const Row = (props: {children: JSX.Element, clickable?: () => void}) => (
    <div class="row" onClick={props.clickable}>{props.children}</div>
  );
  Row.Title = (props: {children: JSX.Element}) => <div class="row-title">{props.children}</div>;
  Row.RightContent = (props: {children: JSX.Element}) => <div class="row-right">{props.children}</div>;

  return {
    useHotReloadGuard: () => ({
      Row,
      i18n: (key: string) => document.createTextNode(key),
      toastNew: mocks.toastNew
    })
  };
});

registerHotReloadGuard({appImManager: {setInnerPeer: mocks.setInnerPeer}} as any);

const flush = async() => {
  for(let i = 0; i < 5; ++i) await Promise.resolve();
};

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('ask a question', () => {
  const getSupportUserId = vi.fn();
  const managers = {appUsersManager: {getSupportUserId}} as any;

  beforeEach(() => {
    getSupportUserId.mockResolvedValue(4244000);
  });

  it('reminds of the FAQ first and opens the volunteer chat once confirmed', async() => {
    mocks.confirmationPopup.mockResolvedValue(undefined);
    await askQuestion(managers);

    expect(mocks.confirmationPopup).toHaveBeenCalledOnce();
    const options = mocks.confirmationPopup.mock.calls[0][0];
    expect(options).toMatchObject({
      titleLangKey: 'AskAQuestion',
      descriptionLangKey: 'AskAQuestionInfo',
      button: {langKey: 'AskButton'},
      cancelButton: {langKey: 'TelegramFaq'}
    });
    expect(mocks.setInnerPeer).toHaveBeenCalledExactlyOnceWith({peerId: (4244000 as UserId).toPeerId(false)});
  });

  it('opens the FAQ from the reminder instead, and asks nobody', async() => {
    mocks.confirmationPopup.mockImplementation((options: any) => {
      options.cancelButton.callback();
      return Promise.reject();
    });
    await askQuestion(managers);

    expect(mocks.safeWindowOpen).toHaveBeenCalledOnce();
    expect(getSupportUserId).not.toHaveBeenCalled();
    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
  });

  it('does nothing when the reminder is closed', async() => {
    mocks.confirmationPopup.mockRejectedValue(undefined);
    await askQuestion(managers);

    expect(mocks.safeWindowOpen).not.toHaveBeenCalled();
    expect(getSupportUserId).not.toHaveBeenCalled();
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  it('says so when the volunteer cannot be had', async() => {
    mocks.confirmationPopup.mockResolvedValue(undefined);
    getSupportUserId.mockRejectedValue({type: 'INTERNAL'});
    await askQuestion(managers);

    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });
});

describe('inactivity period row', () => {
  it('offers the account periods tdesktop does and snaps what other clients set to them', () => {
    expect(ACCOUNT_TTL_OPTIONS.map((option) => option.value)).toEqual([30, 90, 180, 365, 548, 720]);
    expect(SESSION_TTL_OPTIONS.map((option) => option.value)).toEqual([7, 30, 90, 180, 365]);
    // * Android sets 182 and 730 days for 6 and 24 months
    expect(nearestInactivityPeriod(ACCOUNT_TTL_OPTIONS, 182)).toBe(180);
    expect(nearestInactivityPeriod(ACCOUNT_TTL_OPTIONS, 730)).toBe(720);
    expect(nearestInactivityPeriod(ACCOUNT_TTL_OPTIONS, 548)).toBe(548);
  });

  it('offers nothing until the period is known, then shows it', async() => {
    const signal = createSignal(0);
    const save = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InactivityPeriodRow title="DeleteAccountIfAwayFor2" options={ACCOUNT_TTL_OPTIONS} days={signal} save={save} reload={vi.fn()} />
    ), container);

    expect(container.querySelector('.row-title').textContent).toBe('DeleteAccountIfAwayFor2');
    expect(container.querySelector('.inline-select')).toBeNull();

    signal[1](730);
    await flush();
    expect(container.querySelector('.inline-select').getAttribute('data-value')).toBe('720');
    expect(save).not.toHaveBeenCalled();

    dispose();
  });

  const mountPicked = (days: number, held: Promise<number> = Promise.reject(new Error())) => {
    const answers: {resolve: () => void, reject: () => void}[] = [];
    const save = vi.fn(() => new Promise<void>((resolve, reject) => answers.push({resolve, reject: () => reject(new Error())})));
    // * what the manager says the server holds once the saves on their way are answered
    const reload = vi.fn(() => held);
    held.catch(() => {});
    const signal = createSignal(days);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InactivityPeriodRow title="DeleteAccountIfAwayFor2" options={ACCOUNT_TTL_OPTIONS} days={signal} save={save} reload={reload} />
    ), container);
    const shown = () => container.querySelector('.inline-select')?.getAttribute('data-value');

    mocks.selectPeriod(30);
    mocks.selectPeriod(90);
    return {answers, save, reload, shown, dispose};
  };

  it('hands every period picked to the manager at once, and keeps the newest when only the older is refused', async() => {
    const {answers, save, reload, shown, dispose} = mountPicked(365);
    // * the manager keeps their order: held back here, a screen opened again could get ahead of them
    expect(save.mock.calls).toEqual([[30], [90]]);
    await flush();
    expect(shown()).toBe('90');

    answers[0].reject();
    await flush();
    expect(shown()).toBe('90');

    answers[1].resolve();
    await flush();
    expect(shown()).toBe('90');
    expect(mocks.toastNew).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    dispose();
  });

  it('shows the period the server holds when the newest is refused, whoever set it', async() => {
    // * this screen's 30 was taken, then another tab's 180
    const {answers, reload, shown, dispose} = mountPicked(365, Promise.resolve(180));
    await flush();
    answers[0].resolve();
    await flush();
    answers[1].reject();
    await flush();

    expect(reload).toHaveBeenCalledOnce();
    expect(shown()).toBe('180');
    expect(mocks.toastNew).toHaveBeenCalledExactlyOnceWith({langPackKey: 'Error.AnError'});

    dispose();
  });

  it('offers nothing when the period cannot be had after a refusal', async() => {
    const {answers, shown, dispose} = mountPicked(365);
    await flush();
    answers[0].reject();
    await flush();
    answers[1].reject();
    await flush();

    expect(shown()).toBeUndefined();
    expect(mocks.toastNew).toHaveBeenCalledOnce();

    dispose();
  });
});

describe('a setting shown before the server takes it', () => {
  it('hands every value to the manager at once, so another screen cannot get between them', () => {
    // * the manager's queue keeps the order it is given: held back on one screen, a value would go after the other's
    const save = vi.fn((_value: number) => new Promise<void>(() => {}));
    const first = createOptimisticSave(save, vi.fn());
    const second = createOptimisticSave(save, vi.fn());

    first(30, 365);
    first(180, 30);
    second(90, 180);
    expect(save.mock.calls).toEqual([[30], [180], [90]]);
  });

  it('takes a save that throws at once for a refused one', async() => {
    const revert = vi.fn();
    const save = createOptimisticSave((_value: number): Promise<void> => {
      throw new Error();
    }, revert);

    save(30, 365);
    await flush();
    expect(revert).toHaveBeenCalledExactlyOnceWith(365);
  });

  it('without a reload, puts back the value from before both when both are refused', async() => {
    const rejects: (() => void)[] = [];
    const revert = vi.fn();
    const save = createOptimisticSave((_enabled: boolean) => new Promise((_, reject) => rejects.push(() => reject(new Error()))), revert);

    save(false, true);
    save(true, false);
    await flush();
    rejects[0]();
    await flush();
    expect(revert).not.toHaveBeenCalled();
    rejects[1]();
    await flush();

    expect(revert).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('shows Suggest Frequent Contacts as the manager has it after a refusal, not as this screen last knew it', async() => {
    const rejects: (() => void)[] = [];
    const revert = vi.fn();
    // * another tab turned it off meanwhile
    const reload = vi.fn(() => Promise.resolve(false));
    const save = createOptimisticSave((_enabled: boolean) => new Promise((_, reject) => rejects.push(() => reject(new Error()))), revert, reload);

    save(false, true);
    save(true, false);
    rejects[0]();
    await flush();
    expect(reload).not.toHaveBeenCalled();
    rejects[1]();
    await flush();

    expect(reload).toHaveBeenCalledOnce();
    expect(revert).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('leaves it to a save sent while the manager was asked', async() => {
    const rejects: (() => void)[] = [];
    const revert = vi.fn();
    let answer: (value: boolean) => void;
    const reload = vi.fn(() => new Promise<boolean>((resolve) => answer = resolve));
    const save = createOptimisticSave((_enabled: boolean) => new Promise((_, reject) => rejects.push(() => reject(new Error()))), revert, reload);

    save(false, true);
    rejects[0]();
    await flush();
    save(false, true);
    answer(true);
    await flush();

    expect(revert).not.toHaveBeenCalled();
  });

  it('says it is not known when the manager cannot say either', async() => {
    const revert = vi.fn();
    const save = createOptimisticSave((_enabled: boolean) => Promise.reject(new Error()), revert, () => Promise.reject(new Error()));

    save(false, true);
    await flush();

    expect(revert).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
