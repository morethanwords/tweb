import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {User} from '@layer';
import noop from '@helpers/noop';
import {makeUserSavingManager} from '@/tests/helpers/contactsManager';

// What writing to a user costs me is read from their full profile once one is here (getRequirementToContact): the
// user object carries the public price, the full profile the price for me. A full profile kept from before the user
// turned paid messages on said "free", and went on saying it - no price in the composer, the first send refused.
// Telegram Desktop asks again once a price shows up on the user (data_session.cpp: MessageMoneyRestrictionsKnown is
// dropped when HasStarsPerMessage appears).

const USER_ID = 10 as UserId;

function setup(hasFull: boolean) {
  const getProfile = vi.fn().mockResolvedValue({});
  const {manager} = makeUserSavingManager();
  Object.assign(manager as any, {
    appStoriesManager: {saveApiPeerStories: noop},
    appProfileManager: {getCachedFullUser: () => hasFull ? {_: 'userFull', id: USER_ID, pFlags: {}} : undefined, getProfile}
  });

  const user = (stars?: number): User.user => ({_: 'user', id: USER_ID, access_hash: '1', first_name: 'Anna', send_paid_messages_stars: stars, pFlags: {}});
  manager.saveApiUser(user());
  return {manager, user, getProfile};
}

describe('a user whose messages start to cost', () => {
  it('has their full profile asked for again', () => {
    const {manager, user, getProfile} = setup(true);
    manager.saveApiUser(user(10));
    expect(getProfile).toHaveBeenCalledWith(USER_ID, true);
  });

  it('is not asked about again while the price stays', () => {
    const {manager, user, getProfile} = setup(true);
    manager.saveApiUser(user());
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('is not asked about when no full profile of them is here', () => {
    const {manager, user, getProfile} = setup(false);
    manager.saveApiUser(user(10));
    expect(getProfile).not.toHaveBeenCalled();
  });
});
