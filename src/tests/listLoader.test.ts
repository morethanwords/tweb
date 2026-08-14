import ListLoader from '@helpers/listLoader';

type Item = {mid: number};

describe('ListLoader', () => {
  test('skips holes instead of passing them to processItem', async() => {
    const processed: number[] = [];
    const loader = new ListLoader<Item, Item>({
      loadCount: 10,
      loadMore: async() => ({count: 3, items: [{mid: 1}, undefined, {mid: 3}]}),
      processItem: (item) => {
        processed.push(item.mid);
        return item;
      }
    });

    await loader.load(true);

    expect(processed).toEqual([1, 3]);
    expect(loader.next).toEqual([{mid: 1}, {mid: 3}]);
  });

  test('skips holes without processItem too', async() => {
    const loader = new ListLoader<Item, Item>({
      loadCount: 10,
      loadMore: async() => ({count: 2, items: [undefined, {mid: 2}]})
    });

    await loader.load(true);

    expect(loader.next).toEqual([{mid: 2}]);
  });
});
