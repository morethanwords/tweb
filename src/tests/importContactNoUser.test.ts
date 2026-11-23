import {AppUsersManager} from '@appManagers/appUsersManager';
import '@helpers/peerIdPolyfill';

// Adding a contact whose number is not on Telegram: contacts.importContacts imports nobody, and the
// popup says so by the error's `type`. The manager runs in a worker, so the error reaches the popup
// through postMessage - a structured clone, which keeps an Error's name and message and drops the rest.

describe('importContact of a number not on Telegram', () => {
  test('fails with NO_USER that survives the trip from the worker', async() => {
    const manager = new AppUsersManager();
    Object.assign(manager, {
      importContacts: vi.fn().mockResolvedValue([])
    });

    const error = await manager.importContact('Name', '', '+99900000000').then(
      (): unknown => undefined,
      (err: unknown) => err
    );

    expect((structuredClone(error) as ApiError)?.type).toBe('NO_USER');
  });
});
