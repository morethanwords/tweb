import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import deferredPromise from '@helpers/cancellablePromise';
import type {DraftMessage, InputRichMessage} from '@layer';

function setup() {
  const manager = new AppDraftsManager();
  const invokeApi = vi.fn(async(_method: string, _params: unknown): Promise<unknown> => true);
  const assertRichMessage = vi.fn(async() => {});
  const retry = vi.fn((_input: unknown, invoke: () => Promise<unknown>) => invoke());
  Object.assign(manager, {
    apiManager: {invokeApi},
    appMessagesManager: {
      assertRichMessage,
      resolveInputRichMessage: (input: InputRichMessage) => input,
      invokeWithRichMessageReferenceRetry: retry
    },
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'}), isMonoforum: () => false},
    dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
    drafts: {},
    timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
  });
  vi.spyOn(manager, 'saveDraft').mockImplementation(({draft}) => draft as DraftMessage.draftMessage);
  const save = (text: string, rich = false, threadId?: number) => {
    const blocks = [{_: 'pageBlockParagraph' as const, text: {_: 'textPlain' as const, text}}];
    return manager.syncDraft({
      peerId: (42 as UserId).toPeerId(false), threadId,
      localDraft: {_: 'draftMessage', pFlags: {}, date: 0, message: rich ? '' : text,
        rich_message: rich ? {_: 'richMessage', pFlags: {}, blocks, photos: [], documents: []} : undefined},
      inputRichMessage: rich ? {_: 'inputRichMessage', pFlags: {}, blocks} : undefined
    });
  };
  return {manager, invokeApi, assertRichMessage, retry, save};
}

test('does not dispatch an old rich draft after newer plain or empty drafts', async() => {
  for(const latest of ['New draft', '']) {
    const {save, invokeApi, assertRichMessage} = setup();
    const validation = deferredPromise<void>();
    assertRichMessage.mockReturnValueOnce(validation);
    const old = save('Old', true);
    await save(latest);
    validation.resolve();
    await old;
    expect(invokeApi).toHaveBeenCalledTimes(1);
    expect(invokeApi.mock.calls[0][1]).toMatchObject({message: latest});
  }
});

test('waits for an in-flight write and coalesces superseded queued drafts', async() => {
  const {save, invokeApi} = setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const first = save('First');
  await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
  const middle = save('Middle');
  const last = save('Last');
  await Promise.resolve();
  expect(invokeApi).toHaveBeenCalledTimes(1);
  request.resolve(true);
  await Promise.all([first, middle, last]);
  expect(invokeApi.mock.calls.map(([, params]) => (params as {message: string}).message)).toEqual(['First', 'Last']);
});

test('does not retry obsolete rich content after refreshing references', async() => {
  const {save, invokeApi, retry} = setup();
  const refresh = deferredPromise<void>();
  invokeApi.mockRejectedValueOnce({type: 'FILE_REFERENCE_EXPIRED'});
  retry.mockImplementationOnce(async(_input, invoke) => {
    try {return await invoke();} catch{
      await refresh;
      return invoke();
    }
  });
  const old = save('Old', true);
  await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
  await save('New');
  refresh.resolve();
  await old;
  expect(invokeApi).toHaveBeenCalledTimes(2);
  expect(invokeApi.mock.calls[1][1]).toMatchObject({message: 'New'});
});

test('a failed write does not block the next save', async() => {
  const {save, invokeApi} = setup();
  invokeApi.mockRejectedValueOnce(new Error('offline'));
  await expect(save('First')).rejects.toThrow('offline');
  await save('Second');
  expect(invokeApi).toHaveBeenCalledTimes(2);
});

test('independent topics do not wait for each other', async() => {
  const {save, invokeApi} = setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const first = save('Topic 1', false, 1);
  await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
  await save('Topic 2', false, 2);
  expect(invokeApi).toHaveBeenCalledTimes(2);
  request.resolve(true);
  await first;
});

test('local clearing invalidates a rich draft still awaiting validation', async() => {
  const {manager, save, invokeApi, assertRichMessage} = setup();
  const validation = deferredPromise<void>();
  assertRichMessage.mockReturnValueOnce(validation);
  const pending = save('Old', true);
  manager.syncDraft({peerId: (42 as UserId).toPeerId(false),
    localDraft: {_: 'draftMessageEmpty'}, saveOnServer: false});
  validation.resolve();
  await pending;
  expect(invokeApi).not.toHaveBeenCalled();
});

test('local clearing retains the ordering of an already dispatched write', async() => {
  const {manager, save, invokeApi} = setup();
  const request = deferredPromise<unknown>();
  invokeApi.mockReturnValueOnce(request);
  const first = save('Old');
  await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
  manager.syncDraft({peerId: (42 as UserId).toPeerId(false),
    localDraft: {_: 'draftMessageEmpty'}, saveOnServer: false});
  const newest = save('New');
  await Promise.resolve();
  expect(invokeApi).toHaveBeenCalledTimes(1);
  request.resolve(true);
  await Promise.all([first, newest]);
  expect(invokeApi.mock.calls.map(([, params]) => (params as {message: string}).message)).toEqual(['Old', 'New']);
});
