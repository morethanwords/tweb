import {describe, expect, it, vi} from 'vitest';
import {GlobalPrivacySettings, PrivacyRule} from '@layer';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';

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
  it('keeps the settings of a save answered while they are asked for, and gives them to the caller', async() => {
    const older: GlobalPrivacySettings = {_: 'globalPrivacySettings', pFlags: {}};
    const saved: GlobalPrivacySettings = {_: 'globalPrivacySettings', pFlags: {hide_read_marks: true}};
    const answer = deferredPromise<GlobalPrivacySettings>();
    const {manager} = createManager((method) => {
      return method === 'account.getGlobalPrivacySettings' ? answer : Promise.resolve(saved);
    });

    const asked = manager.getGlobalPrivacySettings();
    await manager.setGlobalPrivacySettings(saved);
    answer.resolve(older);

    expect(await asked).toBe(saved);
    expect(manager.getGlobalPrivacySettings()).toBe(saved);
  });
});
