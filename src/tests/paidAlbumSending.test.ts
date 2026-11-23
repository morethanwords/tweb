import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import deferred from '@/tests/helpers/deferred';

// A paid album is one message carrying all its media: the first file makes it, and every other file
// goes into it. None of them may become a message of its own, which nothing would ever send.

const peerId = (-77 as ChatId).toPeerId(true);

function setup() {
  const manager = new AppMessagesManager();
  let nextId = 1;
  const made: Message.message[] = [];
  const sendFile = vi.spyOn(manager, 'sendFile').mockImplementation(async(options: any) => {
    await pause(0); // * sendFile checks the send options before it makes the message
    const message = options.groupedMessage || {
      _: 'message',
      id: nextId,
      mid: nextId++,
      peerId,
      pFlags: {is_outgoing: true},
      date: 0,
      message: '',
      random_id: '' + nextId
    } as Message.message;
    if(!options.groupedMessage) made.push(message);
    return {message, send: () => new Promise(noop), uploadingFileName: 'file' + made.length} as any;
  });

  Object.assign(manager as any, {
    log: Object.assign(vi.fn(), {bindPrefix: () => Object.assign(vi.fn(), {error: vi.fn()})}),
    appPeersManager: {
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 77, access_hash: '0'})
    },
    mediaTempMap: {}
  });
  vi.spyOn(manager as any, 'getEphemeralSendContext').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'checkSendOptions').mockResolvedValue(undefined);
  vi.spyOn(manager as any, 'generateOutgoingPaidMedia').mockReturnValue({_: 'messageMediaPaidMedia'});

  return {manager, sendFile, made};
}

const files = (count: number) => Array.from({length: count}, () => ({file: new Blob(['x'])} as any));

describe('sending an album', () => {
  test('a paid album makes one message, and its other files go into it', async() => {
    const {manager, sendFile, made} = setup();

    void manager.sendGrouped({peerId, stars: 10, sendFileDetails: files(3)});
    await pause(10);

    expect(sendFile).toHaveBeenCalledTimes(3);
    expect(made).toHaveLength(1);
    expect(sendFile.mock.calls.map(([options]) => options.groupedMessage)).toEqual([undefined, made[0], made[0]]);
  });

  test('a free album still makes a message for each file', async() => {
    const {manager, sendFile, made} = setup();

    void manager.sendGrouped({peerId, sendFileDetails: files(3)});
    await pause(10);

    expect(sendFile).toHaveBeenCalledTimes(3);
    expect(made.map((message) => message.mid)).toEqual([1, 2, 3]);
  });

  test('an album to a chat that charges for messages is sent when the time to undo is over, its uploads still on their way', async() => {
    const {manager, sendFile} = setup();
    const {promise: uploaded, resolve: finishUploads} = deferred<void>();
    sendFile.mockImplementation(async() => {
      await pause(0);
      const message = {_: 'message', id: 1, mid: 1, peerId, pFlags: {is_outgoing: true}, date: 0, message: '', random_id: '1'};
      return {message, send: () => uploaded.then(() => ({_: 'inputMediaUploadedPhoto'})), uploadingFileName: 'file'} as any;
    });
    const invokeApi = vi.fn((method: string) => method === 'messages.uploadMedia' ?
      Promise.resolve({_: 'messageMediaEmpty'}) :
      new Promise(noop));
    const cancelPendingMessage = vi.spyOn(manager, 'cancelPendingMessage').mockImplementation(noop as any);
    Object.assign(manager as any, {
      apiManager: {invokeApi},
      setTyping: noop,
      sendSmthLazyLoadQueue: {push: ({load}: {load: () => void}) => load()}
    });

    vi.useFakeTimers();
    try {
      void manager.sendGrouped({
        peerId,
        sendFileDetails: files(2),
        confirmedPaymentResult: {starsAmount: 5, canUndo: true}
      });
      await vi.advanceTimersByTimeAsync(0);

      manager.sendQueuedPaidMessages(peerId); // * the tab's 5 seconds to undo are over
      await vi.advanceTimersByTimeAsync(1_000);
      finishUploads(); // * the files take longer than that
      await vi.advanceTimersByTimeAsync(10_000);

      expect(invokeApi.mock.calls.map(([method]) => method)).toContain('messages.sendMultiMedia');
      expect(cancelPendingMessage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('an album to a chat that charges for messages, undone before its uploads are done, is never sent', async() => {
    const {manager} = setup();
    const invokeApi = vi.fn(() => new Promise(noop));
    const cancelPendingMessage = vi.spyOn(manager, 'cancelPendingMessage').mockImplementation(noop as any);
    Object.assign(manager as any, {apiManager: {invokeApi}});

    void manager.sendGrouped({
      peerId,
      sendFileDetails: files(2),
      confirmedPaymentResult: {starsAmount: 5, canUndo: true}
    });
    await pause(10);

    manager.cancelQueuedPaidMessages(peerId); // * Undo
    expect(cancelPendingMessage).toHaveBeenCalledTimes(2);
  });

  test('an album to a chat that charges for messages, undone while it uploads, does not come back as failed when an upload fails', async() => {
    const {manager, sendFile} = setup();
    const {promise: uploaded, reject: failUpload} = deferred<void>();
    const message = {_: 'message', id: 1, mid: 1, peerId, pFlags: {is_outgoing: true}, date: 0, message: '', random_id: '1'};
    sendFile.mockImplementation(async() => {
      await pause(0);
      return {message, send: () => uploaded, uploadingFileName: 'file'} as any;
    });
    // * the album's message is pending until Undo calls its send off
    const pendingByRandomId: Record<string, object> = {[message.random_id]: {}};
    vi.spyOn(manager, 'cancelPendingMessage').mockImplementation(((randomId: string) => {
      delete pendingByRandomId[randomId];
    }) as any);
    const onMessagesSendError = vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(noop);
    Object.assign(manager as any, {
      pendingByRandomId,
      apiManager: {invokeApi: vi.fn(() => new Promise(noop))},
      rootScope: {dispatchEvent: vi.fn()}
    });

    manager.sendGrouped({
      peerId,
      sendFileDetails: files(2),
      confirmedPaymentResult: {starsAmount: 5, canUndo: true}
    }).catch(noop);
    await pause(10);

    manager.cancelQueuedPaidMessages(peerId); // * Undo, its files still uploading
    failUpload({type: 'FILE_PART_INVALID'});
    await pause(10);

    expect(onMessagesSendError).not.toHaveBeenCalled();
  });

  test('two paid albums sent at once keep their files\' ids each in one run', async() => {
    const {manager, sendFile} = setup();
    const first = (manager as any).mediaTempId as number;

    void manager.sendGrouped({peerId, stars: 10, sendFileDetails: files(3)});
    void manager.sendGrouped({peerId, stars: 20, sendFileDetails: files(2)});
    await pause(10);

    const idsOf = (stars: number) => sendFile.mock.calls
    .filter(([options]) => options.stars === stars)
    .map(([options]) => options.mediaTempId);
    expect(idsOf(10)).toEqual([first, first + 1, first + 2]);
    expect(idsOf(20)).toEqual([first + 3, first + 4]);
  });
});
