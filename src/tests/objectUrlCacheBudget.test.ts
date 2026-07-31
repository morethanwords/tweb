import ObjectUrlCacheBudget from '@lib/mainWorker/objectUrlCacheBudget';

describe('ObjectUrlCacheBudget', () => {
  it('evicts the least-recently-used URL by count', () => {
    const budget = new ObjectUrlCacheBudget<string>(2, Infinity);

    budget.set('first', 'blob:first', 1);
    budget.set('second', 'blob:second', 1);

    expect(budget.set('third', 'blob:third', 1)).toEqual([
      {key: 'first', url: 'blob:first', size: 1}
    ]);
  });

  it('touches an entry without changing its accounting', () => {
    const budget = new ObjectUrlCacheBudget<string>(2, Infinity);

    budget.set('first', 'blob:first', 1);
    budget.set('second', 'blob:second', 1);
    budget.touch('first');

    expect(budget.set('third', 'blob:third', 1)).toEqual([
      {key: 'second', url: 'blob:second', size: 1}
    ]);
  });

  it('counts aliases as one retained Blob and evicts all old aliases when needed', () => {
    const budget = new ObjectUrlCacheBudget<string>(1, Infinity);

    budget.set('alias-a', 'blob:shared', 10);
    budget.set('alias-b', 'blob:shared', 10);

    expect(budget.set('next', 'blob:next', 5)).toEqual([
      {key: 'alias-a', url: 'blob:shared', size: 10},
      {key: 'alias-b', url: 'blob:shared', size: 10}
    ]);
  });

  it('uses the largest known size for aliases', () => {
    const budget = new ObjectUrlCacheBudget<string>(10, 12);

    budget.set('alias-a', 'blob:shared', 4);
    budget.set('alias-b', 'blob:shared', 10);

    expect(budget.set('next', 'blob:next', 5)).toEqual([
      {key: 'alias-a', url: 'blob:shared', size: 4},
      {key: 'alias-b', url: 'blob:shared', size: 10}
    ]);
  });

  it('shrinks retained bytes after deleting the largest alias', () => {
    const budget = new ObjectUrlCacheBudget<string>(10, 10);

    budget.set('large-alias', 'blob:shared', 10);
    budget.set('small-alias', 'blob:shared', 4);
    budget.delete('large-alias');

    expect(budget.set('next', 'blob:next', 6)).toEqual([]);
  });

  it('keeps one oversized URL and evicts it when another is added', () => {
    const budget = new ObjectUrlCacheBudget<string>(2, 10);

    expect(budget.set('large', 'blob:large', 100)).toEqual([]);
    expect(budget.set('next', 'blob:next', 100)).toEqual([
      {key: 'large', url: 'blob:large', size: 100}
    ]);
  });
});
