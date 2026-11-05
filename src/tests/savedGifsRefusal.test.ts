import {describe, expect, it, vi} from 'vitest';
import AppGifsManager from '@appManagers/appGifsManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import deferred from '@/tests/helpers/deferred';
import createDeferredCalls from '@/tests/helpers/deferredCalls';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';
import testListChangeRefusals, {ids, makeDocs} from '@/tests/helpers/listChangeRefusals';
import makeReferenceRequestFileManager from '@/tests/helpers/referenceRequestFileManager';

/**
 * Saving or removing a GIF changes the saved list at once and tells the panel and the toast (`gif_updated`). When the
 * server did not take it, the GIF stayed (un)saved here until a reload, after which it was gone (or back).
 */
describe('AppGifsManager.saveGif', () => {
  const refusal = {type: 'MEDIA_INVALID'};

  function createSaving(saved: string[], limit = 5) {
    const getDoc = makeDocs();
    const {calls, invokeApi} = createDeferredCalls();
    const dispatchEvent = vi.fn();
    const manager = new AppGifsManager();
    Object.assign(manager as any, {
      gifs: saved.map(getDoc),
      apiManager: {invokeApi, getLimit: vi.fn().mockResolvedValue(limit)},
      apiFileManager: makeReferenceRequestFileManager(),
      appDocsManager: {getDoc, saveDoc: (doc: MyDocument) => doc},
      rootScope: {dispatchEvent}
    });

    const getList = () => (manager as any).gifs as MyDocument[];
    const events = (name: string) => dispatchedEvents(dispatchEvent, name);
    return {
      manager,
      calls,
      getDoc,
      getList,
      change: (id: string, remove?: boolean) => manager.saveGif(id, remove),
      replaceList: (list: string[]) => (manager as any).gifs = list.map(getDoc),
      removeFlag: 'unsave',
      told: () => events('gif_updated').map(({saved}) => saved),
      reverted: () => events('gifs_updated').filter(({reverted}) => reverted).map(({gifs}) => gifs),
      listReads: () => invokeApi.mock.calls.filter(([method]) => method === 'messages.getSavedGifs').length
    };
  }

  testListChangeRefusals(createSaving);

  it.each([
    ['a gif saved already', ['1', '2'], '2', ['2', '1']],
    ['a gif not saved', ['1'], '9', ['9', '1']],
    ['the gif being saved', ['1'], '3', ['3', '1']]
  ])('a save refused keeps %s used meanwhile at the front', async(_, saved, used, after) => {
    const {manager, calls, getList} = createSaving(saved);

    const saving = manager.saveGif('3');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await manager.addRecentGif(used);

    calls[0].deferred.reject(refusal);
    await expect(saving).rejects.toBe(refusal);

    expect(ids(getList())).toEqual(after);
  });

  it('makes again only the changes made on the list put back, not one made on a list read before it', async() => {
    const {manager, calls, getList, replaceList} = createSaving(['1']);
    const limit = deferred<number>();
    (manager as any).apiManager.getLimit.mockReturnValueOnce(limit.promise);

    // * a save waiting for the limit, with the list it read put out of place meanwhile by the server's
    const stale = manager.saveGif('2').catch((err) => err);
    replaceList(['5']);
    const saving = manager.saveGif('3').catch((err) => err);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    limit.resolve(5);
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    calls[0].deferred.reject(refusal);
    await saving;
    calls[1].deferred.resolve(true);
    await stale;

    expect(ids(getList())).toEqual(['5']);
  });
});
