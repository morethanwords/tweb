import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {makeContactUser, makeUserSavingManager} from '@/tests/helpers/contactsManager';

// A contact made by phone number (New Contact) is usually someone the app has not met: the server hands them over
// already marked as a contact. The marked user was saved, and the contacts list - which the Contacts tab and contact
// search read - was then told nothing changed, because the user read as a contact already: the new contact stayed
// out of it until a reload. The same for anyone first seen as a contact (added on another device). Telegram Desktop
// puts a user whose contact status was not known yet into its contacts (UserData::setIsContact).

const USER_ID = 10 as UserId;

function setup(contactsKnown: boolean) {
  const {manager, invokeApi, dispatchEvent} = makeUserSavingManager();
  Object.assign(manager as any, {contactsKnown});

  return {manager, dispatchEvent, invokeApi};
}

const newContact = () => makeContactUser(USER_ID, 'Anna');

describe('a user first seen as a contact', () => {
  it('made by phone, is in the contacts list and found by name', async() => {
    const {manager, dispatchEvent, invokeApi} = setup(true);
    invokeApi.mockResolvedValue({
      _: 'contacts.importedContacts',
      imported: [{_: 'importedContact', user_id: USER_ID, client_id: '0'}],
      popular_invites: [],
      retry_contacts: [],
      users: [newContact()]
    });

    await expect(manager.importContacts([{phones: ['15550001'], first_name: 'Anna', last_name: ''}])).resolves.toEqual([USER_ID]);

    expect(await manager.getContacts('anna')).toEqual([USER_ID]);
    expect(dispatchEvent).toHaveBeenCalledWith('contacts_update', USER_ID);
  });

  it('waits for the contacts list while it is not known: its fill brings them', () => {
    const {manager, dispatchEvent} = setup(false);
    manager.saveApiUser(newContact());

    expect(dispatchEvent).not.toHaveBeenCalledWith('contacts_update', USER_ID);
  });
});
