import {describe, expect, it} from 'vitest';
import getConferenceInviteErrorLangKey, {
  isConferenceInviteInvalidError
} from '@lib/calls/conferenceInviteError';

describe('conference invite error UX', () => {
  it.each([
    'GROUPCALL_INVALID',
    'GROUPCALL_FORBIDDEN',
    'INVITE_HASH_EXPIRED',
    'INVITE_SLUG_EXPIRED',
    'INVITE_SLUG_INVALID'
  ])('maps %s to the expired-invite message', (type) => {
    const error = {type};

    expect(isConferenceInviteInvalidError(error)).toBe(true);
    expect(getConferenceInviteErrorLangKey(error)).toBe('InviteExpired');
  });

  it('keeps transport and unknown errors generic', () => {
    expect(isConferenceInviteInvalidError({type: 'NETWORK_ERROR'})).toBe(false);
    expect(getConferenceInviteErrorLangKey(new Error('offline'))).toBe('Error.AnError');
  });
});
