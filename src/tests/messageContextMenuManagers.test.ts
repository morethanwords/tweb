import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppPollsManager} from '@appManagers/appPollsManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {AppChatsManager} from '@appManagers/appChatsManager';
import type {Message, Update, Updates} from '@layer';

const PEER_ID = (2).toPeerId(false);

describe('AppMessagesManager: rating a transcription', () => {
  const makeManager = () => {
    const manager = new AppMessagesManager();
    const invokeApi = vi.fn(() => Promise.resolve(true));
    Object.assign(manager as any, {
      transcriptionIds: new Map(),
      waitingTranscriptions: new Map(),
      apiManager: {invokeApi},
      appPeersManager: {
        getPeerId: () => PEER_ID,
        getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId.toUserId(), access_hash: 0})
      },
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      rootScope: {dispatchEvent: vi.fn()}
    });

    const transcribed = (update: Partial<Update.updateTranscribedAudio>) => (manager as any).onUpdateTranscribedAudio({
      _: 'updateTranscribedAudio',
      pFlags: {},
      peer: {_: 'peerUser', user_id: 2},
      msg_id: 10,
      text: '',
      transcription_id: 0,
      ...update
    } as Update.updateTranscribedAudio);

    return {manager, invokeApi, transcribed};
  };

  it('is offered once the transcription is done', () => {
    const {manager, transcribed} = makeManager();
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(false);

    transcribed({pFlags: {pending: true}, text: 'Hel', transcription_id: 7});
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(false);

    transcribed({text: 'Hello', transcription_id: 7});
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(true);
  });

  it('is not offered for a transcription that failed', () => {
    const {manager, transcribed} = makeManager();
    transcribed({text: 'Hello', transcription_id: 7});
    transcribed({text: '', transcription_id: 0});
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(false);
  });

  it('sends the rating once and does not ask again', async() => {
    const {manager, invokeApi, transcribed} = makeManager();
    transcribed({text: 'Hello', transcription_id: 7});

    await manager.rateTranscribedAudio(PEER_ID, 10, false);
    expect(invokeApi).toHaveBeenCalledWith('messages.rateTranscribedAudio', {
      peer: {_: 'inputPeerUser', user_id: 2, access_hash: 0},
      msg_id: 10,
      transcription_id: 7,
      good: false
    });
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(false);

    // * the same transcription, got again, stays rated
    transcribed({text: 'Hello', transcription_id: 7});
    expect(manager.canRateTranscription(PEER_ID, 10)).toBe(false);
    expect(await manager.rateTranscribedAudio(PEER_ID, 10, true)).toBe(false);
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });
});

describe('AppPollsManager: deleting an added option', () => {
  const makeMessage = (pFlags: Message.message['pFlags'] = {}) => ({
    _: 'message',
    pFlags,
    peerId: PEER_ID,
    mid: 15,
    media: {_: 'messageMediaPoll', poll: {_: 'poll', id: 1, pFlags: {}}}
  } as any as Message.message);

  const makeManager = () => {
    const manager = new AppPollsManager();
    const updates = {_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0} as Updates;
    const invokeApi = vi.fn(() => Promise.resolve(updates));
    const processUpdateMessage = vi.fn();
    const invokeAfterMessageIsSent = vi.fn();
    Object.assign(manager as any, {
      apiManager: {invokeApi},
      apiUpdatesManager: {processUpdateMessage},
      appMessagesManager: {isEphemeralMessage: () => false, invokeAfterMessageIsSent},
      appPeersManager: {
        getPeerMigratedTo: (): PeerId => undefined,
        getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId.toUserId(), access_hash: 0})
      }
    });

    return {manager, invokeApi, processUpdateMessage, invokeAfterMessageIsSent, updates};
  };

  it('asks the server by the option and applies what it answers', async() => {
    const {manager, invokeApi, processUpdateMessage, updates} = makeManager();
    const option = new Uint8Array([3]);
    await manager.deletePollAnswer(makeMessage(), option);

    expect(invokeApi).toHaveBeenCalledWith('messages.deletePollAnswer', {
      peer: {_: 'inputPeerUser', user_id: 2, access_hash: 0},
      msg_id: 15,
      option
    });
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
  });

  it('waits for a poll still being sent', () => {
    const {manager, invokeApi, invokeAfterMessageIsSent} = makeManager();
    manager.deletePollAnswer(makeMessage({is_outgoing: true}), new Uint8Array([3]));
    expect(invokeAfterMessageIsSent).toHaveBeenCalledWith(15, 'deletePollAnswer', expect.any(Function));
    expect(invokeApi).not.toHaveBeenCalled();
  });
});

describe('AppUsersManager: blocking from the Replies chat', () => {
  it('sends what was checked and marks the peer blocked', async() => {
    const manager = new AppUsersManager();
    const updates = {_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0} as Updates;
    const invokeApi = vi.fn(() => Promise.resolve(updates));
    const processUpdateMessage = vi.fn();
    const processLocalUpdate = vi.fn();
    Object.assign(manager as any, {
      apiManager: {invokeApi},
      apiUpdatesManager: {processUpdateMessage, processLocalUpdate},
      appPeersManager: {getOutputPeer: (peerId: PeerId) => ({_: 'peerUser', user_id: peerId.toUserId()})},
      appProfileManager: {refreshPeerSettingsIfNeeded: vi.fn(), getCachedFullUser: vi.fn()}
    });

    await manager.blockFromReplies(PEER_ID, 20, {deleteMessage: true, deleteHistory: false, reportSpam: true});

    expect(invokeApi).toHaveBeenCalledWith('contacts.blockFromReplies', {
      msg_id: 20,
      delete_message: true,
      delete_history: undefined,
      report_spam: true
    });
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(processLocalUpdate).toHaveBeenCalledWith({
      _: 'updatePeerBlocked',
      peer_id: {_: 'peerUser', user_id: 2},
      pFlags: {blocked: true, blocked_my_stories_from: undefined}
    });
  });
});

describe('AppChatsManager: the author of a message posted as the channel', () => {
  const makeManager = (invokeApi: ReturnType<typeof vi.fn>) => {
    const manager = new AppChatsManager();
    const saveApiUser = vi.fn();
    Object.assign(manager as any, {
      apiManager: {invokeApi},
      appUsersManager: {saveApiUser},
      getChannelInput: (chatId: ChatId) => ({_: 'inputChannel', channel_id: chatId, access_hash: 0})
    });

    return {manager, saveApiUser};
  };

  it('asks once a session and saves the user', async() => {
    const user = {_: 'user', id: 5, pFlags: {}};
    const invokeApi = vi.fn(() => Promise.resolve(user));
    const {manager, saveApiUser} = makeManager(invokeApi);

    expect(await manager.getMessageAuthor(3, 30)).toBe((5).toPeerId(false));
    expect(await manager.getMessageAuthor(3, 30)).toBe((5).toPeerId(false));
    expect(invokeApi).toHaveBeenCalledTimes(1);
    expect(invokeApi).toHaveBeenCalledWith('channels.getMessageAuthor', {
      channel: {_: 'inputChannel', channel_id: 3, access_hash: 0},
      id: 30
    });
    expect(saveApiUser).toHaveBeenCalledWith(user);
  });

  it('answers nothing when the server does not say', async() => {
    const invokeApi = vi.fn(() => Promise.reject({type: 'MESSAGE_AUTHOR_REQUIRED'}));
    const {manager} = makeManager(invokeApi);

    expect(await manager.getMessageAuthor(3, 31)).toBeUndefined();
    expect(await manager.getMessageAuthor(3, 31)).toBeUndefined();
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });
});
