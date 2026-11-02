import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';
import pause from '@helpers/schedulers/pause';

// An album goes whole or not at all: a file that cannot be sent leaves the others unsent too, failed with
// it, so that each can be deleted; none is left waiting for good. A file whose upload was cancelled is left
// out, and an album with nothing left sends nothing.

const peerId = (-77 as ChatId).toPeerId(true);

type Call = {method: string, params: any};

function setup(fail: {upload?: number[], cancel?: number[], uploadMedia?: number[]}) {
  const manager = new AppMessagesManager();
  const messages: Message.message[] = [];
  vi.spyOn(manager, 'sendFile').mockImplementation(async() => {
    const idx = messages.length;
    const message = {
      _: 'message',
      id: idx + 1,
      mid: idx + 1,
      peerId,
      pFlags: {is_outgoing: true},
      date: 0,
      message: '',
      random_id: 'r' + idx
    } as Message.message;
    messages.push(message);
    const send = () => {
      if(fail.upload?.includes(idx)) return Promise.reject({type: 'FILE_PART_INVALID'});
      if(fail.cancel?.includes(idx)) return Promise.reject({type: 'UPLOAD_CANCELED'});
      return Promise.resolve({_: 'inputMediaUploadedPhoto', file: {name: 'f' + idx}, pFlags: {}});
    };
    return {message, send} as any;
  });

  const calls: Call[] = [];
  const invokeApi = vi.fn(async(method: string, params: any) => {
    calls.push({method, params});
    if(method === 'messages.uploadMedia') {
      const idx = +params.media.file.name.slice(1);
      if(fail.uploadMedia?.includes(idx)) throw {type: 'PHOTO_INVALID_DIMENSIONS'};
      return {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photo', id: '' + (100 + idx), access_hash: '0', file_reference: new Uint8Array(), sizes: []}};
    }

    return undefined; // * what the updates do is not looked at here
  });

  Object.assign(manager as any, {
    log: Object.assign(vi.fn(), {bindPrefix: () => Object.assign(vi.fn(), {error: vi.fn()})}),
    apiManager: {invokeApi},
    apiUpdatesManager: {processUpdateMessage: vi.fn(), processPaidMessageUpdate: vi.fn()},
    appPeersManager: {
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 77, access_hash: '0'})
    },
    appPhotosManager: {savePhoto: (photo: any) => photo},
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager as any, 'getEphemeralSendContext').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'checkSendOptions').mockResolvedValue(undefined);
  vi.spyOn(manager, 'setTyping').mockResolvedValue(true);
  vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(((failed: Message.message[], error: ApiError) => {
    failed.forEach((message) => message.error = error);
  }) as any);

  return {manager, messages, calls};
}

const files = (count: number) => Array.from({length: count}, () => ({file: new Blob(['x'])} as any));
const sentRandomIds = (calls: Call[]) => {
  return calls.filter(({method}) => method === 'messages.sendMultiMedia')
  .map(({params}) => params.multi_media.map((media: any) => media.random_id));
};

describe('an album with a file that cannot be sent', () => {
  test.each([
    ['the server refuses its media', {uploadMedia: [1]}, 'PHOTO_INVALID_DIMENSIONS'],
    ['its upload fails', {upload: [1]}, 'FILE_PART_INVALID']
  ])('%s: the album is not sent, and every file of it shows the failure', async(_name, fail, type) => {
    const {manager, messages, calls} = setup(fail);

    await manager.sendGrouped({peerId, sendFileDetails: files(3)}).catch(() => {});
    await pause(0);

    expect(sentRandomIds(calls)).toEqual([]);
    expect(messages.map((message) => message.error?.type)).toEqual([type, type, type]);
  });

  test('a cancelled file is left out and the rest is sent', async() => {
    const {manager, messages, calls} = setup({cancel: [1]});

    await manager.sendGrouped({peerId, sendFileDetails: files(3)});
    await pause(0);

    expect(sentRandomIds(calls)).toEqual([['r0', 'r2']]);
    expect(messages.map((message) => message.error)).toEqual([undefined, undefined, undefined]);
  });

  test('nothing is sent when every file was cancelled', async() => {
    const {manager, messages, calls} = setup({cancel: [0, 1]});

    await manager.sendGrouped({peerId, sendFileDetails: files(2)});
    await pause(0);

    expect(calls).toEqual([]);
    expect(messages.map((message) => message.error)).toEqual([undefined, undefined]);
  });
});
