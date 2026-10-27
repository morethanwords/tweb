import {createRoot, createSignal} from 'solid-js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {getMiddleware} from '@helpers/middleware';
import attachDialogFolderTags from '@components/folderTags/dialogFolderTags';
import makeDialogFilter from '@/tests/helpers/dialogFilter';

const mocks = vi.hoisted(() => ({
  fitFolderTags: vi.fn()
}));

// * a row is fitted to its width only through `fitFolderTags`: counting its calls is counting the work
vi.mock('@components/folderTags/layout', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@components/folderTags/layout')>();
  return {
    ...actual,
    measureFolderTag: () => 40,
    fitFolderTags: (...args: Parameters<typeof actual.fitFolderTags>) => {
      mocks.fitFolderTags(...args);
      return actual.fitFolderTags(...args);
    }
  };
});

// * the mock is hoisted above this line, but the folders are read only when a row asks for them
const work = makeDialogFilter(2, 2, {color: 0});
vi.mock('@stores/folderTags', async(importOriginal) => ({
  ...await importOriginal<typeof import('@stores/folderTags')>(),
  useFolderTagsShown: () => () => true,
  useFolderTagFilters: () => () => [work],
  useChatListNarrow: () => () => false
}));

// * nothing about how a tag looks matters here
vi.mock('@components/folderTags/folderTag', () => ({
  FOLDER_TAG_MORE_COLOR: 5,
  default: () => document.createElement('span')
}));

/**
 * A resize of the chat list hands every row its new width, on every frame of it - and most rows have
 * no tags to fit, so they must not be the ones to pay for it
 */
describe('folder tags of a chat list row, as the list is resized', () => {
  const middlewareHelper = getMiddleware();
  afterEach(() => middlewareHelper.clean());

  const attach = (inFolder: boolean) => {
    const [width, setWidth] = createRoot(() => createSignal(400));
    const listEl = document.createElement('li');
    const after = document.createElement('div');
    listEl.append(after);

    const row = attachDialogFolderTags({
      listEl,
      after,
      context: {filterId: 0, width},
      middleware: middlewareHelper.get()
    });
    row.setDialog({_: 'dialog', peerId: 1, index_0: 10, ...(inFolder ? {index_2: 10} : {})} as any);
    mocks.fitFolderTags.mockClear();

    return {row, setWidth};
  };

  it('leaves a row without tags alone', () => {
    const {row, setWidth} = attach(false);

    setWidth(300);
    setWidth(200);

    expect(row.hasTags()).toBe(false);
    expect(mocks.fitFolderTags).not.toHaveBeenCalled();
  });

  it('fits a row with tags to every width it gets', () => {
    const {row, setWidth} = attach(true);

    setWidth(300);
    setWidth(200);

    expect(row.hasTags()).toBe(true);
    expect(mocks.fitFolderTags).toHaveBeenCalledTimes(2);
  });
});
