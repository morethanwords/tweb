import {describe, expect, it} from 'vitest';
import {PrivacyRule} from '@layer';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import noop from '@helpers/noop';

// * A save cached the rules it sent, renamed: their users were input users, and a privacy screen opened next took them
// * for user ids and failed. The cache takes the rules the server answers, as tdesktop's `UserPrivacy::save` applies them
describe('AppPrivacyManager.setPrivacy', () => {
  it('caches the rules the server keeps', async() => {
    const serverRules: PrivacyRule[] = [{_: 'privacyValueAllowContacts'}, {_: 'privacyValueAllowUsers', users: [1]}];
    let onUpdatePrivacy: (update: any) => void;
    const manager = new AppPrivacyManager();
    Object.assign(manager as any, {
      rootScope: {addEventListener: noop, dispatchEvent: noop},
      apiUpdatesManager: {
        addMultipleEventsListeners: (listeners: any) => onUpdatePrivacy = listeners.updatePrivacy,
        processLocalUpdate: (update: any) => onUpdatePrivacy(update)
      },
      appStateManager: {getState: () => new Promise(() => {})},
      appUsersManager: {saveApiUsers: noop},
      appChatsManager: {saveApiChats: noop},
      apiManager: {invokeApi: () => Promise.resolve({_: 'account.privacyRules', rules: serverRules, users: [], chats: []})}
    });
    (manager as any).after();

    await manager.setPrivacy('inputPrivacyKeyChatInvite', [
      {_: 'inputPrivacyValueAllowContacts'},
      {_: 'inputPrivacyValueAllowUsers', users: [{_: 'inputUser', user_id: 1, access_hash: '0'}]}
    ]);
    expect(await manager.getPrivacy('inputPrivacyKeyChatInvite')).toEqual(serverRules);
  });
});
