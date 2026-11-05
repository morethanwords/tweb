import {expect, it, vi} from 'vitest';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {DeferredCall} from '@/tests/helpers/deferredCalls';
import lastItem from '@helpers/array/lastItem';

export const ids = (docs: MyDocument[]) => docs.map((doc) => doc.id);

/** A document by its id, the same one each time it is asked for: what a list and a manager's getDoc both hand out */
export function makeDocs() {
  const docs: {[id: string]: MyDocument} = {};
  return (id: string) => docs[id] ??= {_: 'document', id} as any as MyDocument;
}

/** A manager whose list of the user's (the faved stickers, the saved GIFs) changes here before the server answers */
export type ListChanging = {
  // * the requests that send the changes, in order, each waiting for the test to answer it
  calls: DeferredCall[],
  change: (id: string, remove?: boolean) => Promise<unknown>,
  // * the request's flag that a removal sets
  removeFlag: string,
  getList: () => MyDocument[],
  // * the server's list put in place of the one here, as an update reads it anew
  replaceList: (ids: string[]) => void,
  // * each change as it was told, which the toast follows: added or taken out
  told: () => boolean[],
  // * the lists the panel was told were put back
  reverted: () => MyDocument[][],
  // * how many times the list was read from the server
  listReads: () => number
};

/**
 * A change of such a list that the server did not take stayed made here until a reload. Now it is taken out as if it had
 * not been made (OptimisticListChanges), the same for every such list
 */
export default function testListChangeRefusals(create: (list: string[], limit?: number) => ListChanging) {
  const refusal = {type: 'MEDIA_INVALID'};
  const requested = (changing: ListChanging, count: number) => vi.waitFor(() => expect(changing.calls).toHaveLength(count));

  it.each([
    ['an addition', ['1', '2'], '3', false, 5, ['3', '1', '2']],
    ['an addition of one in the list already', ['1', '2'], '2', false, 5, ['2', '1']],
    ['an addition past the limit', ['1', '2'], '3', false, 2, ['3', '1']],
    ['a removal', ['1', '2', '3'], '2', true, 5, ['1', '3']]
  ])('%s the server did not take puts the list back, telling the panel with no toast', async(_, list, id, remove, limit, changed) => {
    const changing = create(list, limit);

    const making = changing.change(id, remove);
    await requested(changing, 1);
    expect(changing.calls[0].params).toMatchObject({[changing.removeFlag]: remove});
    expect(ids(changing.getList())).toEqual(changed);

    changing.calls[0].deferred.reject(refusal);
    await expect(making).rejects.toBe(refusal);

    expect(ids(changing.getList())).toEqual(list);
    // * the toast follows the change told: it was told once, and its undoing is not
    expect(changing.told()).toEqual([!remove]);
    expect(changing.reverted()).toHaveLength(1);
    expect(changing.reverted()[0]).toBe(changing.getList());
  });

  it('leaves a list that came from the server meanwhile as it is', async() => {
    const changing = create(['1']);

    const making = changing.change('2');
    await requested(changing, 1);
    changing.replaceList(['5']);

    changing.calls[0].deferred.reject(refusal);
    await expect(making).rejects.toBe(refusal);

    expect(ids(changing.getList())).toEqual(['5']);
    expect(changing.reverted()).toEqual([]);
  });

  it.each([
    ['two additions, the first refused', ['1'], 5, [['2', false], ['3', false]], [0], ['3', '1']],
    ['two additions, both refused', ['1'], 5, [['2', false], ['3', false]], [0, 1], ['1']],
    ['two additions, the second refused first', ['1'], 5, [['2', false], ['3', false]], [1, 0], ['1']],
    ['two additions past the limit, the first refused', ['1', '2'], 2, [['3', false], ['4', false]], [0], ['4', '1']],
    ['a removal and an addition, the removal refused', ['1', '2'], 5, [['1', true], ['3', false]], [0], ['3', '1', '2']],
    ['an addition and a removal of the same one, the removal refused', ['1'], 5, [['2', false], ['2', true]], [1], ['2', '1']]
  ] as const)('%s: takes out only what was refused, keeping the changes made since', async(_, list, limit, changes, refused, after) => {
    const changing = create([...list], limit);

    const making = changes.map(([id, remove]) => changing.change(id, remove).catch((err) => err));
    await requested(changing, changes.length);
    for(const index of refused) {
      changing.calls[index].deferred.reject(refusal);
      await making[index];
    }

    changing.calls.forEach(({deferred}) => deferred.resolve(true));
    await Promise.all(making);

    expect(ids(changing.getList())).toEqual(after);
    expect(ids(lastItem(changing.reverted()))).toEqual(after);
    expect(changing.reverted()).toHaveLength(refused.length);
    expect(changing.listReads()).toBe(0);
  });

  it('keeps a change the server took', async() => {
    const changing = create(['1']);

    const making = changing.change('2');
    await requested(changing, 1);
    changing.calls[0].deferred.resolve(true);
    await making;

    expect(ids(changing.getList())).toEqual(['2', '1']);
    expect(changing.reverted()).toEqual([]);
  });
}
