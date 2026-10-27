import {describe, expect, it} from 'vitest';
import {getFloodWaitTime} from '@appManagers/utils/getFloodWaitTime';

describe('getFloodWaitTime', () => {
  it('reads the wait out of a FLOOD_WAIT error', () => {
    expect(getFloodWaitTime({type: 'FLOOD_WAIT_90'} as ApiError)).toEqual({hasWaitTime: true, waitTime: 90});
  });

  it('has no wait for any other error, or a zero one', () => {
    expect(getFloodWaitTime({type: 'PHONE_CODE_INVALID'} as ApiError)).toEqual({hasWaitTime: false});
    expect(getFloodWaitTime({type: 'FLOOD_WAIT_0'} as ApiError)).toEqual({hasWaitTime: false});
  });

  // a sign-in card parses whatever its request rejected with, and must still reach its cleanup after
  it('has no wait for a failure without a type, instead of throwing', () => {
    expect(getFloodWaitTime(new Error('network') as any as ApiError)).toEqual({hasWaitTime: false});
    expect(getFloodWaitTime(undefined)).toEqual({hasWaitTime: false});
  });
});
