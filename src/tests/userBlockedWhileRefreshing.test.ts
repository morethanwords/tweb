import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {UserFull} from '@layer';
import {AppProfileManager} from '@appManagers/appProfileManager';

vi.mock('@lib/apiManagerProxy', () => import('@/tests/mocks/stubModule'));

// A chat with a blocked user shows "Unblock" in place of the composer, and a blocked bot "Restart". That is read
// without waiting (isCachedUserBlocked). Once the user's full profile had run out (3 minutes), the read gave nothing
// while the profile was asked anew: the chat opened with the usual composer, and a profile update meanwhile (a
// wallpaper, a theme) swapped "Unblock" for it and back. What was known stays known while the new answer comes.

const USER_ID = 2 as UserId;

function setup(options: {full?: 'fresh' | 'expired', blockedUpdate?: boolean}) {
  const manager = new AppProfileManager();
  const usersFull: Record<UserId, UserFull.userFull> = {};
  if(options.full) {
    usersFull[USER_ID] = {_: 'userFull', id: USER_ID, pFlags: {blocked: true}} as UserFull.userFull;
  }

  Object.assign(manager as any, {
    usersFull,
    // * a fresh profile is answered at once, one that ran out is asked anew
    getProfile: (userId: UserId) => options.full === 'fresh' ? usersFull[userId] : new Promise(() => {})
  });

  if(options.blockedUpdate !== undefined) {
    (manager as any).usersBlocked.set(USER_ID, options.blockedUpdate);
  }

  return manager;
}

describe('whether a user is blocked, read without waiting', () => {
  it('is what their profile says', () => {
    expect(setup({full: 'fresh'}).isCachedUserBlocked(USER_ID)).toBe(true);
  });

  it('stays what their profile said while a profile that ran out is asked anew', () => {
    expect(setup({full: 'expired'}).isCachedUserBlocked(USER_ID)).toBe(true);
  });

  it('is what the last block update said when no profile is here', () => {
    expect(setup({blockedUpdate: true}).isCachedUserBlocked(USER_ID)).toBe(true);
    expect(setup({blockedUpdate: false}).isCachedUserBlocked(USER_ID)).toBe(false);
  });

  it('is unknown when nothing is', () => {
    expect(setup({}).isCachedUserBlocked(USER_ID)).toBeUndefined();
  });
});
