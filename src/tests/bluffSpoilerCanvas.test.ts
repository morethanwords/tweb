import {beforeEach, describe, expect, test, vi} from 'vitest';
import {MessageEntity} from '@layer';

const {attachBluffTextSpoilerTarget} = vi.hoisted(() => ({
  attachBluffTextSpoilerTarget: vi.fn()
}));

vi.mock('@components/dotRenderer', () => ({
  default: {attachBluffTextSpoilerTarget}
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {addEventListener: () => {}, getState: () => Promise.resolve({})}
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
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: (): null => null
  });

  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: class Worker {}});
  Object.defineProperty(globalThis, 'CSS', {configurable: true, value: {supports: () => true}});
});

import wrapRichText from '@lib/richTextProcessor/wrapRichText';

beforeEach(() => {
  attachBluffTextSpoilerTarget.mockClear();
});

describe('inline bluff spoiler canvas', () => {
  test('uses one canvas for the whole spoiler', () => {
    const text = 'secret';
    const entities: MessageEntity[] = [{_: 'messageEntitySpoiler', offset: 0, length: text.length}];
    const fragment = wrapRichText(text, {entities, noTextFormat: true});
    const spoiler = fragment.querySelector<HTMLElement>('.bluff-spoiler');

    expect(spoiler).not.toBeNull();
    expect(spoiler.querySelectorAll('.bluff-spoiler-letter')).toHaveLength(text.length);
    expect(spoiler.querySelectorAll('canvas.bluff-spoiler-canvas')).toHaveLength(1);
    expect(spoiler.querySelector('.bluff-spoiler-letter canvas')).toBeNull();
    expect(spoiler.style.maskImage).toBe('');
    expect(attachBluffTextSpoilerTarget).toHaveBeenCalledOnce();
    expect(attachBluffTextSpoilerTarget).toHaveBeenCalledWith(spoiler);
  });
});
