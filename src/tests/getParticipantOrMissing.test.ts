import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppProfileManager} from '@appManagers/appProfileManager';

describe('a participant for the admin editor', () => {
  const myId = (1 as UserId).toPeerId(false);
  const userId = (30 as UserId).toPeerId(false);

  function makeManager(getParticipant: () => Promise<unknown>, kind: 'channel' | 'community' | 'chat') {
    const manager = new AppProfileManager();
    Object.assign(manager as any, {
      rootScope: {myId},
      appChatsManager: {
        isChannel: () => kind === 'channel',
        isCommunity: () => kind === 'community'
      },
      getParticipant
    });

    return manager;
  }

  it('is the member as they are', async() => {
    const member = {_: 'channelParticipant', user_id: userId.toUserId(), date: 1};
    const manager = makeManager(vi.fn().mockResolvedValue(member), 'channel');
    expect(await manager.getParticipantOrMissing(10 as ChatId, userId)).toEqual({participant: member, missing: false});
  });

  it('is a plain member made up for someone not in the chat', async() => {
    const notParticipant = () => Promise.reject({type: 'USER_NOT_PARTICIPANT'});

    for(const kind of ['channel', 'community'] as const) {
      expect(await makeManager(notParticipant, kind).getParticipantOrMissing(10 as ChatId, userId)).toEqual({
        participant: {_: 'channelParticipant', user_id: userId.toUserId(), date: expect.any(Number)},
        missing: true
      });
    }

    expect(await makeManager(notParticipant, 'chat').getParticipantOrMissing(10 as ChatId, userId)).toEqual({
      participant: {
        _: 'chatParticipant',
        user_id: userId.toUserId(),
        inviter_id: myId.toUserId(),
        date: expect.any(Number)
      },
      missing: true
    });
  });

  it('passes any other error on', async() => {
    const error = {type: 'CHANNEL_PRIVATE'};
    const manager = makeManager(() => Promise.reject(error), 'channel');
    await expect(manager.getParticipantOrMissing(10 as ChatId, userId)).rejects.toBe(error);
  });
});
