import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import type {DraftMessage, InputRichMessage, Update} from '@layer';

const PEER_ID = (42 as UserId).toPeerId(false);
const GRACE = 2000;

type DraftUpdateListener = (update: Update.updateDraftMessage) => void;

function setup() {
  const manager = new AppDraftsManager();
  const invokeApi = vi.fn(async(_method: string, _params?: unknown): Promise<unknown> => true);
  let onUpdateDraftMessage: DraftUpdateListener;

  Object.assign(manager, {
    apiManager: {invokeApi},
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: {updateDraftMessage: DraftUpdateListener}) => {
        onUpdateDraftMessage = listeners.updateDraftMessage;
      },
      processUpdateMessage: vi.fn(),
      updatesState: {}
    },
    appMessagesManager: {
      assertRichMessage: async() => {},
      invokeWithRichMessageReferenceRetry: (_input: unknown, invoke: () => Promise<unknown>) => invoke(),
      resolveInputRichMessage: (input: InputRichMessage) => input
    },
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'}),
      getPeerId: () => PEER_ID,
      isMonoforum: () => false
    },
    appStateManager: {storage: {get: async() => ({})}},
    dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
    rootScope: {myId: (1 as UserId).toPeerId(false)},
    timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
  });

  const saveDraft = vi.spyOn(manager, 'saveDraft')
  .mockImplementation(({draft}) => draft as DraftMessage.draftMessage);
  (manager as unknown as {after(): void}).after();

  const save = (message: string) => manager.syncDraft({
    peerId: PEER_ID,
    localDraft: {_: 'draftMessage', pFlags: {}, date: 0, message}
  });

  const receive = (message: string) => onUpdateDraftMessage({
    _: 'updateDraftMessage',
    peer: {_: 'peerUser', user_id: 42},
    draft: {_: 'draftMessage', pFlags: {}, date: 0, message}
  } as Update.updateDraftMessage);

  const rereads = () => invokeApi.mock.calls.filter(([method]) => method === 'messages.getAllDrafts').length;

  return {manager, invokeApi, receive, rereads, save, saveDraft};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('re-reads the drafts it dropped while its own write was landing', async() => {
  const {receive, rereads, save, saveDraft} = setup();
  await save('Mine');
  saveDraft.mockClear();

  // Written by another session in the same moment: applying it would overwrite
  // what is being typed, so it is dropped — and then has to be asked for again.
  receive('From another session');
  expect(saveDraft).not.toHaveBeenCalled();
  expect(rereads()).toBe(0);

  await vi.advanceTimersByTimeAsync(GRACE);
  expect(rereads()).toBe(1);
});

test('waits out continued typing instead of re-reading after every write', async() => {
  const {receive, rereads, save} = setup();
  await save('Mine');
  receive('From another session');

  await vi.advanceTimersByTimeAsync(GRACE / 2);
  await save('Still typing');
  await vi.advanceTimersByTimeAsync(GRACE / 2);
  expect(rereads()).toBe(0);

  await vi.advanceTimersByTimeAsync(GRACE);
  expect(rereads()).toBe(1);
});

test('applies an update that arrives after the window closed', async() => {
  const {receive, save, saveDraft} = setup();
  await save('Mine');
  await vi.advanceTimersByTimeAsync(GRACE);
  saveDraft.mockClear();

  receive('From another session');
  expect(saveDraft).toHaveBeenCalledTimes(1);
  expect(saveDraft.mock.calls[0][0].draft).toMatchObject({message: 'From another session'});
});

test('does not keep one protection record per chat forever', async() => {
  const {manager, save} = setup();
  const state = manager as unknown as {
    draftSyncProtectedUntil: Map<string, number>,
    draftSyncProtectionTimeouts: Map<string, number>
  };

  await save('Mine');
  expect(state.draftSyncProtectedUntil.size).toBe(1);

  await vi.advanceTimersByTimeAsync(GRACE);
  expect(state.draftSyncProtectedUntil.size).toBe(0);
  expect(state.draftSyncProtectionTimeouts.size).toBe(0);
});
