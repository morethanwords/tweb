import {describe, it, expect} from 'vitest';
import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

// Paid media may only contain photos and plain videos: the server rejects animated
// documents with EXTENDED_MEDIA_TYPE_INVALID and also rejects silent videos without
// the nosound_video flag (it classifies them as GIFs). These tests verify that
// sendFile/sendGrouped build the correct inputMedia when stars are set.
// Run: TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED=./tmp/seed.json \
//   pnpm test src/tests/api/paidMediaGif.test.ts -- --reporter=verbose --silent=false

const enabled = process.env.TG_API_TEST === '1';

describe.runIf(enabled)('paid media gif sending', () => {
  const setup = async() => {
    const seed: AccountSeed = JSON.parse(readFileSync(process.env.TG_API_SEED || './tmp/seed.json', 'utf8'));
    const client = await createTestClient({seed, accountNumber: 1, testDc: false});
    const {getEnvironment} = await import('@environment/utils');
    getEnvironment().VIDEO_MIME_TYPES_SUPPORTED.add('video/mp4' as any);

    const managers = client.managers as any;

    managers.appUsersManager.saveApiUsers([{
      _: 'user', id: seed.userId, access_hash: '1', first_name: 'A', pFlags: {self: true}
    }]);

    const chatId = 999777;
    managers.appChatsManager.saveApiChats([{
      _: 'channel', id: chatId, access_hash: '1', title: 'paid-test', date: 0, version: 0,
      photo: {_: 'chatPhotoEmpty'}, pFlags: {broadcast: true, creator: true}
    }]);
    const peerId = (chatId as any).toPeerId(true);

    managers.appMessagesManager.getCommonThingsForSending = () => Promise.resolve({config: {}, appConfig: {}});

    const captured: {method: string, params: any}[] = [];
    (client.apiManager as any).invokeApi = (method: string, params: any) => {
      captured.push({method, params});
      if(method === 'messages.uploadMedia') {
        return Promise.resolve({
          _: 'messageMediaDocument',
          document: {
            _: 'document', id: '' + Math.floor(Math.random() * 1e9), access_hash: '1', file_reference: new Uint8Array(),
            date: 0, mime_type: params.media.mime_type, size: 1024, dc_id: 1,
            attributes: params.media.attributes
          }
        });
      }
      return new Promise(() => {}); // never resolves — only the requests are inspected
    };
    (client.apiManager as any).invokeApiSingle = (client.apiManager as any).invokeApi;

    managers.apiFileManager.upload = ({fileName}: any) => {
      const promise: any = Promise.resolve({_: 'inputFile', id: '1', parts: 1, name: fileName, md5_checksum: ''});
      promise.cancel = () => {};
      promise.addNotifyListener = () => {};
      promise.notifyAll = () => {};
      return promise;
    };

    const makeFile = (name: string) => new File([new Uint8Array(1024)], name, {type: 'video/mp4'});

    const waitFor = async(method: string) => {
      for(let i = 0; i < 100 && !captured.some((c) => c.method === method); ++i) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return captured.find((c) => c.method === method)?.params;
    };

    return {managers, peerId, captured, makeFile, waitFor};
  };

  it('sends a single paid gif as a silent video', async() => {
    const {managers, peerId, captured, makeFile, waitFor} = await setup();

    const fileDetails = {isMedia: true, isAnimated: true, noSound: true, width: 64, height: 64, duration: 1};

    // paid: no animated attribute + nosound_video
    managers.appMessagesManager.sendFile({peerId, file: makeFile('paid.mp4'), stars: 10, ...fileDetails});
    const paid = await waitFor('messages.sendMedia');
    expect(paid.media._).toBe('inputMediaPaidMedia');
    const inner = paid.media.extended_media[0];
    expect(inner._).toBe('inputMediaUploadedDocument');
    expect(inner.pFlags.nosound_video).toBe(true);
    expect(inner.attributes.some((a: any) => a._ === 'documentAttributeAnimated')).toBe(false);

    // control without stars: animated attribute kept, no nosound_video
    captured.length = 0;
    managers.appMessagesManager.sendFile({peerId, file: makeFile('plain.mp4'), ...fileDetails});
    const normal = await waitFor('messages.sendMedia');
    expect(normal.media._).toBe('inputMediaUploadedDocument');
    expect(normal.media.pFlags.nosound_video).toBeFalsy();
    expect(normal.media.attributes.some((a: any) => a._ === 'documentAttributeAnimated')).toBe(true);
  }, 60000);

  it('wraps an existing document into paid media', async() => {
    const {managers, peerId, waitFor} = await setup();

    const doc = managers.appDocsManager.saveDoc({
      _: 'document', id: '555777', access_hash: '7', file_reference: new Uint8Array(),
      date: 0, mime_type: 'video/mp4', size: 2048, dc_id: 1,
      attributes: [{_: 'documentAttributeVideo', duration: 1, w: 64, h: 64, pFlags: {}}]
    });

    managers.appMessagesManager.sendFile({peerId, file: doc, isMedia: true, stars: 10});
    const sent = await waitFor('messages.sendMedia');
    expect(sent.media._).toBe('inputMediaPaidMedia');
    expect(sent.media.extended_media[0]._).toBe('inputMediaDocument');
  }, 60000);

  it('sends a paid album with gifs as silent videos', async() => {
    const {managers, peerId, makeFile, waitFor} = await setup();

    managers.appMessagesManager.sendGrouped({
      peerId,
      isMedia: true,
      stars: 10,
      sendFileDetails: [1, 2].map((n) => ({
        file: makeFile(`paid${n}.mp4`), isAnimated: true, noSound: true, width: 64, height: 64, duration: 1
      }))
    });

    const uploaded = await waitFor('messages.uploadMedia');
    expect(uploaded.media._).toBe('inputMediaUploadedDocument');
    expect(uploaded.media.pFlags.nosound_video).toBe(true);
    expect(uploaded.media.attributes.some((a: any) => a._ === 'documentAttributeAnimated')).toBe(false);

    const sent = await waitFor('messages.sendMedia');
    expect(sent.media._).toBe('inputMediaPaidMedia');
    expect(sent.media.extended_media.length).toBe(2);
    expect(sent.media.extended_media.every((m: any) => m._ === 'inputMediaDocument')).toBe(true);
  }, 60000);
});
