import {beforeAll, describe, expect, it, vi} from 'vitest';
import type SidebarSlider from '@components/slider';
import * as tabs from '@components/solidJsTabs/tabs';
import type {AccountPassword} from '@layer';
import rootScope from '@lib/rootScope';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {openSectionTab} from '@lib/settingsSearch/openers';
import {findSettingsLink} from '@lib/settingsSearch/link';
import {setAppSettingsSilent} from '@stores/appSettings';

// the tab registry pulls in what jsdom cannot run: the animations' intersection observer, a canvas probe
vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});
vi.mock('@environment/webpSupport', () => ({default: false}));
// and the worker proxy, which starts the crypto worker as it is imported
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

beforeAll(() => {
  registerHotReloadGuard({tabs});
});

type OpenedTab = {ctor: unknown, payload?: any, close: () => void};
const createSlider = () => {
  const opened: OpenedTab[] = [];
  const history: OpenedTab[] = [];
  const resendPasswordEmail = vi.fn();
  const slider = {
    getHistory: () => history,
    createTab: (ctor: unknown) => {
      const onDestroy: VoidFunction[] = [];
      const tab: OpenedTab & {[key: string]: unknown} = {
        ctor,
        managers: {passwordManager: {resendPasswordEmail}},
        // leaves the stack at once, and is destroyed after its slide
        close: () => {
          history.splice(history.indexOf(tab), 1);
          onDestroy.forEach((callback) => callback());
        },
        middlewareHelper: {onDestroy: (callback: VoidFunction) => onDestroy.push(callback)},
        open: async(payload?: unknown) => {
          tab.payload = payload;
          opened.push(tab);
          history.push(tab);
        }
      };
      return tab;
    }
  } as unknown as SidebarSlider;
  return {slider, opened, resendPasswordEmail};
};

/**
 * The passcode's screen turns the passcode off and sets a new one without asking for it, so the
 * settings search and `tg://settings/privacy/passcode/*` have to reach it the way Privacy and
 * Security does: through the current passcode.
 */
describe('passcode lock screen', () => {
  const PASSCODE = '1234';
  const passcodeActions = {isMyPasscode: async(passcode: string) => passcode === PASSCODE};
  const submitOf = (tab: OpenedTab, actions = passcodeActions) => (passcode: string) =>
    (tab.payload as Parameters<InstanceType<typeof tabs.AppPasscodeEnterPasswordTab>['open']>[0])
    .onSubmit(passcode, undefined, actions as any);

  it('asks for the current passcode before the search opens the screen', async() => {
    setAppSettingsSilent('passcode', {enabled: true});
    const {slider, opened} = createSlider();

    const opening = openSectionTab('AppPasscodeLockTab', slider, undefined);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0].ctor).toBe(tabs.AppPasscodeEnterPasswordTab);

    const submit = submitOf(opened[0]);
    await expect(submit('4321')).rejects.toBeDefined();
    expect(opened).toHaveLength(1);

    await submit(PASSCODE);
    expect(opened.map(({ctor}) => ctor)).toEqual([tabs.AppPasscodeEnterPasswordTab, tabs.AppPasscodeLockTab]);
    // the screen itself, which the result's control is then pointed at
    expect(await opening).toBe(opened[1]);
  });

  it('opens nothing when the check is given up', async() => {
    setAppSettingsSilent('passcode', {enabled: true});
    const {slider, opened} = createSlider();

    const opening = openSectionTab('AppPasscodeLockTab', slider, undefined);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    opened[0].close();

    expect(await opening).toBeUndefined();
    expect(opened).toHaveLength(1);
  });

  it('opens nothing when the check is left while the passcode is being verified', async() => {
    setAppSettingsSilent('passcode', {enabled: true});
    const {slider, opened} = createSlider();

    const opening = openSectionTab('AppPasscodeLockTab', slider, undefined);
    await vi.waitFor(() => expect(opened).toHaveLength(1));

    let verified: (isCorrect: boolean) => void;
    const submitting = submitOf(opened[0], {isMyPasscode: () => new Promise<boolean>((resolve) => verified = resolve)})(PASSCODE);
    opened[0].close();
    verified(true);
    await submitting;

    expect(await opening).toBeUndefined();
    expect(opened).toHaveLength(1);
  });

  it('opens the screen at once while there is no passcode to ask for', async() => {
    setAppSettingsSilent('passcode', {enabled: false});
    const {slider, opened} = createSlider();

    expect(await openSectionTab('AppPasscodeLockTab', slider, undefined)).toBe(opened[0]);
    expect(opened.map(({ctor}) => ctor)).toEqual([tabs.AppPasscodeLockTab]);
  });

  it('keeps every passcode link on the screen, which asks first', () => {
    for(const path of ['privacy/passcode', 'privacy/passcode/change', 'privacy/passcode/disable', 'privacy/passcode/auto-lock']) {
      expect(findSettingsLink(path)?.sectionId, path).toBe('AppPasscodeLockTab');
    }
  });
});

/**
 * Two-Step Verification's screen works with the cloud password it is handed. The settings search and
 * `tg://settings/privacy/2sv/*` used to open it with nothing, and it came up empty: they reach it the way
 * Privacy and Security does.
 */
describe('Two-Step Verification screen', () => {
  const openWith = (state: Partial<AccountPassword.accountPassword>) => {
    const passwordState = {_: 'account.password', pFlags: {}, ...state} as AccountPassword;
    rootScope.managers = {passwordManager: {getState: async() => passwordState}} as any;
    const created = createSlider();
    return {...created, passwordState, opening: openSectionTab('AppTwoStepVerificationTab', created.slider, undefined)};
  };

  it('asks for the cloud password first while one is set, and resolves with the screen it opens', async() => {
    const {opened, passwordState, opening} = openWith({pFlags: {has_password: true}});
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0].ctor).toBe(tabs.AppTwoStepVerificationEnterPasswordTab);
    expect(opened[0].payload.state).toBe(passwordState);

    const screen = {} as InstanceType<typeof tabs.AppTwoStepVerificationTab>;
    opened[0].payload.onPassed(Promise.resolve(screen));
    expect(await opening).toBe(screen);
  });

  it('waits for a slow screen, though the passed step is gone before it opens', async() => {
    const {opened, opening} = openWith({pFlags: {has_password: true}});
    await vi.waitFor(() => expect(opened).toHaveLength(1));

    const screen = {} as InstanceType<typeof tabs.AppTwoStepVerificationTab>;
    let screenOpen: VoidFunction;
    opened[0].payload.onPassed(new Promise<void>((resolve) => screenOpen = resolve).then(() => screen));
    opened[0].close();
    screenOpen();

    expect(await opening).toBe(screen);
  });

  it('opens nothing when the password step is given up', async() => {
    const {opened, opening} = openWith({pFlags: {has_password: true}});
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    opened[0].close();

    expect(await opening).toBeUndefined();
  });

  it('opens the screen with the state while no password is set', async() => {
    const {opened, passwordState, opening} = openWith({});

    expect(await opening).toBe(opened[0]);
    expect(opened[0].ctor).toBe(tabs.AppTwoStepVerificationTab);
    expect(opened[0].payload).toEqual({state: passwordState});
  });

  it('confirms an unconfirmed recovery email first', async() => {
    const {opened, opening, resendPasswordEmail} = openWith({email_unconfirmed_pattern: 'a***@example.com'});

    expect(await opening).toBe(opened[0]);
    expect(opened[0].ctor).toBe(tabs.AppTwoStepVerificationEmailConfirmationTab);
    expect(opened[0].payload).toMatchObject({length: 6, isFirst: true});
    expect(resendPasswordEmail).toHaveBeenCalledOnce();
  });

  it('keeps every 2sv link on the screen, which asks first', () => {
    for(const path of ['privacy/2sv', 'privacy/2sv/change', 'privacy/2sv/disable', 'privacy/2sv/change-email']) {
      expect(findSettingsLink(path)?.sectionId, path).toBe('AppTwoStepVerificationTab');
    }
  });
});
