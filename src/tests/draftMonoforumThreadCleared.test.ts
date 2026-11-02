import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import type {DraftMessage} from '@layer';
import pause from '@helpers/schedulers/pause';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {captureDraftUpdates} from '@/tests/helpers/draftUpdates';

const MONOFORUM_ID = (200 as ChatId).toPeerId(true);
const THREAD_ID = (7 as UserId).toPeerId(false);

async function setup() {
  const manager = new AppDraftsManager();
  const dispatchEvent = vi.fn();
  const updates = captureDraftUpdates();

  Object.assign(manager, {
    apiManager: {invokeApi: vi.fn(async() => true)},
    apiUpdatesManager: updates.apiUpdatesManager,
    appDocsManager: {saveDoc: (document: unknown) => document},
    appPhotosManager: {savePhoto: (photo: unknown) => photo},
    appPeersManager: {
      getPeerId,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId, access_hash: '1'}),
      isChannel: () => true,
      isMonoforum: (peerId: PeerId) => peerId === MONOFORUM_ID
    },
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    appStateManager: {storage: {get: async(): Promise<unknown> => undefined, set: vi.fn()}},
    rootScope: {myId: (1 as UserId).toPeerId(false), dispatchEvent}
  });
  (manager as unknown as {after(): void}).after();
  await pause(0); // * the drafts kept from before come back from storage

  const receive = (draft: DraftMessage) => updates.receive({
    peer: {_: 'peerChannel', channel_id: 200},
    saved_peer_id: {_: 'peerUser', user_id: 7},
    draft
  });

  return {manager, dispatchEvent, receive};
}

// * a thread's draft cleared elsewhere (or by a message sent there from another device) comes as an empty draft of
// * the thread: it is the thread's that goes, as tdesktop's ClearPeerCloudDraft(peer, topic, monoforumPeerId)
test('clears a monoforum thread\'s draft when the server says it is gone', async() => {
  const {manager, dispatchEvent, receive} = await setup();
  receive({_: 'draftMessage', pFlags: {}, date: 1, message: 'Hello'});
  expect(manager.getDraft(MONOFORUM_ID, THREAD_ID as number)?.message).toBe('Hello');
  dispatchEvent.mockClear();

  receive({_: 'draftMessageEmpty', date: 2});

  expect(manager.getDraft(MONOFORUM_ID, THREAD_ID as number)).toBeUndefined();
  expect(dispatchEvent).toHaveBeenCalledWith('draft_updated', expect.objectContaining({
    peerId: MONOFORUM_ID,
    monoforumThreadId: THREAD_ID,
    draft: undefined
  }));
});
