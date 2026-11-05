import {describe, expect, it, vi} from 'vitest';
import {GlobalPrivacySettings, PrivacyRule} from '@layer';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import convertInputKeyToKey from '@helpers/string/convertInputKeyToKey';
import createDeferredCalls, {DeferredCall} from '@/tests/helpers/deferredCalls';

function createManager(invokeApi: (method: string, params?: any) => Promise<any>) {
  let onUpdatePrivacy: (update: any) => void;
  const manager = new AppPrivacyManager();
  const apiManager = {invokeApi: vi.fn(invokeApi)};
  Object.assign(manager as any, {
    rootScope: {addEventListener: noop, dispatchEvent: noop},
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: any) => onUpdatePrivacy = listeners.updatePrivacy,
      processLocalUpdate: (update: any) => onUpdatePrivacy(update)
    },
    appStateManager: {getState: () => new Promise(() => {})},
    appUsersManager: {saveApiUsers: noop},
    appChatsManager: {saveApiChats: noop},
    apiManager
  });
  (manager as any).after();

  return {
    manager,
    invokeApi: apiManager.invokeApi,
    // * as a change made on another device comes
    updatePrivacy: (rules: PrivacyRule[]) => onUpdatePrivacy({_: 'updatePrivacy', key: {_: 'privacyKeyChatInvite'}, rules})
  };
}

const privacyRules = (rules: PrivacyRule[]) => ({_: 'account.privacyRules', rules, users: [] as any[], chats: [] as any[]});

const OLDER_RULES: PrivacyRule[] = [{_: 'privacyValueAllowContacts'}];
const NEWER_RULES: PrivacyRule[] = [{_: 'privacyValueAllowAll'}];

// * A save cached the rules it sent, renamed: their users were input users, and a privacy screen opened next took them
// * for user ids and failed. The cache takes the rules the server answers, as tdesktop's `UserPrivacy::save` applies them
describe('AppPrivacyManager.setPrivacy', () => {
  it('caches the rules the server keeps', async() => {
    const serverRules: PrivacyRule[] = [{_: 'privacyValueAllowContacts'}, {_: 'privacyValueAllowUsers', users: [1]}];
    const {manager} = createManager(() => Promise.resolve(privacyRules(serverRules)));

    await manager.setPrivacy('inputPrivacyKeyChatInvite', [
      {_: 'inputPrivacyValueAllowContacts'},
      {_: 'inputPrivacyValueAllowUsers', users: [{_: 'inputUser', user_id: 1, access_hash: '0'}]}
    ]);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(serverRules);
  });
});

// * A server that answers the saves sent so far in the reverse order, the last one first, and whatever is sent after
// * them once they are answered: what reaches the cache is the answer that comes last
async function answerLastFirst(sent: DeferredCall[], answer: (params: any) => any) {
  let answered = 0;
  while(answered < sent.length) {
    const batch = sent.slice(answered);
    answered = sent.length;
    batch.reverse().forEach(({params, deferred}) => deferred.resolve(answer(params)));
    await pause(0);
  }
}

function createSavingManager() {
  const {calls, invokeApi} = createDeferredCalls();
  return {...createManager(invokeApi), sent: calls};
}

// * Two saves of one key whose answers came out of order left the earlier save's rules in the cache, and the privacy
// * screens showed them until a reload. The later save wins, as in tdesktop (`Api::UserPrivacy::save` calls the
// * earlier one off)
describe('AppPrivacyManager: two saves of one key', () => {
  // * what the server keeps of the rules it is given: the input ones, renamed
  const keptRules = (params: any) => privacyRules(params.rules.map((rule: any) => ({_: convertInputKeyToKey(rule._)})));

  it('caches the rules of the later save, whichever is answered first', async() => {
    const {manager, sent} = createSavingManager();

    const earlier = manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowContacts'}]);
    const later = manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowAll'}]);
    await pause(0);
    await answerLastFirst(sent, keptRules);

    expect(await earlier).toEqual(OLDER_RULES);
    expect(await later).toEqual(NEWER_RULES);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(NEWER_RULES);
  });

  it('keeps the rules of the earlier save when the later one fails', async() => {
    const {manager, sent} = createSavingManager();

    const earlier = manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowContacts'}]);
    const later = manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowAll'}]);
    later.catch(noop);
    await pause(0);
    sent[0].deferred.resolve(keptRules(sent[0].params));
    await pause(0);
    sent[1].deferred.reject({type: 'PREMIUM_ACCOUNT_REQUIRED'});

    expect(await earlier).toEqual(OLDER_RULES);
    await expect(later).rejects.toMatchObject({type: 'PREMIUM_ACCOUNT_REQUIRED'});
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(OLDER_RULES);
  });

  it('does not hold a save of another key back', async() => {
    const {manager, sent} = createSavingManager();

    manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowContacts'}]);
    manager.setPrivacy('inputPrivacyKeyPhoneCall', [{_: 'inputPrivacyValueAllowAll'}]);
    await pause(0);

    expect(sent.map(({params}) => params.key._)).toEqual(['inputPrivacyKeyChatInvite', 'inputPrivacyKeyPhoneCall']);
  });
});

// * The answer to a request on its way overwrote the rules an update brought meanwhile, and the privacy screens read
// * the older rules until a reload
describe('AppPrivacyManager.getPrivacy', () => {
  it('keeps the rules of an update that comes while they are asked for, and gives them to the caller', async() => {
    const answer = deferredPromise<ReturnType<typeof privacyRules>>();
    const {manager, invokeApi, updatePrivacy} = createManager(() => answer);

    const asked = manager.getPrivacy('inputPrivacyKeyChatInvite');
    updatePrivacy(NEWER_RULES);
    answer.resolve(privacyRules(OLDER_RULES));

    expect(await asked).toEqual(NEWER_RULES);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(NEWER_RULES);
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });

  it('keeps the rules of a save answered while they are asked for', async() => {
    const answer = deferredPromise<ReturnType<typeof privacyRules>>();
    const {manager} = createManager((method) => {
      return method === 'account.getPrivacy' ? answer : Promise.resolve(privacyRules(NEWER_RULES));
    });

    const asked = manager.getPrivacy('inputPrivacyKeyChatInvite');
    await manager.setPrivacy('inputPrivacyKeyChatInvite', [{_: 'inputPrivacyValueAllowAll'}]);
    answer.resolve(privacyRules(OLDER_RULES));

    expect(await asked).toEqual(NEWER_RULES);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(NEWER_RULES);
  });

  it('caches the answer when nothing came meanwhile, and asks again after a request that failed', async() => {
    const {manager, invokeApi} = createManager(vi.fn()
    .mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'})
    .mockResolvedValue(privacyRules(OLDER_RULES)));

    await expect(manager.getPrivacy('inputPrivacyKeyChatInvite')).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
    await pause(0);

    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(OLDER_RULES);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(OLDER_RULES);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });
});

// * The same for the global settings: the answer to the request made as the session starts overwrote a switch saved
// * meanwhile
describe('AppPrivacyManager.getGlobalPrivacySettings', () => {
  const older: GlobalPrivacySettings = {_: 'globalPrivacySettings', pFlags: {}};
  const newer: GlobalPrivacySettings = {_: 'globalPrivacySettings', pFlags: {hide_read_marks: true}};

  it('keeps the settings of a save answered while they are asked for, and gives them to the caller', async() => {
    const answer = deferredPromise<GlobalPrivacySettings>();
    const {manager} = createManager((method) => {
      return method === 'account.getGlobalPrivacySettings' ? answer : Promise.resolve(newer);
    });

    const asked = manager.getGlobalPrivacySettings();
    await manager.setGlobalPrivacySettings(newer);
    answer.resolve(older);

    expect(await asked).toBe(newer);
    expect(manager.getGlobalPrivacySettings()).toBe(newer);
  });

  // * several screens save them: the later save wins, as in tdesktop (`Api::GlobalPrivacy::update`)
  it('caches the settings of the later of two saves, whichever is answered first', async() => {
    const {manager, sent} = createSavingManager();

    manager.setGlobalPrivacySettings(older);
    const saved = manager.setGlobalPrivacySettings(newer);
    await pause(0);
    await answerLastFirst(sent, (params) => params.settings);

    expect(await saved).toBe(newer);
    expect(manager.getGlobalPrivacySettings()).toBe(newer);
  });
});
