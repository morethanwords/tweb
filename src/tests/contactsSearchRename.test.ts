import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {User} from '@layer';
import noop from '@helpers/noop';
import {makeContactUser, makeUserSavingManager} from '@/tests/helpers/contactsManager';

// Contact search (the Contacts tab, the sidebar's search, pickers) looks a contact up by the words they were indexed
// with when they joined the list. A contact renamed afterwards (Edit Contact), or one who took a new username, was
// still found by the old name only, for the rest of the session.

const USER_ID = 10 as UserId;

const contact = (first_name: string, username?: string): User.user => ({
  ...makeContactUser(USER_ID, first_name),
  usernames: username ? [{_: 'username', username, pFlags: {active: true}}] : undefined
});

async function setup() {
  const {manager, invokeApi} = makeUserSavingManager();
  Object.assign(manager as any, {appStoriesManager: {saveApiPeerStories: noop}});
  invokeApi.mockResolvedValue({_: 'contacts.contacts', contacts: [{_: 'contact', user_id: USER_ID}], saved_count: 0, users: [contact('Anna')]});
  await manager.getContacts();

  return manager;
}

describe('a contact found by search', () => {
  it('is found by the name they were given, not the old one', async() => {
    const manager = await setup();
    manager.saveApiUser(contact('Annie'));

    expect(await manager.getContacts('annie')).toEqual([USER_ID]);
    expect(await manager.getContacts('anna')).toEqual([]);
  });

  it('is found by a new username', async() => {
    const manager = await setup();
    manager.saveApiUser(contact('Anna', 'anna_new'));

    expect(await manager.getContacts('anna_new')).toEqual([USER_ID]);
  });
});
