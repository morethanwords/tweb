import {afterEach, describe, expect, test, vi} from 'vitest';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {MessageEntity} from '@layer';

// wrapRichText reaches the worker proxy through langPack; none of that is needed to build a link
vi.mock('@lib/apiManagerProxy', () => ({default: {addEventListener: () => {}, getState: () => Promise.resolve({})}}));

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });

  // jsdom has no canvas backend; the environment probes wrapRichText pulls in need a string back
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: class Worker {}});
  Object.defineProperty(globalThis, 'CSS', {configurable: true, value: {supports: () => true}});
});

// A URL that breaks out of a single-quoted JS string literal if it is ever interpolated into one.
const BREAKOUT_URL = 'https://example.invalid/\'+alert(document.domain)+\'';

function wrapUrlEntity(url: string) {
  const entities: MessageEntity[] = [{_: 'messageEntityUrl', offset: 0, length: url.length}];
  const fragment = wrapRichText(url, {entities, passMaskedLinks: true});
  return fragment.querySelector('a.anchor-url');
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('wrapRichText external links', () => {
  test('a message cannot forge the Electron bridge by clobbering the global', () => {
    // Stage 1 of the report: LaTeX `\label{electronHelpers}` renders as an element carrying that
    // id, and a browser exposes every id on `window` — so a bare `typeof electronHelpers` sees an
    // element. jsdom does not implement those named properties, so bind the element by hand.
    vi.stubGlobal('electronHelpers', document.createElement('mtr'));

    const anchor = wrapUrlEntity(BREAKOUT_URL);
    expect(anchor.getAttribute('href')).toEqual(BREAKOUT_URL);
    expect(anchor.getAttribute('href').startsWith('javascript:')).toBe(false);
    expect(anchor.getAttribute('target')).toEqual('_blank');
  });

  test('the real Electron bridge gets the URL as data, never as markup', () => {
    const openExternal = vi.fn();
    vi.stubGlobal('electronHelpers', {openExternal});

    const anchor = wrapUrlEntity(BREAKOUT_URL);
    expect(anchor.getAttribute('href')).toEqual(BREAKOUT_URL);
    expect(anchor.getAttribute('href').startsWith('javascript:')).toBe(false);
    // opening happens through the bridge, so the link must not navigate the app window itself
    expect(anchor.getAttribute('target')).toBeNull();

    document.body.append(anchor);
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(openExternal).toHaveBeenCalledWith(BREAKOUT_URL);
  });

  test('links open in a new tab when there is no bridge', () => {
    const anchor = wrapUrlEntity('https://example.invalid/plain');
    expect(anchor.getAttribute('href')).toEqual('https://example.invalid/plain');
    expect(anchor.getAttribute('target')).toEqual('_blank');
    expect(anchor.getAttribute('rel')).toEqual('noopener noreferrer');
  });
});
