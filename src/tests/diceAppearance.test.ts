import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@components/wrappers/sticker', () => ({
  default: vi.fn()
}));

vi.mock('@lib/lottie/lottieLoader', () => ({
  default: {waitForFirstFrame: vi.fn()}
}));

import type {BubbleContext} from '@components/chat/bubbles';
import wrapDice from '@components/chat/bubbleParts/dice';

const createContext = (isInUnread: boolean, emoticon = '🎲') => {
  const wrapSticker = vi.fn((_context: BubbleContext, _options: Parameters<BubbleContext['bubbles']['wrapSticker']>[1]) =>
    Promise.resolve({render: Promise.resolve()}));
  const context = {
    messageMedia: {emoticon, value: 6},
    bubble: document.createElement('div'),
    bubbleContainer: document.createElement('div'),
    attachmentDiv: document.createElement('div'),
    isInUnread,
    bubbles: {
      managers: {
        appStickersManager: {
          getStickerSetByDice: vi.fn(() => Promise.resolve({documents: []}))
        }
      },
      wrapSticker
    }
  } as unknown as BubbleContext;

  return {context, wrapSticker};
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dice appearance', () => {
  it('skips fade-in when rendering an already-settled result', () => {
    const {context, wrapSticker} = createContext(false);

    wrapDice(context);

    expect(wrapSticker.mock.calls[0][1].noFadeIn).toBe(true);
  });

  it('keeps fade-in when an unread dice will play', () => {
    const {context, wrapSticker} = createContext(true);

    wrapDice(context);

    expect(wrapSticker.mock.calls[0][1].noFadeIn).toBeUndefined();
  });

  it('skips fade-in for every part of an already-settled slot machine', () => {
    const {context, wrapSticker} = createContext(false, '🎰');

    wrapDice(context);

    expect(wrapSticker.mock.calls.length).toBeGreaterThan(1);
    expect(wrapSticker.mock.calls.every(([, options]) => options.noFadeIn === true)).toBe(true);
  });
});
