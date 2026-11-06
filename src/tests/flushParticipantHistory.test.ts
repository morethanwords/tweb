import {describe, expect, it, vi} from 'vitest';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import '@helpers/peerIdPolyfill';

const channelPeerId = (100 as ChatId).toPeerId(true);
const participantPeerId = (200 as UserId).toPeerId(false);
const otherPeerId = (201 as UserId).toPeerId(false);

/**
 * `channels.deleteParticipantHistory` answers `offset > 0` while the participant has more messages: every next round
 * deletes the same participant's, never the whole chat's.
 */
function createManager(offsets: number[]) {
  const manager = Object.create(AppMessagesManager.prototype) as any;
  const calls: {method: string, params: any}[] = [];
  manager.apiManager = {
    invokeApiSingleProcess: vi.fn(({method, params, processResult}) => {
      calls.push({method, params});
      return Promise.resolve(processResult({pts: calls.length, pts_count: 1, offset: offsets[calls.length - 1] ?? 0}));
    })
  };
  manager.apiUpdatesManager = {processLocalUpdate: vi.fn()};
  manager.appPeersManager = {
    isSavedDialog: () => false,
    isBotforum: () => false,
    isForum: () => false,
    getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId})
  };
  manager.appChatsManager = {getChannelInput: (chatId: ChatId) => ({_: 'inputChannel', chatId})};
  manager.getHistoryMessagesStorage = () => new Map([
    [1, {mid: 1, fromId: participantPeerId}],
    [2, {mid: 2, fromId: otherPeerId}]
  ]);
  manager.isEphemeralMessage = () => false;
  manager.processLocalDeleteMessages = vi.fn();
  return {manager, calls};
}

describe('Deleting a participant\'s history', () => {
  it('asks for the same participant\'s messages in every round', async() => {
    const {manager, calls} = createManager([5, 3, 0]);
    await manager.doFlushHistory({peerId: channelPeerId, participantPeerId});

    expect(calls.map(({method}) => method)).toEqual([
      'channels.deleteParticipantHistory',
      'channels.deleteParticipantHistory',
      'channels.deleteParticipantHistory'
    ]);
    for(const {params} of calls) {
      expect(params.participant).toEqual({_: 'inputPeer', peerId: participantPeerId});
    }

    // the loaded messages go once the server is done: the participant's only
    expect(manager.processLocalDeleteMessages).toHaveBeenCalledTimes(1);
    expect(manager.processLocalDeleteMessages).toHaveBeenCalledWith(channelPeerId, [1]);
  });
});
