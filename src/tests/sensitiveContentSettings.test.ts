import type {AccountContentSettings, Chat, Message, RestrictionReason} from '@layer';
import {isSensitive, makeIgnoredRestrictionReasons} from '@helpers/restrictions';
import isMessageRestricted, {getMessageRestrictionReason, isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import isPeerRestricted from '@appManagers/utils/peers/isPeerRestricted';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import {setAppStateSilent} from '@stores/appState';
import '@stores/contentSettings';

const SENSITIVE: RestrictionReason[] = [{_: 'restrictionReason', platform: 'all', reason: 'sensitive', text: ''}];

const contentSettings = (sensitiveEnabled: boolean, canChange = true): AccountContentSettings => ({
  _: 'account.contentSettings',
  pFlags: {...(canChange ? {sensitive_can_change: true} : {}), ...(sensitiveEnabled ? {sensitive_enabled: true} : {})}
});

describe('ignored restriction reasons, the Android way', () => {
  test.each([
    {name: 'unknown settings keep the app config', reasons: ['sensitive', 'porn'], settings: undefined, expected: ['sensitive', 'porn']},
    {name: 'the switch on adds sensitive the app config lacks', reasons: ['porn'], settings: contentSettings(true), expected: ['porn', 'sensitive']},
    {name: 'the switch off drops sensitive the app config still lists', reasons: ['sensitive'], settings: contentSettings(false), expected: []},
    {name: 'no app config yet', reasons: undefined, settings: contentSettings(true), expected: ['sensitive']}
  ])('$name', ({reasons, settings, expected}) => {
    expect([...makeIgnoredRestrictionReasons(reasons, settings)]).toEqual(expected);
  });

  test('the page follows the account switch from the start, with nothing lazy loaded', () => {
    // * the store was imported before any state existed, as at startup
    setAppStateSilent({appConfig: {ignore_restriction_reasons: []}, accountContentSettings: {value: contentSettings(true), timestamp: 0}});
    expect(isSensitive(SENSITIVE)).toBe(false);

    setAppStateSilent('accountContentSettings', {value: contentSettings(false), timestamp: 0});
    expect(isSensitive(SENSITIVE)).toBe(true);
  });
});

function makeManager(options: {
  sensitiveEnabled: boolean,
  appConfigReasons: string[],
  canChange?: boolean,
  needAgeVerification?: boolean,
  ageVerified?: boolean,
  setContentSettings?: () => Promise<boolean>,
  getContentSettings?: () => Promise<AccountContentSettings>
}) {
  const state: any = {
    accountContentSettings: {value: contentSettings(options.sensitiveEnabled, options.canChange ?? true), timestamp: 1},
    ageVerification: options.ageVerified ? {date: '', layer: 0, clientVersion: ''} : undefined
  };
  const listeners: Record<string, ((value: any) => void)[]> = {};
  const manager = new AppPrivacyManager();
  Object.assign(manager as any, {
    rootScope: {
      addEventListener: (name: string, listener: (value: any) => void) => (listeners[name] ??= []).push(listener),
      dispatchEvent: (name: string, value: any) => listeners[name]?.forEach((listener) => listener(value))
    },
    apiUpdatesManager: {addMultipleEventsListeners: () => {}},
    appStateManager: {
      getState: () => Promise.resolve(state),
      pushToState: (key: string, value: any) => state[key] = value,
      // * as the real one: answers from the cache and, when told to, asks again and caches what it is handed
      getSomethingCached: ({getValue, overwrite}: {getValue: () => Promise<AccountContentSettings>, overwrite?: boolean}) => {
        if(overwrite) getValue().then((value) => value !== undefined && (state.accountContentSettings = {value, timestamp: 0}));
        return state.accountContentSettings.value;
      }
    },
    apiManager: {
      invokeApi: (method: string) => method === 'account.getContentSettings' ?
        (options.getContentSettings ?? (() => Promise.resolve(state.accountContentSettings.value)))() :
        (options.setContentSettings ?? (() => Promise.resolve(true)))(),
      getAppConfig: () => Promise.resolve({})
    }
  });
  (manager as any).after();
  (manager as any).rootScope.dispatchEvent('app_config', {
    ignore_restriction_reasons: options.appConfigReasons,
    need_age_video_verification: options.needAgeVerification
  });
  return {manager, state};
}

describe('AppPrivacyManager ignored restriction reasons', () => {
  test('every account keeps its own: the worker serves all of them at once', async() => {
    const enabled = makeManager({sensitiveEnabled: true, appConfigReasons: []});
    const disabled = makeManager({sensitiveEnabled: false, appConfigReasons: ['sensitive']});
    await Promise.resolve();

    expect(isSensitive(SENSITIVE, enabled.manager.getIgnoredRestrictionReasons())).toBe(false);
    expect(isSensitive(SENSITIVE, disabled.manager.getIgnoredRestrictionReasons())).toBe(true);
  });

  test('the switch waits for the server, then holds without waiting for the app config', async() => {
    let answer: (value: boolean) => void;
    const {manager, state} = makeManager({
      sensitiveEnabled: false,
      appConfigReasons: [],
      setContentSettings: () => new Promise((resolve) => answer = resolve)
    });
    await Promise.resolve();
    const cached = state.accountContentSettings;

    const promise = manager.setContentSettings({sensitive_enabled: true});
    await vi.waitFor(() => expect(answer).toBeDefined());
    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(true);
    expect(state.accountContentSettings).toBe(cached);

    answer(true);
    await promise;
    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(false);
    expect(state.accountContentSettings.value.pFlags.sensitive_enabled).toBe(true);
  });

  test('a late answer to a request sent before an accepted switch does not undo it', async() => {
    let answerOld: (value: AccountContentSettings) => void;
    let calls = 0;
    const {manager, state} = makeManager({
      sensitiveEnabled: false,
      appConfigReasons: [],
      getContentSettings: () => ++calls === 1 ?
        new Promise((resolve) => answerOld = resolve) :
        Promise.resolve(contentSettings(true))
    });
    await Promise.resolve();

    manager.getContentSettings(true);
    await manager.setContentSettings({sensitive_enabled: true});
    answerOld(contentSettings(false));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(false);
    expect(state.accountContentSettings.value.pFlags.sensitive_enabled).toBe(true);
  });

  test('an answer overtaken by a later one does not undo it', async() => {
    const answers: ((value: AccountContentSettings) => void)[] = [];
    const {manager, state} = makeManager({
      sensitiveEnabled: false,
      appConfigReasons: [],
      getContentSettings: () => new Promise((resolve) => answers.push(resolve))
    });
    await Promise.resolve();

    manager.getContentSettings(true);
    manager.getContentSettings(true);
    // * turned on on another device between the two: the later answer knows it, the earlier one comes last
    answers[1](contentSettings(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    answers[0](contentSettings(false));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(false);
    expect(state.accountContentSettings.value.pFlags.sensitive_enabled).toBe(true);
  });

  test('an old answer settling with the switch in one turn does not land in the cache over it', async() => {
    let answerOld: (value: AccountContentSettings) => void;
    let accept: (value: boolean) => void;
    let calls = 0;
    const {manager, state} = makeManager({
      sensitiveEnabled: false,
      appConfigReasons: [],
      // * the refresh after the switch never answers: nothing repairs the cache behind the test's back
      getContentSettings: () => ++calls === 1 ? new Promise((resolve) => answerOld = resolve) : new Promise(() => {}),
      setContentSettings: () => new Promise((resolve) => accept = resolve)
    });
    await Promise.resolve();

    manager.getContentSettings(true);
    const switched = manager.setContentSettings({sensitive_enabled: true});
    await vi.waitFor(() => expect(accept).toBeDefined());
    answerOld(contentSettings(false));
    accept(true);
    await switched;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(false);
    expect(state.accountContentSettings.value.pFlags.sensitive_enabled).toBe(true);
  });

  test('an app config that disagrees with the cached switch asks the server again', async() => {
    const {manager} = makeManager({
      sensitiveEnabled: true,
      appConfigReasons: ['sensitive'],
      getContentSettings: () => Promise.resolve(contentSettings(false))
    });
    await Promise.resolve();
    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(false);

    // * the filter was turned back on from another device
    (manager as any).rootScope.dispatchEvent('app_config', {ignore_restriction_reasons: []});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(true);
  });

  test('a refused switch changes nothing', async() => {
    const {manager, state} = makeManager({
      sensitiveEnabled: false,
      appConfigReasons: [],
      setContentSettings: () => Promise.reject({type: 'SENSITIVE_CHANGE_FORBIDDEN'})
    });
    await Promise.resolve();
    const cached = state.accountContentSettings;

    await expect(manager.setContentSettings({sensitive_enabled: true})).rejects.toBeDefined();
    expect(isSensitive(SENSITIVE, manager.getIgnoredRestrictionReasons())).toBe(true);
    expect(state.accountContentSettings).toBe(cached);
  });
});

describe('a sensitive mark, as tdesktop and Android read it', () => {
  const reason = (reason: string, platform = 'all'): RestrictionReason => ({_: 'restrictionReason', platform, reason, text: `${reason} text`});
  const message = (...reasons: RestrictionReason[]) => ({_: 'message', restriction_reason: reasons}) as Message.message;

  beforeEach(() => {
    setAppStateSilent({appConfig: {ignore_restriction_reasons: []}, accountContentSettings: {value: contentSettings(false), timestamp: 0}});
  });

  test('blurs the media and never hides the message', () => {
    const sensitive = message(reason('sensitive'));
    expect(isMessageRestricted(sensitive)).toBe(false);
    expect(isMessageSensitive(sensitive)).toBe(true);
  });

  test('leaves a real restriction its own text', () => {
    const both = message(reason('sensitive'), reason('copyright'));
    expect(isMessageRestricted(both)).toBe(true);
    expect(getMessageRestrictionReason(both).text).toBe('copyright text');
  });

  test.each([
    {platform: 'all', expected: true},
    {platform: 'web', expected: true},
    {platform: 'webk', expected: true},
    {platform: 'ios', expected: false},
    {platform: 'android', expected: false}
  ])('counts only for this client: $platform', ({platform, expected}) => {
    expect(isSensitive([reason('sensitive', platform)])).toBe(expected);
  });
});

describe('a chat marked sensitive as a whole', () => {
  const channel = {
    _: 'channel',
    pFlags: {restricted: true},
    restriction_reason: [{_: 'restrictionReason', platform: 'all', reason: 'sensitive', text: ''}]
  } as Chat.channel;

  test.each([
    {name: 'closed: may not turn the filter off, and the age is unverified', canChange: false, needAgeVerification: true, ageVerified: false, closed: true},
    {name: 'open: no age to verify', canChange: false, needAgeVerification: false, ageVerified: false, closed: false},
    {name: 'closed: a mark of a verified age kept on this device does not count', canChange: false, needAgeVerification: true, ageVerified: true, closed: true},
    {name: 'open: may turn the filter off, the age is asked for at the media', canChange: true, needAgeVerification: true, ageVerified: false, closed: false}
  ])('$name', async({canChange, needAgeVerification, ageVerified, closed}) => {
    const {manager, state} = makeManager({sensitiveEnabled: false, appConfigReasons: [], canChange, needAgeVerification, ageVerified});
    await Promise.resolve();

    const blocked = manager.isSensitiveBlocked(state.accountContentSettings.value);
    expect(blocked).toBe(closed);
    expect(isPeerRestricted(channel, !blocked, manager.getIgnoredRestrictionReasons())).toBe(closed);
  });

  test('opens once the server no longer asks for the age', async() => {
    const {manager, state} = makeManager({sensitiveEnabled: false, appConfigReasons: [], canChange: false, needAgeVerification: true});
    await Promise.resolve();
    await manager.notifyAgeVerified().catch(() => {});
    expect(manager.isSensitiveBlocked(state.accountContentSettings.value)).toBe(true);

    (manager as any).rootScope.dispatchEvent('app_config', {ignore_restriction_reasons: [], need_age_video_verification: false});
    expect(manager.isSensitiveBlocked(state.accountContentSettings.value)).toBe(false);
  });
});
