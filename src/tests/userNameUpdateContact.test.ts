import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {Update, User, Username} from '@layer';
import {AppUsersManager} from '@appManagers/appUsersManager';

// A contact is shown by the name I saved them under ("Mom"). When they renamed themselves, updateUserName put their
// own name in its place: the chat list and every title showed it until a fresh copy of the user brought "Mom" back.
// Telegram Desktop (api_updates.cpp, mtpc_updateUserName), Android (MessagesController, TL_updateUserName) and Web A
// (updates for UpdateUserName) keep a contact's names and take only the usernames.

const USER_ID = 10 as UserId;
const usernames: Username[] = [{_: 'username', username: 'new_handle', pFlags: {active: true}}];

function setup(pFlags: User.user['pFlags']) {
  const user = {_: 'user', id: USER_ID, first_name: 'Mom', last_name: '', pFlags} as User.user;
  const saveApiUser = vi.fn();
  const listeners: Record<string, (update: Update) => void> = {};
  const never = new Promise<never>(() => {});
  const manager = new AppUsersManager();
  Object.assign(manager as any, {
    forceUserOnline: vi.fn(),
    saveApiUser,
    rootScope: {addEventListener: vi.fn()},
    apiUpdatesManager: {addMultipleEventsListeners: (handlers: typeof listeners) => Object.assign(listeners, handlers)},
    appStateManager: {getState: () => never},
    appStoragesManager: {loadStorage: () => never}
  });

  // * the manager starts as the worker starts it, and the server's update goes where it registered it
  vi.useFakeTimers();
  try {
    (manager as any).after();
  } finally {
    vi.useRealTimers();
  }

  (manager as any).users[USER_ID] = user;
  listeners.updateUserName({
    _: 'updateUserName',
    user_id: USER_ID,
    first_name: 'Anna',
    last_name: 'Smith',
    usernames
  } as Update.updateUserName);

  return saveApiUser.mock.lastCall[0] as User.user;
}

describe('a user who renamed themselves', () => {
  it('stays under the name I saved them as a contact, with their new usernames', () => {
    const saved = setup({contact: true});
    expect(saved.first_name).toBe('Mom');
    expect(saved.last_name).toBe('');
    expect(saved.usernames).toBe(usernames);
  });

  it('takes the new name when not a contact', () => {
    const saved = setup({});
    expect(saved.first_name).toBe('Anna');
    expect(saved.last_name).toBe('Smith');
    expect(saved.usernames).toBe(usernames);
  });
});
