import {describe, expect, test, vi} from 'vitest';
import {MessageEntity} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

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
});
