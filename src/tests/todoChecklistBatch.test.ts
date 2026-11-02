import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message, MessageEntity, MessageMedia, TodoCompletion} from '@layer';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';

// A checklist's ticks are sent in batches, half a second after the last one. Every tick has to reach
// the server, whenever it is made; a batch the server refuses is not asked again, and what it showed
// goes back to what the server has, whatever was ticked meanwhile.

const peerId = (42 as UserId).toPeerId(false);
const myPeer = {_: 'peerUser', user_id: 1} as const;

function makeMessage(mid: number, completions: TodoCompletion[] = []) {
  return {
    _: 'message',
    id: mid,
    mid,
    peerId,
    peer_id: {_: 'peerUser', user_id: 42},
    pFlags: {out: true},
    date: 0,
    message: '',
    media: {
      _: 'messageMediaToDo',
      todo: {
        _: 'todoList',
        pFlags: {},
        title: {_: 'textWithEntities', text: 'List', entities: [] as MessageEntity[]},
        list: [1, 2, 3].map((id) => ({
          _: 'todoItem',
          id,
          title: {_: 'textWithEntities', text: '' + id, entities: [] as MessageEntity[]}
        }))
      },
      completions
    }
  } as Message.message;
}

type Call = {params: any, deferred: CancellablePromise<any>};

function setup(messages: Message.message[]) {
  const manager = new AppMessagesManager();
  const storage = new Map<number, Message.message>(messages.map((message) => [message.mid, message])) as any;
  storage.key = `${peerId}_history`;

  const calls: Call[] = [];
  const invokeApi = vi.fn((method: string, params: any) => {
    const deferred = deferredPromise<any>();
    calls.push({params, deferred});
    return deferred;
  });

  Object.assign(manager as any, {
    rootScope: {dispatchEvent: vi.fn(), myId: (1 as UserId).toPeerId(false)},
    apiManager: {invokeApi},
    // * a test answers with what the server's updates do to the list
    apiUpdatesManager: {processUpdateMessage: vi.fn((updates?: {apply?: () => void}) => updates?.apply?.())},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '0'}),
      getOutputPeer: () => myPeer
    }
  });
  (manager as any).checklistBatcher = (manager as any).createChecklistBatcher();

  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue(storage);
  vi.spyOn(manager, 'getMessageFromStorage').mockImplementation((target: any, id: number) => target.get(id));
  vi.spyOn(manager, 'modifyMessage').mockImplementation((target: any, callback: any) => callback(target) || target);
  vi.spyOn(console, 'error').mockImplementation(() => {});

  return {manager, storage, calls};
}

const toggle = (manager: AppMessagesManager, mid: number, taskId: number, action: 'complete' | 'uncomplete' = 'complete') => {
  return manager.updateTodo({peerId, mid, taskId, action});
};

const completionsOf = (message: Message.message) => {
  return (message.media as MessageMedia.messageMediaToDo).completions.map((completion) => {
    return [completion.id, (completion.completed_by as typeof myPeer).user_id];
  });
};

const refuse = (call: Call) => call.deferred.reject({type: 'CHAT_WRITE_FORBIDDEN'});

describe('checklist ticks batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('a tick made while the previous batch is on its way is sent after it', async() => {
    const {manager, calls} = setup([makeMessage(7)]);

    await toggle(manager, 7, 1);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({completed: [1], incompleted: [], msg_id: 7});

    // * the first request has not come back yet
    await toggle(manager, 7, 2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);

    calls[0].deferred.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].params).toMatchObject({completed: [2], incompleted: [], msg_id: 7});
  });

  test('a refused batch of a message that is gone is not sent again, and the others still go', async() => {
    const {manager, storage, calls} = setup([makeMessage(7), makeMessage(8)]);

    await toggle(manager, 7, 1);
    await toggle(manager, 8, 2);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({msg_id: 7});

    storage.delete(7);
    calls[0].deferred.reject({type: 'MESSAGE_ID_INVALID'});
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(2);
    expect(calls[1].params).toMatchObject({completed: [2], msg_id: 8});
    calls[1].deferred.resolve(undefined);

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
  });

  test('ticks made within the delay still go as one request', async() => {
    const {manager, calls} = setup([makeMessage(7)]);

    await toggle(manager, 7, 1);
    await toggle(manager, 7, 2);
    await toggle(manager, 7, 1, 'uncomplete');
    await vi.advanceTimersByTimeAsync(500);

    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({completed: [2], incompleted: [1]});
  });

  test('a task ticked and unticked in one refused batch is left as it was', async() => {
    const message = makeMessage(7);
    const {manager, calls} = setup([message]);

    await toggle(manager, 7, 1);
    await toggle(manager, 7, 1, 'uncomplete');
    await vi.advanceTimersByTimeAsync(500);
    refuse(calls[0]);
    await vi.advanceTimersByTimeAsync(0);

    expect(completionsOf(message)).toEqual([]);
  });

  test('a tick taken back while it is on its way, both refused, leaves the task as it was', async() => {
    const message = makeMessage(7);
    const {manager, calls} = setup([message]);

    await toggle(manager, 7, 1);
    await vi.advanceTimersByTimeAsync(500);
    await toggle(manager, 7, 1, 'uncomplete');

    refuse(calls[0]);
    await vi.advanceTimersByTimeAsync(0);
    // * the untick still waiting to be sent is what shows
    expect(completionsOf(message)).toEqual([]);

    expect(calls).toHaveLength(2);
    expect(calls[1].params).toMatchObject({completed: [], incompleted: [1]});
    refuse(calls[1]);
    await vi.advanceTimersByTimeAsync(0);

    expect(completionsOf(message)).toEqual([]);
  });

  test('another member\'s tick comes back when both of ours are refused', async() => {
    const theirs: TodoCompletion = {_: 'todoCompletion', id: 1, completed_by: {_: 'peerUser', user_id: 5}, date: 100};
    const message = makeMessage(7, [theirs]);
    const {manager, calls} = setup([message]);

    await toggle(manager, 7, 1, 'uncomplete');
    await vi.advanceTimersByTimeAsync(500);
    await toggle(manager, 7, 1);
    expect(completionsOf(message)).toEqual([[1, 1]]);

    refuse(calls[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(completionsOf(message)).toEqual([[1, 1]]);

    refuse(calls[1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(completionsOf(message)).toEqual([[1, 5]]);
  });

  test('a tick refused after the server took an untick shows what the server has', async() => {
    const message = makeMessage(7);
    const {manager, calls} = setup([message]);
    const checklist = message.media as MessageMedia.messageMediaToDo;
    const answer = (completions: TodoCompletion[]) => ({apply: () => checklist.completions = completions});

    await toggle(manager, 7, 1);
    await vi.advanceTimersByTimeAsync(500);
    await toggle(manager, 7, 1, 'uncomplete');

    // * the server's answer ticks the task again, under the untick still waiting
    calls[0].deferred.resolve(answer([{_: 'todoCompletion', id: 1, completed_by: myPeer, date: 200}]));
    await vi.advanceTimersByTimeAsync(0);
    expect(completionsOf(message)).toEqual([]);
    expect(calls[1].params).toMatchObject({completed: [], incompleted: [1]});

    await toggle(manager, 7, 1);
    calls[1].deferred.resolve(answer([]));
    await vi.advanceTimersByTimeAsync(0);
    expect(completionsOf(message)).toEqual([[1, 1]]);
    expect(calls[2].params).toMatchObject({completed: [1], incompleted: []});

    refuse(calls[2]);
    await vi.advanceTimersByTimeAsync(0);
    expect(completionsOf(message)).toEqual([]);
  });
});
