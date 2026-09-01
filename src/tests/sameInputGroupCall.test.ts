import {describe, expect, it} from 'vitest';
import sameInputGroupCall from '@lib/calls/helpers/sameInputGroupCall';

describe('sameInputGroupCall', () => {
  it('compares canonical identity by id rather than access hash representation', () => {
    expect(sameInputGroupCall(
      {_: 'inputGroupCall', id: 42, access_hash: 'old'},
      {_: 'inputGroupCall', id: '42', access_hash: 'new'}
    )).toBe(true);
  });

  it('compares unresolved references only within the same constructor', () => {
    expect(sameInputGroupCall(
      {_: 'inputGroupCallSlug', slug: 'conference'},
      {_: 'inputGroupCallSlug', slug: 'conference'}
    )).toBe(true);
    expect(sameInputGroupCall(
      {_: 'inputGroupCallInviteMessage', msg_id: 10},
      {_: 'inputGroupCallInviteMessage', msg_id: 11}
    )).toBe(false);
    expect(sameInputGroupCall(
      {_: 'inputGroupCallSlug', slug: '42'},
      {_: 'inputGroupCall', id: 42, access_hash: 'hash'}
    )).toBe(false);
  });
});
