import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';
import withTimeout from '@helpers/schedulers/withTimeout';

// A round video's transcription waits for the update that brings the finished text. A request that
// fails without one — a flood wait, the network — fails the wait as well: nothing else would end it.

const peerId = (42 as UserId).toPeerId(false);

function setup(fail: (processError: (error: ApiError) => any) => Promise<any>) {
  const manager = new AppMessagesManager();
  const processLocalUpdate = vi.fn((update: any) => (manager as any).onUpdateTranscribedAudio(update));
  Object.assign(manager as any, {
    waitingTranscriptions: new Map(),
    transcriptionIds: new Map(),
    rootScope: {dispatchEvent: vi.fn()},
    apiManager: {
      invokeApiSingleProcess: (o: {processError: (error: ApiError) => any}) => fail(o.processError)
    },
    apiUpdatesManager: {processLocalUpdate},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '0'}),
      getOutputPeer: () => ({_: 'peerUser', user_id: 42}),
      getPeerId: () => peerId
    },
    appMessagesIdsManager: {generateMessageId: (id: number) => id}
  });

  const message = {
    _: 'message',
    id: 9,
    mid: 9,
    peerId,
    peer_id: {_: 'peerUser', user_id: 42},
    pFlags: {},
    date: 0,
    message: ''
  } as Message.message;

  return {manager, message};
}

const settled = (promise: Promise<any>) => withTimeout(
  promise.then((result) => ({result}), (error) => ({error})),
  50,
  'still waiting'
);

describe('waiting for a round video\'s transcription', () => {
  test('a request that fails without an update fails the wait', async() => {
    const {manager, message} = setup((processError) => {
      return Promise.reject({type: 'FLOOD_WAIT_5'}).catch(processError);
    });

    expect(await settled(manager.transcribeAudio(message, true))).toEqual({error: {type: 'FLOOD_WAIT_5'}});
    expect((manager as any).waitingTranscriptions.size).toBe(0);
  });

  test('a transcription the server could not make still gives an empty text', async() => {
    const {manager, message} = setup((processError) => {
      return Promise.reject({type: 'TRANSCRIPTION_FAILED'}).catch(processError);
    });

    const outcome = await settled(manager.transcribeAudio(message, true));
    expect(outcome).toMatchObject({result: {text: ''}});
  });
});
