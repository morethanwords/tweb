import {describe, expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import makeError from '@helpers/makeError';
import {AppStickersManager} from '@appManagers/appStickersManager';
import AppGifsManager from '@appManagers/appGifsManager';
import AppSavedMusicManager from '@appManagers/appSavedMusicManager';
import {AppDocsManager} from '@appManagers/appDocsManager';
import {ReferencesStorage} from '@lib/storages/references';
import type {MyDocument} from '@appManagers/appDocsManager';
import makeReferenceRequestFileManager from '@/tests/helpers/referenceRequestFileManager';
import makeApiManagerMethods from '@/tests/helpers/apiManagerMethods';
import collectUnhandledRejections from '@/tests/helpers/collectUnhandledRejections';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';
import deferred from '@/tests/helpers/deferred';

// A sticker is faved or kept among the recent ones, and a GIF saved, by its document - file reference and all - and the
// reference a document loaded hours ago carries goes out of date: the server answers FILE_REFERENCE_EXPIRED. tdesktop
// refreshes the reference and sends the request once more (ToggleExistingMedia); here the change failed.

const STALE = 1;
const FRESH = 2;

type List = 'faved' | 'recent' | 'gifs';
const LISTS: List[] = ['faved', 'recent', 'gifs'];
const CHANGES: {[method: string]: List} = {
  'messages.faveSticker': 'faved',
  'messages.saveRecentSticker': 'recent',
  'messages.saveGif': 'gifs'
};
const READS: {[method: string]: List} = {
  'messages.getFavedStickers': 'faved',
  'messages.getRecentStickers': 'recent',
  'messages.getSavedGifs': 'gifs'
};

const ids = (docs: MyDocument[]) => docs.map(({id}) => id);

// * `load`: the lists loaded here, which the documents are known by: a reference is refreshed through the first of them
async function setup(load: List[] = LISTS) {
  // * the server's lists, the same in all three, and the documents as it hands them out: their references fresh, the
  // first byte saying so and the second the document's own
  const initial = ['1', '2'];
  const server: {[list in List]: string[]} = {faved: initial.slice(), recent: initial.slice(), gifs: initial.slice()};
  // * the documents whose every reference the server refuses, though it hands out a new one each time
  const refused = new Set<string>();
  let issued = 10;
  const apiDoc = (id: string) => ({
    _: 'document', pFlags: {}, id, access_hash: '1', file_reference: [refused.has(id) ? ++issued : FRESH, +id],
    date: 0, dc_id: 2, size: 1,
    mime_type: 'application/octet-stream', attributes: [{_: 'documentAttributeSticker', pFlags: {}, alt: '😀'}]
  });

  const sent: {method: string, id: string, reference: number}[] = [];
  // * the answer to the change sent `index`-th waits for this
  const answers: Promise<void>[] = [];
  const holdAnswer = (index: number) => {
    const answer = deferred();
    answers[index] = answer.promise;
    return () => answer.resolve();
  };

  const invokeApi = vi.fn(async(method: string, params: any): Promise<any> => {
    const read = READS[method];
    if(read) {
      const docs = server[read].map(apiDoc);
      return read === 'gifs' ?
        {_: 'messages.savedGifs', hash: 1, gifs: docs} :
        {_: read === 'faved' ? 'messages.favedStickers' : 'messages.recentStickers', hash: 1, packs: [], stickers: docs, dates: []};
    }

    if(method === 'messages.clearRecentStickers') {
      server.recent = [];
      return true;
    }

    // * a request sent again and again with what fails is cut short
    if(sent.length >= 10) {
      throw makeError('FLOOD_WAIT_10' as ErrorType);
    }

    // * the reference as sent: it may be refreshed before the answer comes
    const {id, file_reference: [reference]} = params.id;
    const index = sent.push({method, id, reference}) - 1;
    await answers[index];
    if(reference !== FRESH || refused.has(id)) {
      throw makeError('FILE_REFERENCE_EXPIRED');
    }

    const list = CHANGES[method];
    if(list) {
      server[list] = server[list].filter((_id) => _id !== id);
      if(!params.unfave && !params.unsave) {
        server[list].unshift(id);
      }
    }

    return true;
  });

  const dispatchEvent = vi.fn();
  const references = new ReferencesStorage();
  const docs = new AppDocsManager();
  const apiFileManager = makeReferenceRequestFileManager();
  const stickers = new AppStickersManager();
  const gifs = new AppGifsManager();
  const music = new AppSavedMusicManager();
  const managers = {
    apiManager: Object.assign(makeApiManagerMethods(invokeApi), {getLimit: async() => 5}),
    apiFileManager: Object.assign(apiFileManager, {referencesStorage: references}),
    appDocsManager: docs,
    appStickersManager: stickers,
    appGifsManager: gifs,
    appProfileManager: {refreshFullPeer: vi.fn()},
    referencesStorage: references,
    rootScope: {dispatchEvent, myId: (100 as UserId).toPeerId(false)}
  } as any;
  for(const manager of [references, docs, stickers, gifs, music]) {
    manager.setManagersAndAccountNumber(managers, 1);
  }
  // * the stores saveDoc keeps, without the rest of what the managers set up in a worker
  Object.assign(docs, {docs: {}, altDocsByMainMediaDocument: {}});
  stickers.clear(true);
  music.clear(true);

  // * the lists as the app loads them: their documents are known by them
  for(const list of load) {
    await (list === 'faved' ? stickers.getFavedStickersStickers() : list === 'recent' ? stickers.getRecentStickersStickers() : gifs.getGifs());
  }
  const kept = {
    faved: () => (stickers as any).favedStickers as MyDocument[],
    recent: () => (stickers as any).recentStickers as MyDocument[],
    gifs: () => (gifs as any).gifs as MyDocument[]
  };

  const change = (list: List, id: string, remove?: boolean): Promise<unknown> => {
    if(list === 'faved') return stickers.faveSticker(id, remove);
    if(list === 'recent') return stickers.saveRecentSticker(id, remove);
    return gifs.saveGif(id, remove);
  };

  // * the reference the document holds goes out of date (or is refreshed elsewhere): the very bytes change
  const setReference = (id: string, byte: number) => (docs.getDoc(id).file_reference as number[])[0] = byte;
  const refreshReference = vi.spyOn(references, 'refreshReference');
  const events = (name: string) => dispatchedEvents(dispatchEvent, name);

  return {references, apiFileManager, docs, refused, stickers, gifs, music, server, sent, kept, change, setReference, holdAnswer, invokeApi, refreshReference, events};
}

describe('a change of a list with a document whose file reference is out of date', () => {
  test.each(LISTS)('%s: is sent once more with the reference refreshed through the list, which stays as changed here', async(list) => {
    // * the document known by the list itself: the list is what is read for its fresh reference
    const {server, sent, kept, change, setReference, invokeApi, refreshReference, events} = await setup([list]);
    const before = kept[list]();
    setReference('2', STALE);

    await change(list, '2');

    expect(refreshReference).toHaveBeenCalledTimes(1);
    expect(invokeApi.mock.calls.filter(([method]) => READS[method] === list)).toHaveLength(2);
    expect(sent.map(({reference}) => reference)).toEqual([STALE, FRESH]);
    expect(server[list]).toEqual(['2', '1']);
    // * the server's list, read before it took the change, did not take the place of the one here
    expect(kept[list]()).toBe(before);
    expect(ids(kept[list]())).toEqual(['2', '1']);
    expect(events('stickers_updated')).toEqual([]);
  });

  test.each(LISTS)('%s: a document taken out is sent once more, and stays out', async(list) => {
    const {server, sent, kept, change, setReference} = await setup();
    setReference('1', STALE);

    await change(list, '1', true);

    expect(sent.map(({reference}) => reference)).toEqual([STALE, FRESH]);
    expect(server[list]).toEqual(['2']);
    await vi.waitFor(() => expect(ids(kept[list]())).toEqual(['2']));
  });

  test('passes any other error on as it is, with no refresh', async() => {
    const {kept, change, invokeApi, refreshReference} = await setup();
    invokeApi.mockImplementationOnce(async() => {
      throw makeError('STICKER_ID_INVALID' as ErrorType);
    });

    await expect(change('faved', '2')).rejects.toMatchObject({type: 'STICKER_ID_INVALID'});

    expect(refreshReference).not.toHaveBeenCalled();
    expect(ids(kept.faved())).toEqual(['1', '2']);
  });

  test.each(LISTS)('%s: one whose reference the server keeps refusing, fresh as it is, is sent once more only', async(list) => {
    const {refused, sent, change, setReference, refreshReference} = await setup();
    setReference('2', STALE);
    refused.add('2');

    await expect(change(list, '2')).rejects.toMatchObject({type: 'FILE_REFERENCE_EXPIRED'});

    expect(sent).toHaveLength(2);
    expect(refreshReference).toHaveBeenCalledTimes(1);
  });

  test.each(LISTS)('%s: goes through when nothing here knows the document any more by the time it is answered', async(list) => {
    const {references, server, sent, kept, change, holdAnswer, docs} = await setup([list]);
    const answer = holdAnswer(0);

    const changing = change(list, '2');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // * the document's last context goes (a message with it deleted): its downloads are cancelled
    const contextType = ({faved: 'favedStickers', recent: 'recentStickers', gifs: 'savedGifs'} as const)[list];
    expect(references.deleteContext(docs.getDoc('2').file_reference, {type: contextType})).toBe(true);
    answer();

    await changing;
    expect(server[list]).toEqual(['2', '1']);
    expect(ids(kept[list]())).toEqual(['2', '1']);
  });

  test('a fave whose reference cannot be refreshed is undone as any failed fave, and the next one refreshes anew', async() => {
    const {server, kept, change, setReference, refreshReference, events} = await setup();
    setReference('2', STALE);
    refreshReference.mockRejectedValueOnce(makeError('NO_NEW_CONTEXT'));

    await expect(change('faved', '2')).rejects.toMatchObject({type: 'NO_NEW_CONTEXT'});
    expect(ids(kept.faved())).toEqual(['1', '2']);
    expect(events('stickers_updated')).toEqual([expect.objectContaining({type: 'faved', reverted: true})]);

    await change('faved', '2');

    expect(refreshReference).toHaveBeenCalledTimes(2);
    expect(server.faved).toEqual(['2', '1']);
    expect(ids(kept.faved())).toEqual(['2', '1']);
  });

  test('a reference put back after its refresh is refreshed anew, not sent as it is again and again', async() => {
    const {server, sent, change, setReference, refreshReference} = await setup();
    setReference('2', STALE);
    await change('faved', '2');

    // * an older copy of the sticker saved again: the reference it carries is the one refreshed already
    setReference('2', STALE);
    await change('faved', '2', true);

    expect(refreshReference).toHaveBeenCalledTimes(2);
    expect(sent.map(({reference}) => reference)).toEqual([STALE, FRESH, STALE, FRESH]);
    expect(server.faved).toEqual(['1']);
  });

  test.each(LISTS)('%s: changed again while it went back for its reference, it is not sent once more after that change', async(list) => {
    const {server, sent, kept, change, setReference, holdAnswer} = await setup();
    setReference('2', STALE);
    const answer = holdAnswer(0);

    const first = change(list, '2').catch((err) => err);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // * the sticker comes with a fresh reference from elsewhere meanwhile, and is taken out of the list
    setReference('2', FRESH);
    await change(list, '2', true);
    answer();

    expect(await first).toMatchObject({type: 'FILE_REFERENCE_EXPIRED'});
    expect(sent.map(({reference}) => reference)).toEqual([STALE, FRESH]);
    expect(server[list]).toEqual(['1']);
    await vi.waitFor(() => expect(ids(kept[list]())).toEqual(['1']));
  });

  test('recent: cleared while a sticker went back for its reference, it is not sent once more to fill the list again', async() => {
    const {stickers, server, sent, kept, change, setReference, holdAnswer} = await setup();
    setReference('2', STALE);
    const answer = holdAnswer(0);

    const saving = change('recent', '2').catch((err) => err);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await stickers.clearRecentStickers();
    answer();

    expect(await saving).toMatchObject({type: 'FILE_REFERENCE_EXPIRED'});
    expect(sent).toHaveLength(1);
    expect(server.recent).toEqual([]);
    expect(ids(kept.recent())).toEqual([]);
  });

  test('a request with a reference that is not a change (a send, a download) leaves no copy of its failure unhandled', async() => {
    const {apiFileManager, docs} = await setup();

    const unhandled = await collectUnhandledRejections(async() => {
      await expect(apiFileManager.invokeApiWithReference({
        context: docs.getDoc('2'),
        callback: () => Promise.reject(makeError('STICKER_ID_INVALID' as ErrorType))
      })).rejects.toMatchObject({type: 'STICKER_ID_INVALID'});
    });

    expect(unhandled).toEqual([]);
  });

  test('saved music: a track is removed once the reference is refreshed', async() => {
    const {music, sent, setReference} = await setup();
    setReference('2', STALE);

    await expect(music.removeMusic('2')).resolves.toBe(true);

    expect(sent).toEqual([
      {method: 'account.saveMusic', id: '2', reference: STALE},
      {method: 'account.saveMusic', id: '2', reference: FRESH}
    ]);
  });
});
