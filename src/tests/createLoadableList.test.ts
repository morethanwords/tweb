import {describe, expect, test} from 'vitest';
import {createRoot} from 'solid-js';
import {createLoadableList} from '@helpers/solid/createLoadableList';
import deferredPromise from '@helpers/cancellablePromise';

describe('createLoadableList', () => {
  test('a second "load more" while a page is on its way asks for nothing more', async() => {
    const pages: ReturnType<typeof deferredPromise<void>>[] = [];
    const loadMore = () => {
      const page = deferredPromise<void>();
      pages.push(page);
      return page;
    };

    const [list] = createRoot(() => createLoadableList({loadMore}));
    const first = list().loadMore();
    const second = list().loadMore();
    expect(pages.length).toBe(1);
    expect(second).toBe(first);

    pages[0].resolve();
    await first;
    // * the next page, once the previous one is in
    list().loadMore();
    expect(pages.length).toBe(2);
  });

  test('a loader given later is guarded too', async() => {
    let calls = 0;
    const [list, setList] = createRoot(() => createLoadableList());
    setList((value) => {
      value.loadMore = () => {
        ++calls;
        return new Promise<void>(() => {});
      };
      return value;
    });

    list().loadMore();
    list().loadMore();
    expect(calls).toBe(1);
  });

  test('a loader that fails can be asked again', async() => {
    let calls = 0;
    const [list] = createRoot(() => createLoadableList({loadMore: () => {
      ++calls;
      return Promise.reject(new Error('page'));
    }}));

    await expect(list().loadMore()).rejects.toThrow('page');
    await expect(list().loadMore()).rejects.toThrow('page');
    expect(calls).toBe(2);
  });
});
