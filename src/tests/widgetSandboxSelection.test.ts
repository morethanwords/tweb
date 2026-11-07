import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const selected = vi.hoisted(() => ({selection: undefined as unknown}));
vi.mock('@helpers/appWindow', () => ({getAppWindow: () => ({getSelection: () => selected.selection})}));

import {getWidgetSelectedText} from '@lib/widgetSandbox/selection';

const TEXT = 'Selectable widget text';

/** The document's selection as an engine reports it: its range, its text, and (`composed`) its composed ranges. */
const makeSelection = (range: AbstractRange, composed?: (root: ShadowRoot) => StaticRange[]) => ({
  rangeCount: 1,
  toString: () => TEXT,
  getRangeAt: () => range,
  ...(composed && {getComposedRanges: ({shadowRoots: [root]}: {shadowRoots: ShadowRoot[]}) => composed(root)})
});

const collapsedAt = (node: Node, offset: number) => {
  const range = document.createRange();
  range.setStart(node, offset);
  return range;
};

describe('the text selected in a widget', () => {
  let bubble: HTMLElement, caption: HTMLElement, frame: HTMLElement, host: HTMLElement, text: Text;

  beforeEach(() => {
    bubble = document.createElement('div');
    caption = document.createElement('div');
    caption.textContent = 'caption';
    frame = document.createElement('div');
    host = document.createElement('div');
    host.className = 'widget-shadow';
    text = document.createTextNode(TEXT);
    host.attachShadow({mode: 'open'}).append(text);
    frame.append(host);
    bubble.append(frame, caption);
    document.body.append(bubble);
  });

  afterEach(() => {
    bubble.remove();
    selected.selection = undefined;
  });

  it('is found by the composed ranges', () => {
    const inRoot = new StaticRange({startContainer: text, startOffset: 0, endContainer: text, endOffset: 10});
    selected.selection = makeSelection(collapsedAt(frame, 0), () => [inRoot]);
    expect(getWidgetSelectedText(bubble)).toBe(TEXT);
  });

  it('is not the caption\'s, which the composed ranges put outside the widget', () => {
    const inCaption = new StaticRange({startContainer: caption.firstChild, startOffset: 0, endContainer: caption.firstChild, endOffset: 3});
    selected.selection = makeSelection(collapsedAt(caption.firstChild, 0), () => [inCaption]);
    expect(getWidgetSelectedText(bubble)).toBe('');
  });

  it('is found without composed ranges by the document\'s range collapsed at the widget (Chromium, WebKit)', () => {
    selected.selection = makeSelection(collapsedAt(frame, 0));
    expect(getWidgetSelectedText(bubble)).toBe(TEXT);
  });

  it('is found where the composed ranges take the shadow roots only as arguments', () => {
    selected.selection = makeSelection(collapsedAt(frame, 1), () => {
      throw new TypeError('not a ShadowRoot');
    });
    expect(getWidgetSelectedText(bubble)).toBe(TEXT);
  });

  it('is found without composed ranges by the document\'s range in the shadow root (Firefox)', () => {
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 10);
    selected.selection = makeSelection(range);
    expect(getWidgetSelectedText(bubble)).toBe(TEXT);
  });

  describe('reaching into it from a caption above it (a caption shown above)', () => {
    let above: HTMLElement;
    beforeEach(() => {
      above = document.createElement('div');
      above.textContent = 'above';
      bubble.prepend(above);
    });

    it('is found by the composed ranges', () => {
      const into = new StaticRange({startContainer: above.firstChild, startOffset: 2, endContainer: text, endOffset: 5});
      selected.selection = makeSelection(collapsedAt(above.firstChild, 2), () => [into]);
      expect(getWidgetSelectedText(bubble)).toBe(TEXT);
      // * the caption above alone is not
      const caption = new StaticRange({startContainer: above.firstChild, startOffset: 0, endContainer: above.firstChild, endOffset: 5});
      selected.selection = makeSelection(collapsedAt(above.firstChild, 0), () => [caption]);
      expect(getWidgetSelectedText(bubble)).toBe('');
    });

    it('is found without composed ranges by the document\'s range ending at the widget (Chromium, WebKit)', () => {
      const range = document.createRange();
      range.setStart(above.firstChild, 2);
      range.setEnd(frame, 0);
      selected.selection = makeSelection(range);
      expect(getWidgetSelectedText(bubble)).toBe(TEXT);
    });

    it('is found without composed ranges by the document\'s range ending in the shadow root (Firefox)', () => {
      const range = {startContainer: above.firstChild, startOffset: 2, endContainer: text, endOffset: 5, collapsed: false};
      selected.selection = makeSelection(range as unknown as AbstractRange);
      expect(getWidgetSelectedText(bubble)).toBe(TEXT);
    });

    it('is found where the selection goes over all of it, from the caption above to the one below', () => {
      const range = document.createRange();
      range.setStart(above.firstChild, 2);
      range.setEnd(caption.firstChild, 3);
      selected.selection = makeSelection(range);
      expect(getWidgetSelectedText(bubble)).toBe(TEXT);
    });
  });

  it('is none for a selection elsewhere, without composed ranges', () => {
    const range = document.createRange();
    range.selectNodeContents(caption);
    selected.selection = makeSelection(range);
    expect(getWidgetSelectedText(bubble)).toBe('');
    // * a caret in the caption
    selected.selection = makeSelection(collapsedAt(caption.firstChild, 2));
    expect(getWidgetSelectedText(bubble)).toBe('');
  });
});
