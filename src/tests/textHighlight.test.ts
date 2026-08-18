import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

// * jsdom has Range + MutationObserver but no CSS Custom Highlight API — a Set-based stand-in
// * is enough to observe what gets registered
vi.hoisted(() => {
  class HighlightMock extends Set<AbstractRange> {
    public priority = 0;
  }

  vi.stubGlobal('CSS', {highlights: new Map<string, HighlightMock>()});
  vi.stubGlobal('Highlight', HighlightMock);
});

vi.mock('@helpers/liteMode', () => ({
  default: {isAvailable: () => false}
}));

import type {TextLineBox} from '@helpers/dom/textHighlight';
import highlightText, {
  computeFullRange,
  computeLineBoxes,
  computeNarrowing,
  computeRanges,
  extractText,
  findQuoteSpan,
  findSearchSpans
} from '@helpers/dom/textHighlight';

const html = (markup: string) => {
  const element = document.createElement('div');
  element.innerHTML = markup;
  document.body.append(element);
  return element;
};

const registered = (name: string) => [...(CSS.highlights.get(name) as any as Set<Range>)];

afterEach(() => {
  document.body.replaceChildren();
});

describe('findSearchSpans', () => {
  it('matches the whole query as a phrase at word boundaries', () => {
    expect(findSearchSpans('say hello world, hello worlds', 'hello world')).toEqual([[4, 15]]);
  });

  it('is case-insensitive', () => {
    expect(findSearchSpans('Hello HELLO hello', 'hello')).toEqual([[0, 5], [6, 11], [12, 17]]);
  });

  it('extends every query word to the end of the word it starts', () => {
    expect(findSearchSpans('hello world, hell no', 'hel wor')).toEqual([[0, 5], [6, 11], [13, 17]]);
  });

  it('does not match inside a word', () => {
    expect(findSearchSpans('othello shell', 'hell')).toEqual([]);
  });

  it('falls back to a shorter prefix of a word, but not below half of it', () => {
    // * "running" → "runnin" → "runni" → "runn" matches "runners"; "run" (3 < 4) is never tried
    expect(findSearchSpans('runners run', 'running')).toEqual([[0, 7]]);
    expect(findSearchSpans('runs and runes', 'running')).toEqual([]);
  });

  it('handles non-latin scripts and regexp characters', () => {
    expect(findSearchSpans('Привет, мир! привет', 'прив')).toEqual([[0, 6], [13, 19]]);
    expect(findSearchSpans('a (b) c', '(b)')).toEqual([[2, 5]]);
  });

  it('merges overlapping matches', () => {
    expect(findSearchSpans('foobar foo', 'foo foobar')).toEqual([[0, 6], [7, 10]]);
  });

  it('ignores an empty query', () => {
    expect(findSearchSpans('text', '   ')).toEqual([]);
  });
});

describe('findQuoteSpan', () => {
  const text = 'one two three two one';

  it('finds the exact quote closest to the offset', () => {
    expect(findQuoteSpan(text, 'two', 0)).toEqual([4, 7]);
    expect(findQuoteSpan(text, 'two', 13)).toEqual([14, 17]);
    expect(findQuoteSpan(text, 'two', 12)).toEqual([14, 17]);
    expect(findQuoteSpan(text, 'two', 9)).toEqual([4, 7]);
  });

  it('tolerates an offset past the end and a missing offset', () => {
    expect(findQuoteSpan(text, 'one', 100)).toEqual([18, 21]);
    expect(findQuoteSpan(text, 'three')).toEqual([8, 13]);
  });

  it('retries ignoring whitespace differences', () => {
    expect(findQuoteSpan('quoted line\nnext line', 'quoted line next', 0)).toEqual([0, 16]);
    expect(findQuoteSpan('a  b', 'a b')).toEqual([0, 4]);
  });

  it('gives up when the text is not there', () => {
    expect(findQuoteSpan(text, 'four', 0)).toBeUndefined();
    expect(findQuoteSpan(text, '', 0)).toBeUndefined();
  });
});

describe('extractText', () => {
  it('collects text nodes, emoji alt texts and skips icons', () => {
    const element = html('hi <img class="emoji" alt="😀"><span class="tgico">X</span> <b>there</b>');
    const {text, segments} = extractText(element);
    expect(text).toBe('hi 😀 there');
    expect(segments.map((s) => [s.start, s.end, s.atomic])).toEqual([
      [0, 3, false],
      [3, 5, true],
      [5, 6, false],
      [6, 11, false]
    ]);
  });

  it('honours the skip selector', () => {
    const element = html('text <span class="time">12:00</span>');
    expect(extractText(element, '.time').text).toBe('text ');
  });
});

describe('computeRanges', () => {
  it('spans element boundaries and lines', () => {
    const element = html('Hello <b>wonderful</b>\nworld and <i>more</i>');
    const [range] = computeRanges(element, {type: 'quote', text: 'wonderful\nworld'});
    expect(range.toString()).toBe('wonderful\nworld');
    expect(range.startContainer).toBe(element.querySelector('b').firstChild);
    expect(range.endContainer).toBe(element.querySelector('b').nextSibling);
  });

  it('snaps around atomic elements', () => {
    const element = html('a <img class="emoji" alt="😀"> b');
    const [range] = computeRanges(element, {type: 'quote', text: '😀 b'});
    expect(range.startContainer).toBe(element);
    expect(range.startOffset).toBe(1);
    expect(range.toString()).toBe(' b');
  });

  it('never reaches into skipped subtrees', () => {
    const element = html('12 <span class="time">12:00</span>');
    const ranges = computeRanges(element, {type: 'search', query: '12'}, '.time');
    expect(ranges.map((r) => r.toString())).toEqual(['12']);
  });
});

describe('computeLineBoxes', () => {
  // * jsdom does not lay out, so ranges are stood in for by objects with client rects
  const rect = (left: number, top: number, width: number, height: number) => ({left, top, width, height, right: left + width, bottom: top + height}) as DOMRect;
  const rangeOf = (...rects: DOMRect[]) => ({getClientRects: () => rects}) as any as Range;
  const origin = rect(100, 50, 400, 300);

  it('stretches glyph rects to the line height and unions the fragments of a line', () => {
    // * two text nodes of one line (e.g. plain + <b>) 19px high in a 21px line, then a wrapped line
    const boxes = computeLineBoxes([rangeOf(rect(110, 51, 40, 19), rect(150, 51, 60, 19), rect(100, 72, 90, 19))], origin, 21);
    expect(boxes).toEqual([
      {left: 10, top: 0, width: 100, height: 21},
      {left: 0, top: 21, width: 90, height: 21}
    ]);
  });

  it('keeps separate matches on one line apart', () => {
    const boxes = computeLineBoxes([rangeOf(rect(110, 51, 20, 19)), rangeOf(rect(200, 51, 30, 19))], origin, 21);
    expect(boxes.map((b) => [b.left, b.width])).toEqual([[10, 20], [100, 30]]);
  });

  it('closes hairline gaps between consecutive lines and skips empty rects', () => {
    // * a 21px line followed by a taller inline (24px) line: the half-leading estimate leaves 1.5px
    const boxes = computeLineBoxes([rangeOf(rect(100, 51, 50, 19), rect(100, 60, 0, 19), rect(100, 73, 50, 24))], origin, 21);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].top + boxes[0].height).toBeCloseTo(boxes[1].top);
  });

  it('leaves real gaps (an empty paragraph line) alone', () => {
    const boxes = computeLineBoxes([rangeOf(rect(100, 51, 50, 19), rect(100, 93, 50, 19))], origin, 21);
    expect(boxes.map((b) => b.top)).toEqual([0, 42]);
  });
});

describe('computeFullRange', () => {
  it('spans all the searchable text, skipped subtrees at the ends excluded', () => {
    const element = html('<span>hello</span> <b>world</b><span class="time">12:00</span>');
    const range = computeFullRange(element, '.time');
    expect(range.toString()).toBe('hello world');
    expect(range.startContainer).toBe(element.querySelector('span').firstChild);
    expect(range.endContainer).toBe(element.querySelector('b').firstChild);
    expect(computeFullRange(html('<span class="time">12:00</span>'), '.time')).toBeUndefined();
  });
});

describe('computeNarrowing', () => {
  const line = (index: number, left = 0, width = 300): TextLineBox => ({left, top: index * 21, width, height: 21});
  const full = [line(0), line(1), line(2), line(3), line(4)];

  it('lands every whole-text line on the match of its line or collapses it onto the nearest edge', () => {
    const t1 = line(1, 120, 180), t2 = line(2, 0, 90), t2b = line(2, 150, 40);
    const {ends, extra} = computeNarrowing(full, [t1, t2, t2b]);
    expect(ends).toEqual([
      {left: 120, top: 21, width: 180, height: 0}, // * above → top edge of the first match
      t1,
      t2,
      {left: 150, top: 63, width: 40, height: 0}, // * below → bottom edge of the last match above
      {left: 150, top: 63, width: 40, height: 0}
    ]);
    // * the second match on line 2 has no line box to come from — it fades in on its own
    expect(extra).toEqual([t2b]);
  });
});

describe('highlightText', () => {
  beforeAll(() => {
    // * fastRaf → requestAnimationFrame; timers are faked so the re-find and the sweep can be
    // * driven deterministically (the sweep timer is module-global, so this must come first)
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    // * jsdom has no layout, hence no client rects on ranges
    Range.prototype.getClientRects ??= () => [] as any as DOMRectList;
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('registers ranges under the highlight name and removes them on dispose', () => {
    const element = html('find me and find me again');
    const highlight = highlightText({container: element, match: {type: 'search', query: 'find'}});
    expect(highlight.found).toBe(true);
    expect(registered('tg-search').map((r) => r.toString())).toEqual(['find', 'find']);

    highlight.dispose();
    expect(registered('tg-search')).toEqual([]);
  });

  it('keeps highlights of different containers apart', () => {
    const a = highlightText({container: html('alpha'), match: {type: 'search', query: 'alpha'}});
    const b = highlightText({container: html('beta'), match: {type: 'search', query: 'beta'}});
    expect(registered('tg-search').map((r) => r.toString())).toEqual(['alpha', 'beta']);
    a.dispose();
    expect(registered('tg-search').map((r) => r.toString())).toEqual(['beta']);
    b.dispose();
  });

  it('re-finds the text after the container is re-rendered', async() => {
    const element = html('<span>old text</span>');
    const highlight = highlightText({container: element, match: {type: 'search', query: 'text'}});
    expect(registered('tg-search')[0].startContainer).toBe(element.firstChild.firstChild);

    element.replaceChildren('brand new text');
    await vi.advanceTimersByTimeAsync(10);
    const [range] = registered('tg-search');
    expect(range.startContainer).toBe(element.firstChild);
    expect(range.toString()).toBe('text');
    highlight.dispose();
  });

  it('gives quotes a higher priority than search matches', () => {
    const element = html('quoted words');
    const search = highlightText({container: element, match: {type: 'search', query: 'quoted'}});
    const quote = highlightText({container: element, match: {type: 'quote', text: 'quoted words'}});
    expect((CSS.highlights.get('tg-quote') as any).priority).toBeGreaterThan((CSS.highlights.get('tg-search') as any).priority);
    search.dispose();
    quote.dispose();
  });

  it('reports nothing found for a text that is not there', () => {
    const highlight = highlightText({container: html('nothing here'), match: {type: 'quote', text: 'absent'}});
    expect(highlight.found).toBe(false);
    highlight.dispose();
  });

  it('paints line boxes through an overlay prepended to the container', () => {
    const element = html('<span>boxed text</span>');
    element.style.position = 'relative';
    const highlight = highlightText({container: element, match: {type: 'search', query: 'boxed'}, lineBoxes: true});
    const overlay = element.firstElementChild as HTMLElement;
    expect(overlay.classList.contains('text-highlight-overlay')).toBe(true);
    expect(highlight.found).toBe(true);
    // * the overlay never touches the highlight registry
    expect(registered('tg-search')).toEqual([]);
    // * and is not part of the searchable text
    expect(extractText(element).text).toBe('boxed text');

    highlight.dispose();
    expect(element.querySelector('.text-highlight-overlay')).toBeNull();
    expect(element.textContent).toBe('boxed text');
  });

  it('paints the match straight away when the narrowing intro cannot animate', () => {
    // * animations are off in this test (liteMode mock) — no intro, no transitions
    const element = html('<span>plain text</span>');
    const highlight = highlightText({container: element, match: {type: 'search', query: 'plain'}, lineBoxes: true, animateIn: true});
    const overlay = element.querySelector('.text-highlight-overlay');
    expect(overlay.classList.contains('is-narrowing')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(overlay.classList.contains('is-narrowing')).toBe(false);
    highlight.dispose();
  });

  it('collects a highlight whose container has left the document', () => {
    const element = html('gone soon');
    highlightText({container: element, match: {type: 'search', query: 'gone'}});
    expect(registered('tg-search').map((r) => r.toString())).toEqual(['gone']);

    element.remove();
    vi.advanceTimersByTime(30e3); // * noticed as detached
    expect(registered('tg-search')).toHaveLength(1);
    vi.advanceTimersByTime(30e3); // * still detached after the grace → released
    expect(registered('tg-search')).toEqual([]);
  });
});
