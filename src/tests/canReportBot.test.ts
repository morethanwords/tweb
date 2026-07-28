import {describe, expect, it} from 'vitest';
import {User} from '@layer';
import {VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import canReportBot from '@appManagers/utils/bots/canReportBot';

function makeUser(pFlags: Partial<User.user['pFlags']> = {}): User.user {
  return {
    _: 'user',
    pFlags: {
      bot: true,
      ...pFlags
    }
  } as User.user;
}

describe('canReportBot', () => {
  it('allows ordinary bots', () => {
    expect(canReportBot(1, makeUser())).toBe(true);
  });

  it('rejects support bots', () => {
    expect(canReportBot(1, makeUser({support: true}))).toBe(false);
  });

  it('rejects the verification codes bot', () => {
    expect(canReportBot(VERIFICATION_CODES_BOT_ID, makeUser())).toBe(false);
  });

  it('rejects regular users', () => {
    expect(canReportBot(1, {_: 'user', pFlags: {}} as User.user)).toBe(false);
  });
});
