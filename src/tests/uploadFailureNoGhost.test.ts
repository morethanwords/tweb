import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import {logger, LogTypes} from '@lib/logger';
import collectUnhandledRejections from '@/tests/helpers/collectUnhandledRejections';
import {makeMessagesManager, peerId} from '@/tests/helpers/messageSending';

// A file whose upload stops - cancelled, or failed - takes its message away with it (the upload's own catch calls the
// send off): nothing marks the message failed after that, which would write it back into the chat's storage, and the
// tab's copy of it, as a message that is no longer there.

function setup() {
  const {manager} = makeMessagesManager();
  const upload = Object.assign(deferredPromise<any>(), {addNotifyListener: vi.fn()});
  const pendingByRandomId: {[randomId: string]: any} = {};

  Object.assign(manager as any, {
    log: logger('MESSAGES', LogTypes.None),
    tempMids: {},
    pendingByRandomId,
    uploadFilePromises: {},
    apiFileManager: {upload: () => upload},
    sendSmthLazyLoadQueue: {push: ({load}: {load: () => void}) => load()}
  });
  vi.spyOn(manager as any, 'getEphemeralSendContext').mockReturnValue(undefined);
  vi.spyOn(manager, 'makeDocumentAndMetaForSendingFile').mockReturnValue({
    document: {_: 'document', id: '1', mime_type: 'text/plain', attributes: []},
    apiFileName: 'a.txt',
    fileType: 'text/plain',
    attachType: 'document',
    attributes: []
  } as any);
  vi.spyOn(manager, 'setTyping').mockResolvedValue(true);
  vi.spyOn(manager, 'beforeMessageSending').mockImplementation((message) => {
    pendingByRandomId[message.random_id] = {peerId, tempId: message.mid};
    void message.send();
    return undefined;
  });
  const cancelPendingMessage = vi.spyOn(manager, 'cancelPendingMessage').mockImplementation((randomId: string) => {
    delete pendingByRandomId[randomId];
    return true;
  });
  const onMessagesSendError = vi.spyOn(manager as any, 'onMessagesSendError');

  return {manager, upload, cancelPendingMessage, onMessagesSendError};
}

describe('a file whose upload stops', () => {
  test.each([
    ['cancelled', 'UPLOAD_CANCELED'],
    ['failed', 'FILE_PART_INVALID']
  ])('%s: its message is called off and nothing marks it failed after that', async(_name, type) => {
    const {manager, upload, cancelPendingMessage, onMessagesSendError} = setup();

    // * the send's own chain on the stopped upload is left unhandled, as before: only its reason may show up
    const unhandled = await collectUnhandledRejections(async() => {
      await manager.sendFile({peerId, file: new File(['x'], 'a.txt')});
      upload.reject({type});
      await pause(0);
    });
    expect(unhandled.every((reason) => reason?.type === type)).toBe(true);

    expect(cancelPendingMessage).toHaveBeenCalledWith('1');
    expect(onMessagesSendError.mock.calls.filter(([, error]) => error)).toEqual([]);
  });
});
