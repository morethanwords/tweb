import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import pause from '@helpers/schedulers/pause';
import {draftMessage} from '@/tests/helpers/drafts';

const USER_ID = (42 as UserId).toPeerId(false);
const FORUM_ID = (100 as ChatId).toPeerId(true);
const MONOFORUM_ID = (200 as ChatId).toPeerId(true);
const TOPIC_ID = 5;
const MONOFORUM_THREAD_ID = (7 as UserId).toPeerId(false);

async function setup() {
  const manager = new AppDraftsManager();
  const dispatchEvent = vi.fn();
  const storageSet = vi.fn();

  Object.assign(manager, {
    apiManager: {invokeApi: vi.fn(async() => true)},
    apiUpdatesManager: {addMultipleEventsListeners: () => {}, updatesState: {}},
    appDocsManager: {saveDoc: (document: unknown) => document},
    appPhotosManager: {savePhoto: (photo: unknown) => photo},
    appPeersManager: {isChannel: () => false, isMonoforum: (peerId: PeerId) => peerId === MONOFORUM_ID},
    appStateManager: {storage: {get: async(): Promise<unknown> => undefined, set: storageSet}},
    rootScope: {myId: (1 as UserId).toPeerId(false), dispatchEvent}
  });
  (manager as unknown as {after(): void}).after();
  await pause(0); // * the drafts kept from before come back from storage

  manager.saveDraft({peerId: USER_ID, draft: draftMessage({message: 'A chat'})});
  manager.saveDraft({peerId: FORUM_ID, threadId: TOPIC_ID, draft: draftMessage({message: 'A topic'})});
  manager.saveDraft({peerId: MONOFORUM_ID, monoforumThreadId: MONOFORUM_THREAD_ID, draft: draftMessage({message: 'A monoforum thread'})});
  dispatchEvent.mockClear();
  storageSet.mockClear();

  return {manager, dispatchEvent, storageSet};
}

// * the server takes every cloud draft away and tells this session nothing: what it keeps has to go as well,
// * as Android does (MediaDataController.clearAllDrafts after the answer)
test('forgets every draft it kept once the server has cleared them all', async() => {
  const {manager, storageSet} = await setup();

  await manager.clearAllDrafts();

  expect(manager.getDraft(USER_ID)).toBeUndefined();
  expect(manager.getDraft(FORUM_ID, TOPIC_ID)).toBeUndefined();
  expect(manager.getDraft(MONOFORUM_ID, MONOFORUM_THREAD_ID as number)).toBeUndefined();
  expect(storageSet).toHaveBeenLastCalledWith({drafts: {}});
});

test('tells a topic\'s and a monoforum thread\'s drafts apart when it says they are gone', async() => {
  const {manager, dispatchEvent} = await setup();

  await manager.clearAllDrafts();

  const cleared = dispatchEvent.mock.calls
  .filter(([name]) => name === 'draft_updated')
  .map(([, {peerId, threadId, monoforumThreadId, draft}]) => ({peerId, threadId, monoforumThreadId, draft}));
  expect(cleared).toEqual(expect.arrayContaining([
    {peerId: USER_ID, threadId: undefined, monoforumThreadId: undefined, draft: undefined},
    {peerId: FORUM_ID, threadId: TOPIC_ID, monoforumThreadId: undefined, draft: undefined},
    {peerId: MONOFORUM_ID, threadId: undefined, monoforumThreadId: MONOFORUM_THREAD_ID, draft: undefined}
  ]));
  expect(cleared).toHaveLength(3);
});

test('keeps a draft saved while the clear was on its way', async() => {
  const {manager} = await setup();
  let answer: (bool: boolean) => void;
  (manager as any).apiManager.invokeApi = vi.fn(() => new Promise<boolean>((resolve) => answer = resolve));

  const clearing = manager.clearAllDrafts();
  manager.saveDraft({peerId: USER_ID, draft: draftMessage({message: 'Typed meanwhile'})});
  answer(true);
  await clearing;

  expect(manager.getDraft(USER_ID)?.message).toBe('Typed meanwhile');
  expect(manager.getDraft(FORUM_ID, TOPIC_ID)).toBeUndefined();
});

test('keeps the drafts when the server did not clear them', async() => {
  const {manager, dispatchEvent} = await setup();
  (manager as any).apiManager.invokeApi = vi.fn(async() => false);

  await manager.clearAllDrafts();

  expect(manager.getDraft(USER_ID)?.message).toBe('A chat');
  expect(dispatchEvent).not.toHaveBeenCalled();
});
