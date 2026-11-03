import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import deferredPromise from '@helpers/cancellablePromise';
import tsNow from '@helpers/tsNow';
import type {InputRichMessage, Peer} from '@layer';
import {captureDraftUpdates} from '@/tests/helpers/draftUpdates';
import {draftMessage} from '@/tests/helpers/drafts';

const PEER_ID = (42 as UserId).toPeerId(false);
const PEER = {_: 'peerUser', user_id: 42} as const;
const RECONCILE_DELAY = 2000;

/** `serverTimeLag`: how far the server's clock as this session keeps it is behind the server's own */
async function setup({serverTimeLag = 0} = {}) {
  const manager = new AppDraftsManager();
  const invokeApi = vi.fn(async(_method: string, _params?: unknown): Promise<unknown> => true);
  const updates = captureDraftUpdates();
  const dispatchEvent = vi.fn();

  Object.assign(manager, {
    apiManager: {invokeApi},
    apiUpdatesManager: updates.apiUpdatesManager,
    appMessagesManager: {
      getDialogOnly: () => ({}),
      assertRichMessage: async() => {},
      invokeWithRichMessageReferenceRetry: (_input: unknown, invoke: () => Promise<unknown>) => invoke(),
      resolveInputRichMessage: (input: InputRichMessage) => input
    },
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'}),
      getPeerId: (peer: Peer) => peer._ === 'peerChannel' ? peer.channel_id.toPeerId(true) : (peer as Peer.peerUser).user_id.toPeerId(false),
      isChannel: (peerId: PeerId) => peerId.isAnyChat(),
      isMonoforum: () => false
    },
    monoforumDialogsStorage: {checkPreloadedDraft: () => {}},
    appStateManager: {storage: {get: async() => ({}), set: () => {}}},
    dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
    rootScope: {myId: (1 as UserId).toPeerId(false), dispatchEvent},
    timeManager: {getServerTimeOffset: () => -serverTimeLag, getServerTime: () => tsNow(true) - serverTimeLag}
  });

  (manager as unknown as {after(): void}).after();
  // * the drafts kept from before come in
  await Promise.resolve();

  const save = (message: string) => manager.syncDraft({
    peerId: PEER_ID,
    localDraft: draftMessage({date: 0, message})
  });

  /** what the server pushes of the draft */
  const receive = (message: string, date = 0) => updates.receive({
    peer: PEER,
    draft: draftMessage({date, message})
  });

  /** a read of the drafts: answered with `message` once `answer` is called */
  const read = () => {
    const answer = deferredPromise<unknown>();
    invokeApi.mockImplementationOnce(() => answer);
    const reading = manager.addMissedDialogs();
    return {
      answer: (message: string, date: number) => {
        answer.resolve({_: 'updates', users: [], chats: [], updates: [
          {_: 'updateDraftMessage', peer: PEER, draft: draftMessage({date, message})}
        ]});
        return reading;
      }
    };
  };

  const text = () => manager.getDraft(PEER_ID)?.message;
  const rereads = () => invokeApi.mock.calls.filter(([method]) => method === 'messages.getAllDrafts').length;
  const announced = () => dispatchEvent.mock.calls.filter(([name]) => name === 'draft_updated').map(([, {draft}]) => draft?.message);

  /** the reads of the drafts after the first answer this, holding none */
  const holdNoDrafts = () => invokeApi.mockImplementation(async(method: string) => {
    return method === 'messages.getAllDrafts' ? {_: 'updates', users: [], chats: [], updates: []} : true;
  });

  return {manager, invokeApi, receive, read, rereads, save, text, announced, updates, holdNoDrafts, dispatchEvent};
}

beforeEach(() => vi.useFakeTimers({now: new Date('2026-11-03T00:00:00Z')}));
afterEach(() => vi.useRealTimers());

// * pushed while the save is on its way: the server may have taken either first, so the drafts are read again once
// * it has ended, and that read is the server's draft as it stands
test('leaves out what the server pushes while its own save is on its way, and reads the drafts again after', async() => {
  const {invokeApi, receive, rereads, save, text, announced} = await setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const saving = save('Mine');

  receive('From another session', tsNow(true));
  expect(text()).toBe('Mine');
  expect(announced()).toEqual(['Mine']);

  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(0);

  request.resolve(true);
  await saving;
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(1);
});

test('leaves out a pushed draft dated before its save ended, and takes one dated after', async() => {
  const {receive, save, text} = await setup();
  await save('Mine');
  await vi.advanceTimersByTimeAsync(60e3);
  const savedAt = tsNow(true) - 60;

  receive('Older', savedAt - 1);
  expect(text()).toBe('Mine');
  receive('Newer', savedAt + 5);
  expect(text()).toBe('Newer');
});

// * the read at the start goes on to the updates only once they are in step (`syncLoading`), which can take long
test('leaves the saved text alone for a read of the drafts asked for before it, however late that comes', async() => {
  const {read, save, text} = await setup();
  const reading = read();
  await save('Mine');
  await vi.advanceTimersByTimeAsync(10e3);
  await reading.answer('Before the save', tsNow(true) - 30);
  expect(text()).toBe('Mine');
});

// * the server answered the read before it took the save: what it brings is older than the save, though dated after
// * the save began - and after it ended, by a clock of the server's this session keeps behind
// * the server may also have taken another session's draft after the save before it answered: what the read brought is
// * asked for again once no save is under way
test('leaves the saved text alone for a read under way as it saved, whatever its date, and reads again', async() => {
  const {invokeApi, read, rereads, save, text} = await setup({serverTimeLag: 10});
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const saving = save('Mine');
  await vi.advanceTimersByTimeAsync(1e3);
  const reading = read();
  const answeredAt = tsNow(true);
  await vi.advanceTimersByTimeAsync(2e3);
  request.resolve(true);
  await saving;
  await vi.advanceTimersByTimeAsync(10e3);
  await reading.answer('Read before the save was taken', answeredAt);
  expect(text()).toBe('Mine');

  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(2);
});

// * a dialog is measured by the drafts clock's tick it was asked for at, as a read of the drafts is
test('leaves the saved text alone for a dialog read under way as it saved', async() => {
  const {invokeApi, manager, save, text} = await setup({serverTimeLag: 10});
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const saving = save('Mine');
  await vi.advanceTimersByTimeAsync(1e3);
  const askedAt = manager.getDraftsClock();
  const answeredAt = tsNow(true);
  await vi.advanceTimersByTimeAsync(2e3);
  request.resolve(true);
  await saving;
  await vi.advanceTimersByTimeAsync(10e3);

  const kept = manager.saveDraft({peerId: PEER_ID, draft: draftMessage({date: answeredAt, message: 'In the dialog'}), cloud: true, askedAt});
  expect(kept?.message).toBe('Mine');
  expect(text()).toBe('Mine');
  // * nor does one with no draft in it take the saved one away
  manager.saveDraft({peerId: PEER_ID, draft: undefined, cloud: true, askedAt});
  expect(text()).toBe('Mine');
});

// * another session sent or cleared it: a dialog asked for after the save ended has none, which is the server's word
test('lets a dialog read asked for after its save ended take the draft away', async() => {
  const {manager, save, text} = await setup();
  await save('Mine');
  await vi.advanceTimersByTimeAsync(60e3);
  manager.saveDraft({peerId: PEER_ID, draft: undefined, cloud: true, askedAt: manager.getDraftsClock()});
  expect(text()).toBeUndefined();
});

// * another session wrote right after the save, within the seconds the clocks are given: a read asked for after the
// * save ended brings it as the server has it
test('takes what a read asked for after its save ended brings, whatever its date', async() => {
  const {read, save, text} = await setup();
  await save('Mine');
  const reading = read();
  await reading.answer('Right after it, elsewhere', tsNow(true));
  expect(text()).toBe('Right after it, elsewhere');
});

test('waits for its saves to end before reading the drafts again', async() => {
  const {invokeApi, receive, rereads, save} = await setup();
  await save('Mine');
  receive('From another session', tsNow(true));

  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const saving = save('Still typing');
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY * 2);
  expect(rereads()).toBe(0);

  request.resolve(true);
  await saving;
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(1);
});

// * the field takes it as the server's only when it is (ChatInput.saveDraft)
test('tells whether the draft it was given is the server\'s once the save ends', async() => {
  const {invokeApi, save} = await setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const first = save('First');
  await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
  const passedOver = save('Passed over');
  const last = save('Last');
  request.resolve(true);
  expect(await first).toBe(true);
  expect(await passedOver).toBe(false);
  expect(await last).toBe(true);

  invokeApi.mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'});
  await expect(save('Failed')).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
});

// * another session sent it or cleared it right after the save: the read of the drafts asked for after leaves it out,
// * which says it is gone - and whoever shows it is told, as of a clear pushed then
test('clears a draft whose clear it left out as it saved once a read of the drafts leaves it out', async() => {
  const {save, text, updates, rereads, holdNoDrafts, announced} = await setup();
  await save('Mine');
  updates.receive({peer: PEER, draft: {_: 'draftMessageEmpty', date: tsNow(true)}});
  expect(text()).toBe('Mine');

  holdNoDrafts();
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(1);
  expect(text()).toBeUndefined();
  expect(announced()).toEqual(['Mine', undefined]);
});

// * the check of a rich draft that a newer save took the place of may never end: it holds nothing back after that save
test('takes a newer pushed draft after a save that took the place of a rich one still being prepared', async() => {
  const {manager, receive, save, text} = await setup();
  vi.spyOn((manager as any).appMessagesManager, 'assertRichMessage').mockReturnValueOnce(new Promise(() => {}));
  const richMessage = {_: 'inputRichMessage', pFlags: {}, blocks: []} as any as InputRichMessage.inputRichMessage;
  void manager.syncDraft({peerId: PEER_ID, localDraft: {_: 'draftMessage', pFlags: {}, date: 0, message: ''}, inputRichMessage: richMessage});
  await save('Plain, newer');

  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY * 2);
  receive('From another session', tsNow(true) + 1);
  expect(text()).toBe('From another session');
});

// * its request failed for a file reference, and the reference is being refreshed when a newer save takes its place
test('takes a newer pushed draft after a save that took the place of a rich one between its tries', async() => {
  const {manager, invokeApi, receive, save, text} = await setup();
  vi.spyOn((manager as any).appMessagesManager, 'invokeWithRichMessageReferenceRetry')
  .mockImplementationOnce(((_input: unknown, invoke: () => Promise<unknown>) => invoke().catch(() => new Promise(() => {}))) as any);
  invokeApi.mockRejectedValueOnce({type: 'FILE_REFERENCE_EXPIRED'});
  const richMessage = {_: 'inputRichMessage', pFlags: {}, blocks: []} as any as InputRichMessage.inputRichMessage;
  void manager.syncDraft({peerId: PEER_ID, localDraft: {_: 'draftMessage', pFlags: {}, date: 0, message: ''}, inputRichMessage: richMessage});
  await vi.advanceTimersByTimeAsync(0);
  await save('Plain, newer');

  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY * 2);
  receive('From another session', tsNow(true) + 1);
  expect(text()).toBe('From another session');
});

// * a newer save takes its place while its request is on its way, which then fails for a file reference
test('takes a newer pushed draft after a save that took the place of a rich one whose try was on its way', async() => {
  const {manager, invokeApi, receive, save, text} = await setup();
  vi.spyOn((manager as any).appMessagesManager, 'invokeWithRichMessageReferenceRetry')
  .mockImplementationOnce(((_input: unknown, invoke: () => Promise<unknown>) => invoke().catch(() => new Promise(() => {}))) as any);
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const richMessage = {_: 'inputRichMessage', pFlags: {}, blocks: []} as any as InputRichMessage.inputRichMessage;
  void manager.syncDraft({peerId: PEER_ID, localDraft: {_: 'draftMessage', pFlags: {}, date: 0, message: ''}, inputRichMessage: richMessage});
  await vi.advanceTimersByTimeAsync(0);
  const newer = save('Plain, newer');
  request.reject({type: 'FILE_REFERENCE_EXPIRED'});
  await newer;

  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY * 2);
  receive('From another session', tsNow(true) + 1);
  expect(text()).toBe('From another session');
});

// * its save failed: the server not having the draft says nothing of it - it stays here, to be saved again
test('keeps a draft whose save failed when the read of the drafts asked for again leaves it out', async() => {
  const {invokeApi, receive, rereads, save, text, holdNoDrafts} = await setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const saving = save('Mine');
  // * pushed while the save is on its way: left out, and asked for again
  receive('From another session', tsNow(true));

  request.reject({type: 'NETWORK_BAD_REQUEST'});
  await expect(saving).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  holdNoDrafts();
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(rereads()).toBe(1);
  expect(text()).toBe('Mine');
});

// * the read asked for again was answered before another session wrote the draft anew, which was pushed meanwhile
test('keeps a draft pushed while the read asked for again is on its way, which leaves it out', async() => {
  const {invokeApi, save, text, updates, receive} = await setup();
  await save('Mine');
  updates.receive({peer: PEER, draft: {_: 'draftMessageEmpty', date: tsNow(true)}});

  const answer = deferredPromise<unknown>();
  invokeApi.mockImplementationOnce(() => answer);
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  receive('Newer elsewhere', tsNow(true) + 5);
  expect(text()).toBe('Newer elsewhere');

  answer.resolve({_: 'updates', users: [], chats: [], updates: []});
  await vi.advanceTimersByTimeAsync(0);
  expect(text()).toBe('Newer elsewhere');
});

test('clears a monoforum thread\'s draft whose clear it left out as it saved once a read leaves it out', async() => {
  const {manager, updates, holdNoDrafts, dispatchEvent} = await setup();
  const channelId = (7 as ChatId).toPeerId(true);
  await manager.syncDraft({peerId: channelId, monoforumThreadId: PEER_ID, localDraft: draftMessage({date: 0, message: 'Mine'})});
  updates.receive({peer: {_: 'peerChannel', channel_id: 7}, saved_peer_id: PEER, draft: {_: 'draftMessageEmpty', date: tsNow(true)}});
  expect(manager.getDraft(channelId, PEER_ID)?.message).toBe('Mine');

  holdNoDrafts();
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(manager.getDraft(channelId, PEER_ID)).toBeUndefined();
  expect(dispatchEvent).toHaveBeenLastCalledWith('draft_updated', expect.objectContaining({
    peerId: channelId,
    monoforumThreadId: PEER_ID,
    draft: undefined
  }));
});

// * the server names a channel's topic by its own id, the client by its id here: both are the one draft
test('keeps a topic\'s draft that a read of the drafts holds, by the topic\'s id there', async() => {
  const {invokeApi, manager, updates} = await setup();
  const channelId = (7 as ChatId).toPeerId(true);
  const topicId = new AppMessagesIdsManager().generateMessageId(5, 7 as ChatId);
  await manager.syncDraft({peerId: channelId, threadId: topicId, localDraft: draftMessage({date: 0, message: 'Mine'})});
  const topicDraft = (message: string) => ({
    _: 'updateDraftMessage' as const,
    peer: {_: 'peerChannel' as const, channel_id: 7},
    top_msg_id: 5,
    draft: draftMessage({date: tsNow(true), message})
  });

  // * pushed right as it saved: left out, and asked for again
  updates.receive(topicDraft('Right after it'));
  expect(manager.getDraft(channelId, topicId)?.message).toBe('Mine');
  // * a topic's dialog read as it saved, with no draft in it: left out too
  manager.saveDraft({peerId: channelId, threadId: topicId, draft: undefined, cloud: true, askedAt: -1});
  expect(manager.getDraft(channelId, topicId)?.message).toBe('Mine');

  invokeApi.mockImplementation(async(method: string) => {
    return method === 'messages.getAllDrafts' ? {_: 'updates', users: [], chats: [], updates: [topicDraft('Right after it')]} : true;
  });
  await vi.advanceTimersByTimeAsync(RECONCILE_DELAY);
  expect(manager.getDraft(channelId, topicId)?.message).toBe('Right after it');
  expect(manager.getDraft(channelId, 5)).toBeUndefined();
});

// * the field saves the same text again (a save on leaving, one asked for a while on) before the first is through
test('answers the same draft given again while it is on its way as that save does', async() => {
  const {invokeApi, save} = await setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const first = save('Mine');
  const again = save('Mine');
  expect(again).not.toBe(true);
  request.reject({type: 'NETWORK_BAD_REQUEST'});
  await expect(first).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  await expect(again).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  expect(invokeApi).toHaveBeenCalledTimes(1);
});

test('sends the message effect of a draft with it', async() => {
  const {invokeApi, manager} = await setup();
  await manager.syncDraft({
    peerId: PEER_ID,
    localDraft: draftMessage({date: 0, message: 'With an effect', effect: '5104841245755180586'})
  });
  expect(invokeApi).toHaveBeenCalledWith('messages.saveDraft', expect.objectContaining({effect: '5104841245755180586'}));
});
