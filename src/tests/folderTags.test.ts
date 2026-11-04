import {describe, expect, it, vi} from 'vitest';
import type {DialogFilter} from '@layer';
import FiltersStorage, {MyDialogFilter} from '@lib/storages/filters';
import makeDialogFilter, {inputPeerUser} from '@/tests/helpers/dialogFilter';
import {fitFolderTags} from '@components/folderTags/layout';
import {getDialogFolderTags, getFolderTagColor} from '@stores/folderTags';
import {getSortableDragStep} from '@helpers/dom/sortable';
import pause from '@helpers/schedulers/pause';
import deferred from '@/tests/helpers/deferred';

const folder = (id: number, localId: number, color?: number) => makeDialogFilter(id, localId, color === undefined ? undefined : {color});

describe('fitFolderTags', () => {
  // * a "+N" is 20 wide here, and the tags stand 4 apart
  const fit = (widths: number[], available: number) => fitFolderTags(widths, available, () => 20, 4);

  it('puts every tag in when they fit', () => {
    expect(fit([30, 30], 100)).toEqual({visible: 2, more: 0});
  });

  it('counts every tag after the first one that does not fit, even one that would', () => {
    // 50 leaves 46, 60 does not fit there, and 10 goes into the "+2" all the same
    expect(fit([50, 60, 10], 100)).toEqual({visible: 1, more: 2});
  });

  it('gives the last tag that fitted up to a "+N" that does not', () => {
    // 50 and 40 leave 2, too little for the "+1" - which becomes a "+2" in the place of the 40
    expect(fit([50, 40, 10], 100)).toEqual({visible: 1, more: 2});
  });

  it('shows only the "+N" when not even the first tag fits', () => {
    expect(fit([120], 100)).toEqual({visible: 0, more: 1});
  });

  it('shows nothing when there is no room for the "+N" either', () => {
    expect(fit([120], 10)).toEqual({visible: 0, more: 0});
  });
});

describe('getDialogFolderTags', () => {
  const work = folder(2, 2, 0), news = folder(3, 3, 5), family = folder(4, 4, 1);
  const filters = [work, news, family];
  // * a chat in Work and Family, but not in News: the folders it is in are its indexes
  const dialog = {_: 'dialog', peerId: 1, index_0: 10, index_2: 10, index_4: 10} as any;

  it('tags a chat with every folder it is in, in the folders\' order', () => {
    expect(getDialogFolderTags(dialog, filters)).toEqual([work, family]);
  });

  it('leaves out the folder the list shows', () => {
    expect(getDialogFolderTags(dialog, filters, work.id)).toEqual([family]);
  });

  it('has nothing to say without a dialog', () => {
    expect(getDialogFolderTags(undefined, filters)).toEqual([]);
  });
});

describe('getFolderTagColor', () => {
  it('is the peer colour, and nothing for a folder without one', () => {
    expect(getFolderTagColor(folder(2, 2, 3))).toBe(3);
    expect(getFolderTagColor(folder(2, 2))).toBeUndefined();
    expect(getFolderTagColor(folder(2, 2, -1))).toBeUndefined();
  });

  it('wraps a colour past the palette, as Android and Desktop do', () => {
    expect(getFolderTagColor(folder(2, 2, 7))).toBe(0);
  });
});

describe('getSortableDragStep', () => {
  it('passes a row of the same height half-way past it, as it always did', () => {
    expect(getSortableDragStep([72, 72, 72], 0, 35)).toMatchObject({count: 0, passedHeight: 0});
    expect(getSortableDragStep([72, 72, 72], 0, 40)).toMatchObject({minY: 0, maxY: 144, count: 1, passedHeight: 72});
  });

  it('passes a taller row only half-way past its own height', () => {
    // the row below is a line taller: 40 is not yet half of it
    expect(getSortableDragStep([72, 82, 72], 0, 40)).toMatchObject({count: 0, passedHeight: 0});
    expect(getSortableDragStep([72, 82, 72], 0, 41)).toMatchObject({count: 1, passedHeight: 82});
  });

  it('stops at the ends of the run, which are as far as the rows are tall', () => {
    expect(getSortableDragStep([72, 82, 72], 0, 500)).toMatchObject({yDiff: 154, count: 2, passedHeight: 154});
    expect(getSortableDragStep([72, 82, 72], 2, -500)).toMatchObject({yDiff: -154, minY: -154, count: 2, passedHeight: 154});
  });

  it('goes up past the rows above', () => {
    // past the 82 at 41, and not yet past the 72 above it, which takes 82 + 36
    expect(getSortableDragStep([72, 82, 72], 2, -100)).toMatchObject({count: 1, passedHeight: 82});
  });
});

describe('FiltersStorage folder tags', () => {
  // * the server: the folders it sends, and the switch it keeps
  const makeStorage = (serverTagsEnabled = false, serverFilters: any[] = []) => {
    const storage: any = new FiltersStorage();
    storage.dialogsStorage = {getPinnedOrders: (): PeerId[] => []};
    storage.clear(true);
    storage.rootScope = {dispatchEvent: vi.fn()};
    storage.appStateManager = {pushToState: vi.fn()};
    storage.appPeersManager = {getPeerId: (peer: any) => peer.user_id};
    storage.apiManager = {
      invokeApiSingle: vi.fn(() => Promise.resolve({
        _: 'messages.dialogFilters',
        pFlags: serverTagsEnabled ? {tags_enabled: true} : {},
        filters: [{_: 'dialogFilterDefault'}, ...serverFilters]
      })),
      invokeApi: vi.fn((method: string, params: {enabled: boolean}) => {
        serverTagsEnabled = params.enabled;
        return Promise.resolve(true);
      })
    };

    return storage as FiltersStorage & {
      appStateManager: {pushToState: ReturnType<typeof vi.fn>},
      apiManager: {invokeApi: ReturnType<typeof vi.fn>, invokeApiSingle: ReturnType<typeof vi.fn>}
    };
  };

  const tagsEnabled = (storage: ReturnType<typeof makeStorage>): boolean => (storage as any).tagsEnabled;

  const tagsPushes = (storage: ReturnType<typeof makeStorage>) => storage.appStateManager.pushToState.mock.calls
  .filter(([key]) => key === 'filtersTagsEnabled')
  .map(([, value]) => value);

  it('keeps whether the tags are on from the folders the server sends', async() => {
    const storage = makeStorage(true);

    await storage.getDialogFilters(true);

    expect(tagsEnabled(storage)).toBe(true);
    expect(tagsPushes(storage)).toEqual([true]);
  });

  it('switches the tags on the server, and keeps the switch once it is taken', async() => {
    const storage = makeStorage();

    await storage.toggleDialogFilterTags(true);
    await storage.toggleDialogFilterTags(true);

    expect(storage.apiManager.invokeApi).toHaveBeenCalledWith('messages.toggleDialogFilterTags', {enabled: true});
    // * the second one changes nothing, and the state is not written for it
    expect(tagsPushes(storage)).toEqual([true]);
  });

  it('asks for the folders again once the tags are on, for the colours that came with them', async() => {
    const storage = makeStorage();

    await storage.toggleDialogFilterTags(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledWith('messages.getDialogFilters');
    // * and what they say about the switch is what was just set
    expect(tagsEnabled(storage)).toBe(true);
  });

  it('asks the server whether the tags are on once a session, whatever the state says', async() => {
    const storage = makeStorage(true);
    // * a state from before the switch was thrown on another device
    (storage as any).tagsEnabled = false;
    (storage as any).stateLoaded = Promise.resolve();

    storage.syncDialogFilters();
    storage.syncDialogFilters();
    await pause(0);

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(1);
    expect(tagsEnabled(storage)).toBe(true);
    expect(tagsPushes(storage)).toEqual([true]);
  });

  it('takes the folders the server has once a session, over the ones the state kept', async() => {
    // * on another device, while this one was closed: folder 2 renamed, folder 3 removed, folder 4 made
    const storage = makeStorage(false, [
      {...folder(4, undefined), title: {_: 'textWithEntities', text: 'Made', entities: []}},
      {...folder(2, undefined), title: {_: 'textWithEntities', text: 'Renamed', entities: []}}
    ]);
    const stateLoaded = deferred();
    (storage as any).stateLoaded = stateLoaded.promise;

    storage.syncDialogFilters();
    await pause(0);
    // * nothing is asked before the state's folders are in place, for them not to go over the server's
    expect(storage.apiManager.invokeApiSingle).not.toHaveBeenCalled();

    [folder(2, undefined), folder(3, undefined)].forEach((filter) => storage.saveDialogFilter(filter, false, true));
    stateLoaded.resolve();
    await pause(0);

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(1);
    expect(storage.getFilter(2).title.text).toBe('Renamed');
    expect(storage.getFilter(3)).toBeUndefined();
    expect(storage.getFilter(4).title.text).toBe('Made');
    expect((storage as any).rootScope.dispatchEvent).toHaveBeenCalledWith('filter_order', [0, 1, 4, 2]);
  });

  // * the folders a state keeps, put in place as after() does: the real ones with them
  const loadState = (storage: ReturnType<typeof makeStorage>, filters: MyDialogFilter[]) => {
    (storage as any).prependFilters(filters).forEach((filter: MyDialogFilter) => storage.saveDialogFilter(filter, false, true));
    (storage as any).stateLoaded = Promise.resolve();
  };

  // * the folder events the storage has told the screen
  const folderEvents = (storage: ReturnType<typeof makeStorage>) => (storage as any).rootScope.dispatchEvent.mock.calls
  .map(([event]: [string]) => event)
  .filter((event: string) => event.startsWith('filter_'));

  it('starts with the folders kept when the server refuses them, and takes its own when asked again', async() => {
    // * an account whose state keeps no folders of its own: the chat list asks the server for them as it starts
    const storage = makeStorage(false, [folder(2, undefined)]);
    loadState(storage, []);
    storage.apiManager.invokeApiSingle.mockRejectedValueOnce(new Error('INTERNAL'));

    const filters = await storage.getDialogFiltersToStart();
    expect(filters.map((filter) => filter.id)).toEqual([0, 1]);
    expect(folderEvents(storage)).toEqual([]);

    // * the sync the chat list starts once it is up asks again
    storage.syncDialogFilters();
    await pause(0);
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
    expect(storage.getFilter(2)).toBeDefined();
    expect((storage as any).rootScope.dispatchEvent).toHaveBeenCalledWith('filter_order', [0, 1, 2]);
  });

  it('does not take the folders kept for the server\'s when they are asked for after the start', async() => {
    // * a folder made now would take the id of one the server has
    const storage = makeStorage(false, [folder(2, undefined)]);
    loadState(storage, []);
    storage.apiManager.invokeApiSingle.mockRejectedValueOnce(new Error('INTERNAL'));

    await expect(storage.getDialogFilters()).rejects.toThrow('INTERNAL');
  });

  it('tells the screen nothing on a start with nothing changed elsewhere', async() => {
    const storage = makeStorage(false, [folder(2, undefined), folder(3, undefined)]);
    loadState(storage, [folder(2, undefined), folder(3, undefined)]);

    storage.syncDialogFilters();
    await pause(0);

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(1);
    expect(folderEvents(storage)).toEqual([]);
  });

  // * folder 2 as the server has it, by its title
  const titled = (text: string) => makeDialogFilter(2, undefined, {title: {_: 'textWithEntities', text, entities: []}});

  // * a start whose state kept folder 2, with the server's answers to the sync and an edit's held back until a test
  // * gives them - `answer(n, title)` answers the n-th time the folders were asked for, with folder 2 so titled (and
  // * the folders `more` after it), and `fail(n)` fails it
  const holdSync = () => {
    const storage = makeStorage();
    loadState(storage, [folder(2, undefined)]);
    const answers: Array<ReturnType<typeof deferred<any>>> = [];
    storage.apiManager.invokeApiSingle.mockImplementation(() => {
      const answer = deferred<any>();
      answers.push(answer);
      return answer.promise;
    });
    const edit = deferred<boolean>();
    storage.apiManager.invokeApi.mockImplementation(() => edit.promise);
    const answer = (index: number, text: string, pFlags: object = {}, more: MyDialogFilter[] = []) => {
      answers[index].resolve({_: 'messages.dialogFilters', pFlags, filters: [{_: 'dialogFilterDefault'}, titled(text), ...more]});
    };

    const fail = (index: number) => answers[index].reject(new Error('FLOOD_WAIT'));

    return {storage, edit, answer, fail};
  };

  it('tells the screen nothing on a start whose folder pins chats, which the kept one includes as well', async() => {
    // * as the server lists it: the pinned chat in pinned_peers only
    const pinning = () => makeDialogFilter(2, undefined, {pinned_peers: [inputPeerUser(5)], include_peers: [inputPeerUser(6)]});
    const storage = makeStorage(false, [pinning()]);
    loadState(storage, [pinning()]);
    expect(storage.getFilter(2).includePeerIds).toEqual([5, 6]);

    storage.syncDialogFilters();
    await pause(0);

    expect(folderEvents(storage)).toEqual([]);
  });

  it('does not take an answer that crossed an edit of a folder, and asks again once the edit is done', async() => {
    const {storage, edit, answer} = holdSync();

    storage.syncDialogFilters();
    await pause(0);
    const editing = storage.updateDialogFilter(titled('Edited'));
    answer(0, 'Before the edit');
    await pause(0);
    expect(storage.getFilter(2).title.text).toBe('Folder 2');

    edit.resolve(true);
    await editing;
    expect(storage.getFilter(2).title.text).toBe('Edited');
    answer(1, 'Edited');
    await pause(0);
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
    expect(storage.getFilter(2).title.text).toBe('Edited');
  });

  it('does not take an answer asked for while an edit was on its way, and asks again once it is done', async() => {
    const {storage, edit, answer} = holdSync();

    const editing = storage.updateDialogFilter(titled('Edited'));
    storage.syncDialogFilters();
    await pause(0);
    answer(0, 'Before the edit');
    await pause(0);
    expect(storage.getFilter(2).title.text).toBe('Folder 2');
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(1);

    edit.resolve(true);
    await editing;
    await pause(0);
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
    answer(1, 'Edited');
    await pause(0);
    expect(storage.getFilter(2).title.text).toBe('Edited');
  });

  it('asks again on the next start of the sync when the one after the edits failed', async() => {
    const {storage, edit, answer, fail} = holdSync();

    const editing = storage.updateDialogFilter(titled('Edited'));
    storage.syncDialogFilters();
    await pause(0);
    answer(0, 'Before the edit');
    await pause(0);
    edit.resolve(true);
    await editing;
    fail(1);
    await pause(0);

    storage.syncDialogFilters();
    await pause(0);
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(3);
  });

  it('does not take an answer that an edit begun before it and done meanwhile has made old', async() => {
    const {storage, edit, answer} = holdSync();

    const editing = storage.updateDialogFilter(titled('Edited'));
    storage.syncDialogFilters();
    await pause(0);
    edit.resolve(true);
    await editing;
    answer(0, 'Before the edit');
    await pause(0);
    expect(storage.getFilter(2).title.text).toBe('Edited');
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that a folder update coming meanwhile has made old', async() => {
    const {storage, answer} = holdSync();

    storage.syncDialogFilters();
    await pause(0);
    // * a shared folder joined meanwhile, as joinChatlistInvite hands it over
    (storage as any).onUpdateDialogFilter({_: 'updateDialogFilter', id: 9, filter: folder(9, undefined)});
    answer(0, 'Folder 2');
    await pause(0);
    expect(storage.getFilter(9)).toBeDefined();
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that a folder made shared meanwhile has made old', async() => {
    const {storage, answer} = holdSync();
    const shared = {...titled('Folder 2'), _: 'dialogFilterChatlist'} as DialogFilter.dialogFilterChatlist;
    (storage.apiManager as any).invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult({
      _: 'chatlists.exportedChatlistInvite',
      filter: shared,
      invite: {}
    })));

    storage.syncDialogFilters();
    await pause(0);
    await storage.exportChatlistInvite(shared);
    // * the server's folders from before it was shared
    answer(0, 'Folder 2');
    await pause(0);
    expect(storage.getFilter(2)._).toBe('dialogFilterChatlist');
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that a folder removed meanwhile has made old', async() => {
    const {storage, answer} = holdSync();

    storage.syncDialogFilters();
    await pause(0);
    (storage as any).onUpdateDialogFilter({_: 'updateDialogFilter', id: 2});
    // * the server's folders from before it was removed
    answer(0, 'Folder 2');
    await pause(0);
    expect(storage.getFilter(2)).toBeUndefined();
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that the removal of a folder this client never had has made old', async() => {
    const {storage, answer} = holdSync();

    storage.syncDialogFilters();
    await pause(0);
    // * folder 7 was made elsewhere while this client was closed, and is removed now
    (storage as any).onUpdateDialogFilter({_: 'updateDialogFilter', id: 7});
    answer(0, 'Folder 2', {}, [folder(7, undefined)]);
    await pause(0);
    expect(storage.getFilter(7)).toBeUndefined();
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not take an answer that word of the folders changed, coming meanwhile, has made old', async() => {
    const {storage, answer} = holdSync();

    storage.syncDialogFilters();
    await pause(0);
    (storage as any).onUpdateDialogFilters({_: 'updateDialogFilters'});
    answer(0, 'Before the change');
    await pause(0);
    expect(storage.getFilter(2).title.text).toBe('Folder 2');
    // * the reload the word asks for, and the sync's again
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(3);
  });

  it('does not take the tags\' switch from an answer that the switch thrown meanwhile has made old', async() => {
    const {storage, edit, answer} = holdSync();
    (storage as any).tagsEnabled = true;

    storage.syncDialogFilters();
    await pause(0);
    const toggling = storage.toggleDialogFilterTags(false);
    edit.resolve(true);
    await toggling;
    // * the server's folders from before the switch
    answer(0, 'Folder 2', {tags_enabled: true});
    await pause(0);
    expect(tagsEnabled(storage)).toBe(false);
    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(2);
  });

  it('does not keep a switch the server did not take', async() => {
    const storage = makeStorage();
    storage.apiManager.invokeApi.mockImplementation(() => Promise.reject(new Error('PREMIUM_ACCOUNT_REQUIRED')));

    await expect(storage.toggleDialogFilterTags(true)).rejects.toThrow();

    expect(tagsEnabled(storage)).toBeUndefined();
    expect(tagsPushes(storage)).toEqual([]);
  });

  it('takes a colour off a folder whose new version has none', () => {
    const storage = makeStorage();
    storage.saveDialogFilter({...folder(5, undefined, 3), emoticon: '🏠'}, false, true);

    storage.saveDialogFilter(folder(5, undefined), true, true);

    expect(storage.getFilter(5).color).toBeUndefined();
    expect('emoticon' in storage.getFilter(5)).toBe(false);
  });

  it('asks for the folders again when an order names one it does not have, instead of throwing', async() => {
    // * folder 4 was made elsewhere and its updateDialogFilter missed; the server has it
    const storage = makeStorage(false, [folder(4, undefined), folder(2, undefined)]);
    (storage as any).prependFilters([folder(2, undefined)]).forEach((filter: any) => storage.saveDialogFilter(filter, false, true));

    expect(() => (storage as any).onUpdateDialogFilterOrder({_: 'updateDialogFilterOrder', order: [0, 4, 2]})).not.toThrow();
    await pause(0);

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledWith('messages.getDialogFilters');
    expect(storage.getFilter(4)).toBeDefined();
    expect((storage as any).rootScope.dispatchEvent).toHaveBeenCalledWith('filter_order', [0, 1, 4, 2]);
  });
});
