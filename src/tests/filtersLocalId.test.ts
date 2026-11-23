import {describe, expect, it, vi} from 'vitest';
import type FiltersStorage from '@lib/storages/filters';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import makeFiltersStorage from '@/tests/helpers/filtersStorage';
import copy from '@helpers/object/copy';

// * a folder's place (`localId`) names the index its chats are sorted by in it (`index_<localId>`), so two folders
// * never share one
describe('FiltersStorage keeping the folders\' places', () => {
  const makeStorage = async() => {
    const storage = makeFiltersStorage();
    storage.apiManager = {invokeApi: vi.fn(() => Promise.resolve(true))};

    await storage.getDialogFilters(true, {
      _: 'messages.dialogFilters',
      pFlags: {},
      filters: [{_: 'dialogFilterDefault'}, makeDialogFilter(2, undefined), makeDialogFilter(3, undefined)]
    });

    return storage as FiltersStorage;
  };

  const places = (storage: FiltersStorage) => Object.values(storage.getFilters()).map((filter) => [filter.id, filter.localId]);

  it('keeps a folder in its place when it is saved from a copy read before the folders were reordered', async() => {
    const storage = await makeStorage();
    // * as the folder's edit screen holds it
    const edited = copy(storage.getFilter(2));
    edited.title = {...edited.title, text: 'Renamed'};

    // * the folders are reordered on another device meanwhile
    (storage as any).onUpdateDialogFilterOrder({_: 'updateDialogFilterOrder', order: [0, 3, 2]});
    const reordered = places(storage);

    await storage.updateDialogFilter(edited);

    expect(storage.getFilter(2).title.text).toBe('Renamed');
    expect(places(storage)).toEqual(reordered);
    const localIds = places(storage).map(([, localId]) => localId);
    expect(new Set(localIds).size, 'two folders in one place').toBe(localIds.length);
  });
});
