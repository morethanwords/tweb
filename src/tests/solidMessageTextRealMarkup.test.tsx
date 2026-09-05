import {describe, expect, test} from 'vitest';
import type {TextWithEntities} from '@layer';
import type {SolidInlineText as SolidInlineTextType} from '@components/chat/bubbleParts/solidMessageText';
import {batch, createSignal} from 'solid-js';
import {render} from 'solid-js/web';

/**
 * The incremental renderer in `solidMessageText` reaches into the DOM that
 * `wrapRichText` produced — `pre` / `.spoiler` / `blockquote.quote-block`, looked up by
 * selector and by ordinal, then written through `code` / `.spoiler-text`. Every other suite
 * around that code replaces `wrapRichText` with a simplified stand-in, so those assumptions
 * are only ever checked against a second implementation of them.
 *
 * This suite deliberately runs the real renderer: it pins the markup contract the
 * incremental paths depend on, and streams each structural entity through them so a
 * change on either side of the seam fails here instead of silently degrading playback
 * into full re-renders (or, worse, writing into the wrong node).
 */

let SolidInlineText: typeof SolidInlineTextType;

beforeAll(async() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.doMock('@lib/customEmoji/element', () => ({
    default: {create: () => document.createElement('span')}
  }));
  vi.doMock('@lib/customEmoji/renderer', () => ({
    CustomEmojiRendererElement: {create: () => ({})}
  }));
  vi.doMock('@components/dotRenderer', () => ({
    default: {attachBluffTextSpoilerTarget: () => {}}
  }));
  vi.doMock('@lib/langPack', () => ({
    // `getIsRTL` is what the code-block header's icons read; without it the whole
    // messageEntityPre branch throws instead of rendering.
    default: {format: () => '', getIsRTL: () => false},
    i18n: () => document.createTextNode('')
  }));
  ({SolidInlineText} = await import('@components/chat/bubbleParts/solidMessageText'));
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const textWithEntities = (
  text: string,
  entities: TextWithEntities['entities'] = []
): TextWithEntities => ({_: 'textWithEntities', text, entities});

type Harness = {
  root: Element,
  setValue: (value: TextWithEntities) => void,
  setVisible: (visible: number) => void,
  setPhase: (phase: 'streaming' | 'final') => void,
  bumpRevision: () => void,
  push: (value: TextWithEntities, visible: number) => void,
  dispose: () => void
};

function mount(initial: TextWithEntities, visibleGraphemes: number): Harness {
  const host = document.createElement('div');
  let setValue: (value: TextWithEntities) => void;
  let setVisible: (visible: number) => void;
  let setPhase: (phase: 'streaming' | 'final') => void;
  let setRevision: (revision: number) => void;
  let revision = 1;

  const dispose = render(() => {
    const [value, updateValue] = createSignal(initial);
    const [visible, updateVisible] = createSignal(visibleGraphemes);
    const [phase, updatePhase] = createSignal<'streaming' | 'final'>('streaming');
    const [sourceRevision, updateRevision] = createSignal(revision);
    setValue = updateValue;
    setVisible = updateVisible;
    setPhase = updatePhase;
    setRevision = updateRevision;
    return (
      <SolidInlineText
        value={value}
        sourceRevision={sourceRevision}
        phase={phase}
        visibleGraphemes={visible}
      />
    );
  }, host);

  const bumpRevision = () => setRevision(++revision);
  return {
    root: host.firstElementChild,
    setValue,
    setVisible,
    setPhase,
    bumpRevision,
    push: (value, visible) => batch(() => {
      setValue(value);
      setVisible(visible);
      bumpRevision();
    }),
    dispose
  };
}

describe('solid message text against the real wrapRichText markup', () => {
  test('pins the markup contract the incremental paths select on', () => {
    const source = textWithEntities('code quiet cited', [
      {_: 'messageEntityPre', offset: 0, length: 4, language: ''},
      {_: 'messageEntitySpoiler', offset: 5, length: 5},
      {_: 'messageEntityBlockquote', offset: 11, length: 5, pFlags: {}}
    ]);
    const harness = mount(source, 16);

    // `tryExtendStableStructuralEntity` writes the streamed suffix into these nodes.
    const pre = harness.root.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre.querySelector('code')).not.toBeNull();
    expect(pre.querySelector('code').textContent).toBe('code');

    const spoiler = harness.root.querySelector('.spoiler');
    expect(spoiler).not.toBeNull();
    expect(spoiler.querySelector('.spoiler-text')).not.toBeNull();
    expect(spoiler.querySelector('.spoiler-text').textContent).toBe('quiet');

    const quote = harness.root.querySelector('blockquote.quote-block');
    expect(quote).not.toBeNull();
    expect(quote.textContent).toContain('cited');

    // The ordinal lookup counts entities of one kind and indexes the same-kind DOM query,
    // so the renderer must emit exactly one wrapper per structural entity.
    expect(harness.root.querySelectorAll('pre')).toHaveLength(1);
    expect(harness.root.querySelectorAll('.spoiler')).toHaveLength(1);
    expect(harness.root.querySelectorAll('blockquote.quote-block')).toHaveLength(1);

    harness.dispose();
  });

  test('grows a streamed pre without rebuilding its wrapper or its code node', () => {
    const makePre = (text: string) => textWithEntities(text, [{
      _: 'messageEntityPre',
      offset: 0,
      length: text.length,
      language: ''
    }]);
    const harness = mount(makePre('abc'), 3);

    const pre = harness.root.querySelector('pre');
    const code = pre.querySelector('code');
    expect(code.textContent).toBe('abc');

    harness.push(makePre('abcdef'), 6);

    expect(harness.root.querySelector('pre')).toBe(pre);
    expect(harness.root.querySelector('code')).toBe(code);
    expect(code.textContent).toBe('abcdef');
    expect(harness.root.querySelectorAll('pre')).toHaveLength(1);

    harness.dispose();
  });

  test('grows a streamed spoiler in place and keeps its prose prefix', () => {
    const makeSpoiler = (tail: string) => textWithEntities(`lead ${tail}`, [{
      _: 'messageEntitySpoiler',
      offset: 5,
      length: tail.length
    }]);
    const harness = mount(makeSpoiler('sec'), 8);

    const prose = harness.root.firstChild;
    const spoiler = harness.root.querySelector('.spoiler');
    const spoilerText = spoiler.querySelector('.spoiler-text');
    expect(spoilerText.textContent).toBe('sec');

    harness.push(makeSpoiler('secret'), 11);

    expect(harness.root.firstChild).toBe(prose);
    expect(harness.root.querySelector('.spoiler')).toBe(spoiler);
    expect(harness.root.querySelectorAll('.spoiler')).toHaveLength(1);
    expect(spoiler.textContent).toBe('secret');

    harness.dispose();
  });

  test('grows a streamed blockquote in place', () => {
    const makeQuote = (tail: string) => textWithEntities(`lead ${tail}`, [{
      _: 'messageEntityBlockquote',
      offset: 5,
      length: tail.length,
      pFlags: {}
    }]);
    const harness = mount(makeQuote('quo'), 8);

    const quote = harness.root.querySelector('blockquote.quote-block');
    expect(quote.textContent).toContain('quo');

    harness.push(makeQuote('quoted line'), 16);

    expect(harness.root.querySelector('blockquote.quote-block')).toBe(quote);
    expect(harness.root.querySelectorAll('blockquote.quote-block')).toHaveLength(1);
    expect(quote.textContent).toContain('quoted line');

    harness.dispose();
  });

  test('keeps the first pre untouched while the second one grows', () => {
    const makeTwo = (tail: string) => textWithEntities(`one mid ${tail}`, [
      {_: 'messageEntityPre', offset: 0, length: 3, language: ''},
      {_: 'messageEntityPre', offset: 8, length: tail.length, language: ''}
    ]);
    const harness = mount(makeTwo('two'), 11);

    const [firstPre, secondPre] = Array.from(harness.root.querySelectorAll('pre'));
    expect(firstPre.querySelector('code').textContent).toBe('one');
    expect(secondPre.querySelector('code').textContent).toBe('two');

    harness.push(makeTwo('twofold'), 15);

    const pres = Array.from(harness.root.querySelectorAll('pre'));
    expect(pres).toHaveLength(2);
    expect(pres[0]).toBe(firstPre);
    expect(pres[1]).toBe(secondPre);
    expect(firstPre.querySelector('code').textContent).toBe('one');
    expect(secondPre.querySelector('code').textContent).toBe('twofold');

    harness.dispose();
  });

  test('never splits a structural entity across a chunk boundary', () => {
    // The ordinal lookup only holds while one entity owns exactly one wrapper. Two guards
    // keep that true when a rewrite lands mid-entity — the non-splittable rule pulls the
    // dirty start back to the entity, and `tryTruncateChunk` refuses to cut a wrapper it
    // cannot address — so this pins the outcome rather than either mechanism.
    const harness = mount(textWithEntities('lead hidden', [
      {_: 'messageEntitySpoiler', offset: 5, length: 6}
    ]), 11);

    expect(harness.root.querySelectorAll('.spoiler')).toHaveLength(1);

    harness.push(textWithEntities('lead hiXXen tail', [
      {_: 'messageEntitySpoiler', offset: 5, length: 6}
    ]), 16);

    expect(harness.root.querySelectorAll('.spoiler')).toHaveLength(1);
    expect(harness.root.querySelector('.spoiler').textContent).toBe('hiXXen');
    expect(harness.root.textContent).toBe('lead hiXXen tail');

    harness.dispose();
  });

  test('rebuilds a pre range on finalization without disturbing its neighbours', () => {
    const source = textWithEntities('link then code', [
      {_: 'messageEntityTextUrl', offset: 0, length: 4, url: 'https://example.com'},
      {_: 'messageEntityPre', offset: 10, length: 4, language: ''}
    ]);
    const harness = mount(source, 14);

    const anchor = harness.root.querySelector('a');
    expect(anchor).not.toBeNull();

    harness.setPhase('final');

    expect(harness.root.querySelector('a')).toBe(anchor);
    expect(harness.root.querySelectorAll('pre')).toHaveLength(1);
    expect(harness.root.querySelector('pre').querySelector('code').textContent).toBe('code');

    harness.dispose();
  });
});
