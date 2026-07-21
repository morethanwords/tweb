import {Message, MessageReactions} from '@layer';
import {AppReactionsManager} from '@appManagers/appReactionsManager';
import '@helpers/peerIdPolyfill';

const fire = {_: 'reactionEmoji' as const, emoticon: '🔥'};
const peerId = (100 as ChatId).toPeerId(true);
const participantPeerId = (200 as UserId).toPeerId(false);

const reactions: MessageReactions = {
  _: 'messageReactions',
  pFlags: {},
  results: [{_: 'reactionCount', reaction: fire, count: 1}]
};

const message = (mid: number): Message.message => ({
  _: 'message',
  pFlags: {},
  id: mid,
  mid,
  peerId,
  fromId: participantPeerId,
  date: 1,
  message: '',
  reactions
} as Message.message);

describe('AppReactionsManager.deleteParticipantReactions', () => {
  it('reconciles a bounded newest set after the Bool-only bulk response', async() => {
    const storage = new Map<number, Message.message>();
    storage.set(-1, message(-1));
    for(let mid = 1; mid <= 102; ++mid) {
      storage.set(mid, message(mid));
    }

    const invokeApiSingle = vi.fn().mockResolvedValue(true);
    const getMessagesReactions = vi.fn().mockResolvedValue(undefined);
    const manager = Object.assign(Object.create(AppReactionsManager.prototype), {
      appMessagesManager: {getHistoryMessagesStorage: () => storage},
      appPeersManager: {
        getInputPeerById: (id: PeerId) => ({id}),
        getOutputPeer: () => ({_: 'peerChannel', channel_id: 100}),
        isForum: () => false,
        isBotforum: () => false
      },
      apiManager: {invokeApiSingle},
      apiUpdatesManager: {processLocalUpdate: vi.fn()},
      getMessagesReactions
    }) as AppReactionsManager;

    await manager.deleteParticipantReactions({peerId, participantPeerId});

    expect(invokeApiSingle).toHaveBeenCalledWith('messages.deleteParticipantReactions', {
      peer: {id: peerId},
      participant: {id: participantPeerId}
    });
    expect(getMessagesReactions).toHaveBeenCalledOnce();
    expect(getMessagesReactions).toHaveBeenCalledWith(
      peerId,
      Array.from({length: 100}, (_, idx) => 102 - idx)
    );
  });

  it('keeps a successful deletion successful when reconciliation fails', async() => {
    const manager = Object.assign(Object.create(AppReactionsManager.prototype), {
      appMessagesManager: {getHistoryMessagesStorage: () => new Map([[1, message(1)]])},
      appPeersManager: {
        getInputPeerById: (id: PeerId) => ({id}),
        getOutputPeer: () => ({_: 'peerChannel', channel_id: 100}),
        isForum: () => false,
        isBotforum: () => false
      },
      apiManager: {invokeApiSingle: vi.fn().mockResolvedValue(true)},
      apiUpdatesManager: {processLocalUpdate: vi.fn()},
      getMessagesReactions: vi.fn().mockRejectedValue(new Error('refresh failed'))
    }) as AppReactionsManager;

    await expect(manager.deleteParticipantReactions({peerId, participantPeerId})).resolves.toBe(true);
  });
});

describe('AppReactionsManager.reportParticipantReaction', () => {
  it('reports the reacting participant instead of the message author', async() => {
    const invokeApiSingle = vi.fn().mockResolvedValue(true);
    const manager = Object.assign(Object.create(AppReactionsManager.prototype), {
      appPeersManager: {
        getInputPeerById: (id: PeerId) => ({id})
      },
      apiManager: {invokeApiSingle}
    }) as AppReactionsManager;

    await manager.reportParticipantReaction({peerId, mid: 17, participantPeerId});

    expect(invokeApiSingle).toHaveBeenCalledWith('messages.reportReaction', {
      peer: {id: peerId},
      id: 17,
      reaction_peer: {id: participantPeerId}
    });
  });
});
