import {describe, expect, it, vi} from 'vitest';
import {AppEmojiManager} from '@appManagers/appEmojiManager';
import pause from '@helpers/schedulers/pause';

const doc = (id: string) => ({_: 'document', id, attributes: [] as any[]});

function createEmojiManager(answer: (ids: string[]) => any[]) {
  const invokeApi = vi.fn((_method: string, params: {document_id: string[]}) => Promise.resolve(answer(params.document_id)));
  const manager = new AppEmojiManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appDocsManager: {
      getDoc: (): any => undefined,
      saveDoc: (doc: any) => doc._ === 'documentEmpty' ? undefined : doc
    }
  });

  return {manager, invokeApi};
}

// * an id the server has no document for ('404') asked together with one it has: the first gets nothing, the other its own
async function expectMissingAndFound(manager: AppEmojiManager) {
  const [missing, found] = await Promise.all([manager.getCustomEmojiDocument('404'), manager.getCustomEmojiDocument('2')]);
  expect(missing).toBeUndefined();
  expect(found.id).toBe('2');
}

// * the custom emoji asked for at once go to the server together (messages.getCustomEmojiDocuments), and each comes
// * back to whoever asked for it by its id, as the other clients take them: not by its place in the answer
describe('custom emoji asked for together', () => {
  it('each gets its own document, whatever order they come back in', async() => {
    const {manager} = createEmojiManager((ids) => ids.slice().reverse().map(doc));

    const [a, b] = await Promise.all([manager.getCustomEmojiDocument('1'), manager.getCustomEmojiDocument('2')]);

    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
  });

  it('one the server leaves out gets nothing, once, and the others theirs', async() => {
    const {manager, invokeApi} = createEmojiManager((ids) => ids.filter((id) => id !== '404').map(doc));

    await expectMissingAndFound(manager);
    await pause(10);

    // * not asked for again and again
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });

  it('one the server answers with an empty document gets nothing', async() => {
    const {manager} = createEmojiManager((ids) => ids.map((id) => id === '404' ? {_: 'documentEmpty', id} : doc(id)));

    await expectMissingAndFound(manager);
  });
});
