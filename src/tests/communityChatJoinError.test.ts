import {afterEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  toastNew: vi.fn()
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

import handleCommunityChatJoinError
from '@components/communities/handleCommunityChatJoinError';

function createOptions(errorType: string, isBroadcast = false) {
  const getChatFull = vi.fn().mockResolvedValue(undefined);
  const options = {
    error: {type: errorType} as ApiError,
    isBroadcast,
    communityId: 10 as ChatId,
    managers: {
      appProfileManager: {getChatFull}
    } as any
  };
  return {getChatFull, options};
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('handleCommunityChatJoinError', () => {
  it.each([
    [false, 'Community.GroupRequestSent'],
    [true, 'Community.ChannelRequestSent']
  ])('handles a sent join request for broadcast=%s', (
    isBroadcast,
    langPackKey
  ) => {
    const {getChatFull, options} = createOptions(
      'INVITE_REQUEST_SENT',
      isBroadcast
    );

    expect(handleCommunityChatJoinError(options)).toBe(true);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey});
    expect(getChatFull).not.toHaveBeenCalled();
  });

  it.each(['USERS_TOO_MUCH', 'GROUP_FULL'])(
    'handles %s as a full group',
    (errorType) => {
      const {options} = createOptions(errorType);

      expect(handleCommunityChatJoinError(options)).toBe(true);
      expect(mocks.toastNew).toHaveBeenCalledWith({
        langPackKey: 'Community.GroupFull'
      });
    }
  );

  it.each([
    'CHANNEL_PRIVATE',
    'CHANNEL_PUBLIC_GROUP_NA',
    'USER_BANNED_IN_CHANNEL',
    'ACCESS_DENIED'
  ])('handles %s as an inaccessible peer', (errorType) => {
    const {getChatFull, options} = createOptions(errorType, true);

    expect(handleCommunityChatJoinError(options)).toBe(true);
    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'Community.ChannelNotAccessible'
    });
    expect(getChatFull).toHaveBeenCalledWith(10, true);
  });

  it('leaves an unknown error to the caller', () => {
    const {getChatFull, options} = createOptions('UNKNOWN');

    expect(handleCommunityChatJoinError(options)).toBe(false);
    expect(mocks.toastNew).not.toHaveBeenCalled();
    expect(getChatFull).not.toHaveBeenCalled();
  });
});
