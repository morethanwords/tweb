import {describe, expect, it, vi} from 'vitest';
import FiltersStorage from '@lib/storages/filters';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import {fitFolderTags} from '@components/folderTags/layout';
import {getDialogFolderTags, getFolderTagColor} from '@stores/folderTags';
import {getSortableDragStep} from '@helpers/dom/sortable';

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
  const makeStorage = (serverTagsEnabled = false) => {
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
        filters: [{_: 'dialogFilterDefault'}]
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

    (storage as any).requestTagsEnabled();
    (storage as any).requestTagsEnabled();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.apiManager.invokeApiSingle).toHaveBeenCalledTimes(1);
    expect(tagsEnabled(storage)).toBe(true);
    expect(tagsPushes(storage)).toEqual([true]);
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
});
