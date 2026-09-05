import {PageBlock, RichText} from '@layer';
import {
  StablePageBlockEntry,
  reconcileStablePageBlockEntries
} from '@components/instantView/stablePageBlocks';

const text = (value: string): RichText => ({_: 'textPlain', text: value});
const paragraph = (value: string): PageBlock => ({_: 'pageBlockParagraph', text: text(value)});
const details = (title: string, body: string): PageBlock => ({
  _: 'pageBlockDetails',
  pFlags: {},
  title: text(title),
  blocks: [paragraph(body)]
});
const caption = (value: string) => ({
  _: 'pageCaption',
  text: text(value),
  credit: {_: 'textEmpty'}
} as const);
const photo = (id: number, value: string): PageBlock => ({
  _: 'pageBlockPhoto',
  pFlags: {},
  photo_id: id,
  caption: caption(value)
});
const channel = (id: number): PageBlock => ({
  _: 'pageBlockChannel',
  channel: {_: 'chatEmpty', id}
});

function createReconciler() {
  let nextKey = 0;
  return (
    previous: readonly StablePageBlockEntry[],
    blocks: readonly PageBlock[]
  ) => reconcileStablePageBlockEntries(previous, blocks, () => `key-${++nextKey}`);
}

describe('reconcileStablePageBlockEntries', () => {
  test('keeps the component key while a text block streams', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [paragraph('hel')]);
    const next = reconcile(first, [paragraph('hello')]);

    expect(next[0].key).toBe(first[0].key);
    expect((next[0].block as PageBlock.pageBlockParagraph).text).toEqual(text('hello'));
  });

  test('uses the positional streaming fast path without fingerprinting growing text', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [paragraph('prefix')]);
    let textReads = 0;
    const nextBlock = {
      _: 'pageBlockParagraph',
      get text() {
        ++textReads;
        return text('prefix and streamed tail');
      }
    } as PageBlock.pageBlockParagraph;

    const next = reconcile(first, [nextBlock]);

    expect(next[0].key).toBe(first[0].key);
    expect(textReads).toBe(0);
  });

  test('preserves unchanged and stateful details blocks across insertion and text updates', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [paragraph('first'), details('Reasoning', 'step one')]);
    const detailsKey = first[1].key;
    const paragraphKey = first[0].key;

    const next = reconcile(first, [
      paragraph('new prefix'),
      paragraph('first'),
      details('Reasoning so far', 'step one and two')
    ]);

    expect(next[1].key).toBe(paragraphKey);
    expect(next[2].key).toBe(detailsKey);
    expect(next[0].key).not.toBe(paragraphKey);
  });

  test('uses protocol media identity and remounts when the resource changes', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [photo(10, 'caption')]);
    const samePhoto = reconcile(first, [photo(10, 'updated caption')]);
    const anotherPhoto = reconcile(samePhoto, [photo(11, 'caption')]);

    expect(samePhoto[0].key).toBe(first[0].key);
    expect(anotherPhoto[0].key).not.toBe(first[0].key);
  });

  test('follows channel protocol identity through an exact-pass reorder', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [channel(10), channel(20)]);
    const next = reconcile(first, [channel(20), channel(10)]);

    expect(next[0].key).toBe(first[1].key);
    expect(next[1].key).toBe(first[0].key);
  });

  test('follows media protocol identity through reorder and caption updates', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [photo(10, 'first'), photo(20, 'second')]);
    const next = reconcile(first, [photo(20, 'second updated'), photo(10, 'first updated')]);

    expect(next[0].key).toBe(first[1].key);
    expect(next[1].key).toBe(first[0].key);
  });

  test('does not reuse a component branch for another PageBlock kind', () => {
    const reconcile = createReconciler();
    const first = reconcile([], [paragraph('body')]);
    const next = reconcile(first, [{_: 'pageBlockHeading1', text: text('body')}]);

    expect(next[0].key).not.toBe(first[0].key);
  });
});
