import {beforeAll, describe, expect, it, vi} from 'vitest';
import type SidebarSlider from '@components/slider';
import * as tabs from '@components/solidJsTabs/tabs';
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

/**
 * The passcode's screen turns the passcode off and sets a new one without asking for it, so the
 * settings search and `tg://settings/privacy/passcode/*` have to reach it the way Privacy and
 * Security does: through the current passcode.
 */
describe('passcode lock screen', () => {
  beforeAll(() => {
    registerHotReloadGuard({tabs});
  });

  type OpenedTab = {ctor: unknown, payload?: any, close: () => void};
  const createSlider = () => {
    const opened: OpenedTab[] = [];
    const history: OpenedTab[] = [];
    const slider = {
      getHistory: () => history,
      createTab: (ctor: unknown) => {
        const onDestroy: VoidFunction[] = [];
        const tab: OpenedTab & {[key: string]: unknown} = {
          ctor,
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
    return {slider, opened};
  };

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
