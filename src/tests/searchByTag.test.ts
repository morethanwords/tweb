import {describe, expect, test, vi} from 'vitest';
import searchByTag from '@lib/richTextProcessor/searchByTag';

describe('searchByTag', () => {
  test('activates a regular tag search synchronously', async() => {
    const activateSearch = vi.fn();
    const promise = searchByTag({
      query: '$TON ',
      activateSearch,
      resolveUsername: vi.fn(),
      openPeer: vi.fn(),
      isCurrent: () => true,
      onResolveError: vi.fn()
    });

    expect(activateSearch).toHaveBeenCalledWith('$TON ');
    await promise;
    expect(activateSearch).toHaveBeenCalledTimes(1);
  });

  test('activates before resolving and reactivates after opening the target peer', async() => {
    const calls: string[] = [];
    let finishResolving: (peer: {id: number}) => void;
    const resolving = new Promise<{id: number}>((resolve) => {
      finishResolving = resolve;
    });
    const promise = searchByTag({
      query: '#news ',
      username: 'telegram',
      activateSearch: (query) => calls.push('activate:' + query),
      resolveUsername: () => {
        calls.push('resolve');
        return resolving;
      },
      openPeer: async() => {
        calls.push('open');
      },
      isCurrent: () => true,
      onResolveError: vi.fn()
    });

    expect(calls).toEqual(['activate:#news ', 'resolve']);
    finishResolving({id: 1});
    await promise;
    expect(calls).toEqual(['activate:#news ', 'resolve', 'open', 'activate:#news ']);
  });

  test('does not open a peer for a stale resolution', async() => {
    let current = true;
    const openPeer = vi.fn();
    await searchByTag({
      query: '#news ',
      username: 'telegram',
      activateSearch: vi.fn(),
      resolveUsername: async() => {
        current = false;
        return {id: 1};
      },
      openPeer,
      isCurrent: () => current,
      onResolveError: vi.fn()
    });

    expect(openPeer).not.toHaveBeenCalled();
  });
});
