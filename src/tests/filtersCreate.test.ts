import {describe, expect, it, vi} from 'vitest';
import type FiltersStorage from '@lib/storages/filters';
import type {MyDialogFilter} from '@lib/storages/filters';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import makeFiltersStorage from '@/tests/helpers/filtersStorage';
import createDeferredCalls from '@/tests/helpers/deferredCalls';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';

// * the storage with the folders the account has, and the server's answers to its edits held until a test lets them go
const makeStorage = async(folders: MyDialogFilter[], premium = false) => {
  const storage = makeFiltersStorage();
  storage.rootScope.premium = premium;

  // * the folders' edits wait for the test to answer them, the rest is taken at once
  const edits = createDeferredCalls();
  storage.apiManager = {
    invokeApi: vi.fn((method: string, params: any) => {
      return method === 'messages.updateDialogFilter' ? edits.invokeApi(method, params) : Promise.resolve(true);
    })
  };

  // * taken as the server's: All chats, the archive, then the folders
  await storage.getDialogFilters(true, {_: 'messages.dialogFilters', pFlags: {}, filters: [{_: 'dialogFilterDefault'}, ...folders]});

  return {
    storage: storage as FiltersStorage,
    sent: (method: string) => dispatchedEvents(storage.apiManager.invokeApi, method),
    answerAll: () => edits.calls.splice(0).forEach(({deferred}) => deferred.resolve(true))
  };
};

const newFolder = (title: string) => makeDialogFilter(0, undefined, {title: {_: 'textWithEntities', text: title, entities: []}});

describe('FiltersStorage making folders', () => {
  it('gives two folders made before the server answers either of them an id each', async() => {
    const {storage, sent, answerAll} = await makeStorage([makeDialogFilter(2, 2), makeDialogFilter(3, 3)]);

    const made = Promise.all([
      storage.createDialogFilter(newFolder('Unread')),
      storage.createDialogFilter(newFolder('Personal'))
    ]);
    answerAll();
    await made;

    const ids = sent('messages.updateDialogFilter').map(({id}: {id: number}) => id);
    expect(ids).toEqual([4, 5]);
    expect(Object.keys(storage.getFilters()).map(Number)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('takes the id of a folder whose making failed for the next one', async() => {
    const {storage, sent} = await makeStorage([makeDialogFilter(2, 2)]);
    (storage as any).apiManager.invokeApi.mockImplementationOnce(() => Promise.reject(new Error('FILTER_TITLE_EMPTY')));

    await expect(storage.createDialogFilter(newFolder(''))).rejects.toThrow();
    const made = storage.createDialogFilter(newFolder('Unread'));

    expect(sent('messages.updateDialogFilter').map(({id}: {id: number}) => id)).toEqual([3, 3]);
    void made;
  });

  it('puts a suggested folder first on the server too, after All chats for Premium', async() => {
    const {storage, sent, answerAll} = await makeStorage([makeDialogFilter(2, 2), makeDialogFilter(3, 3)], true);

    const made = storage.createDialogFilter(newFolder('Unread'), true);
    answerAll();
    await made;

    expect(sent('messages.updateDialogFiltersOrder')).toEqual([{order: [0, 4, 2, 3]}]);
  });

  it('puts a suggested folder first on the server without All chats, which has no place there without Premium', async() => {
    const {storage, sent, answerAll} = await makeStorage([makeDialogFilter(2, 2)]);

    const made = storage.createDialogFilter(newFolder('Unread'), true);
    answerAll();
    await made;

    expect(sent('messages.updateDialogFiltersOrder')).toEqual([{order: [3, 2]}]);
  });

  it('sends the folders\' order without All chats when it has no place there, as the folders\' screen reorders them', async() => {
    const {storage, sent} = await makeStorage([makeDialogFilter(2, 2), makeDialogFilter(3, 3)]);

    await storage.updateDialogFiltersOrder([0, 3, 2]);

    expect(sent('messages.updateDialogFiltersOrder')).toEqual([{order: [3, 2]}]);
  });

  it('leaves the order alone for a folder made where it is made, last', async() => {
    const {storage, sent, answerAll} = await makeStorage([makeDialogFilter(2, 2)]);

    const made = storage.createDialogFilter(newFolder('Work'));
    answerAll();
    await made;

    expect(sent('messages.updateDialogFiltersOrder')).toEqual([]);
  });
});
