import {describe, expect, test, vi} from 'vitest';
import {MessageEntity} from '@layer';
import {getMiddleware} from '@helpers/middleware';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

vi.mock('@lib/apiManagerProxy', () => ({default: {addEventListener: () => {}, getState: () => Promise.resolve({})}}));

const codeMocks = vi.hoisted(() => ({highlightCode: vi.fn()}));
vi.mock('@/codeLanguages', () => ({
  CodeLanguageAliases: {ts: 'TypeScript'},
  highlightCode: codeMocks.highlightCode
}));

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

  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: class Worker {}});
  Object.defineProperty(globalThis, 'CSS', {configurable: true, value: {supports: () => true}});
});

function wrapTag(text: string, type: 'messageEntityHashtag' | 'messageEntityCashtag') {
  const entities: MessageEntity[] = [{_: type, offset: 0, length: text.length}];
  return wrapRichText(text, {entities}).querySelector('a.anchor-hashtag');
}

describe('wrapRichText tags', () => {
  test('wraps chat-specific hashtags', () => {
    const anchor = wrapTag('#news@telegram', 'messageEntityHashtag');

    expect(anchor.textContent).toBe('#news@telegram');
    expect(anchor.getAttribute('href')).toBe('tg://search_hashtag?hashtag=news%40telegram');
    expect(anchor.getAttribute('onclick')).toBe('searchByHashtag(this)');
  });

  test('wraps chat-specific cashtags without losing the dollar prefix', () => {
    const anchor = wrapTag('$TON@telegram', 'messageEntityCashtag');

    expect(anchor.textContent).toBe('$TON@telegram');
    expect(anchor.getAttribute('href')).toBe('tg://search_hashtag?hashtag=%24TON%40telegram');
    expect(anchor.getAttribute('onclick')).toBe('searchByHashtag(this)');
  });

  test('skips streamed highlighting and rejects stale async highlight results', async() => {
    const entity: MessageEntity.messageEntityPre = {
      _: 'messageEntityPre',
      offset: 0,
      length: 7,
      language: 'ts'
    };

    wrapRichText('const x', {entities: [entity], noCodeHighlight: true});
    expect(codeMocks.highlightCode).not.toHaveBeenCalled();

    let resolveHighlight: (html: string) => void;
    codeMocks.highlightCode.mockReturnValueOnce(new Promise<string>((resolve) => resolveHighlight = resolve));
    const middlewareHelper = getMiddleware();
    const fragment = wrapRichText('const x', {
      entities: [entity],
      middleware: middlewareHelper.get()
    });
    const code = fragment.querySelector('code');
    expect(code.textContent).toBe('const x');

    middlewareHelper.destroy();
    resolveHighlight('<b>stale</b>');
    await Promise.resolve();
    await Promise.resolve();
    expect(code.innerHTML).toBe('const x');
  });
});
