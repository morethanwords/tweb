import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {StarGift} from '@layer';
import {appearanceToShareTheme, giftToInput, shareThemeToAppearance, withBackdrop, withEmojiToggled, withGift} from '@components/popups/myQrCode/theme';
import {clearHeldThemes, createThemeSaver, getHeldTheme} from '@components/popups/myQrCode/themeSaver';

const BACKDROPS = [
  {_: 'shareThemeBackdropOption' as const, backdrop_id: 1, name: 'Black', center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4},
  {_: 'shareThemeBackdropOption' as const, backdrop_id: 2, name: 'Emerald', center_color: 5, edge_color: 6, pattern_color: 7, text_color: 8}
];
const gift = {
  _: 'starGiftUnique', slug: 'abc-1', id: '9',
  attributes: [{_: 'starGiftAttributeBackdrop', center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4}]
} as unknown as StarGift.starGiftUnique;

describe('myQrCode theme edits', () => {
  const base = shareThemeToAppearance(undefined, BACKDROPS);

  it('sends the default for nothing chosen, and no backdrop id for the default circle', () => {
    expect(appearanceToShareTheme(base).theme).toEqual({_: 'shareThemeDefault'});
    const withEmoji = withEmojiToggled(base, {documentId: '5' as DocId}, base);
    expect(appearanceToShareTheme(withEmoji).theme).toEqual({_: 'shareThemeEmojiBackdrop', emojis: [{_: 'reactionCustomEmoji', document_id: '5'}]});
  });

  it('sends a picked colour, and keeps six emoji at most, dropping the oldest', () => {
    let a = withBackdrop(base, BACKDROPS, BACKDROPS[1]);
    expect(appearanceToShareTheme(a).theme).toEqual({_: 'shareThemeEmojiBackdrop', backdrop_id: 2});
    for(let i = 1; i <= 7; ++i) a = withEmojiToggled(a, {documentId: ('' + i) as DocId}, base);
    expect(a.emojis.map((e) => e.documentId)).toEqual(['2', '3', '4', '5', '6', '7']);
    expect(withEmojiToggled(a, {documentId: '7' as DocId}, base).emojis.length).toBe(5);
  });

  it('a gift clears the emoji and a colour clears the gift', () => {
    const g = withGift(gift);
    expect(appearanceToShareTheme(g)).toBeUndefined();
    const saved = appearanceToShareTheme(g, {_: 'inputSavedStarGiftSlug', slug: 'abc-1'});
    expect(saved.theme._).toBe('inputShareThemeGift');
    expect(saved.shown._).toBe('shareThemeGift');
    expect(withEmojiToggled(g, {documentId: '1' as DocId}, base).kind).toBe('emoji');
    expect(withBackdrop(g, BACKDROPS, BACKDROPS[1]).kind).toBe('color');
  });

  it('names a gift by slug for self and by the chat input for a chat', () => {
    expect(giftToInput(gift, true)).toEqual({_: 'inputSavedStarGiftSlug', slug: 'abc-1'});
    expect(giftToInput(gift, false)).toBeUndefined();
    const chat = {_: 'inputSavedStarGiftChat', peer: {_: 'inputPeerSelf'}, saved_id: '1'} as any;
    expect(giftToInput(gift, false, chat)).toBe(chat);
  });
});

describe('myQrCode theme saver', () => {
  beforeEach(() => { vi.useFakeTimers(); clearHeldThemes(); });
  afterEach(() => vi.useRealTimers());
  const theme = (n: number) => ({theme: {_: 'shareThemeEmojiBackdrop' as const, backdrop_id: n}, shown: {_: 'shareThemeEmojiBackdrop' as const, backdrop_id: n}});

  it('sends the last choice 700 ms after it, replacing the earlier ones', async() => {
    const save = vi.fn().mockResolvedValue(true);
    const saver = createThemeSaver({account: 1, peerId: 5 as PeerId, save, onError: vi.fn()});
    saver.schedule(theme(1));
    vi.advanceTimersByTime(500);
    saver.schedule(theme(2));
    vi.advanceTimersByTime(699);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual(theme(2));
  });

  it('flushes what waits, and holds the theme for 10 s after the save', async() => {
    const save = vi.fn().mockResolvedValue(true);
    const saver = createThemeSaver({account: 1, peerId: 5 as PeerId, save, onError: vi.fn()});
    saver.schedule(theme(3));
    expect(getHeldTheme(1, 5 as PeerId)).toEqual(theme(3).shown);
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(700);
    expect(save).toHaveBeenCalledTimes(1);
    expect(getHeldTheme(1, 5 as PeerId)).toBeDefined();
    vi.setSystemTime(Date.now() + 10_001);
    expect(getHeldTheme(1, 5 as PeerId)).toBeUndefined();
  });

  it('holds a choice that waits for what to send, and sends it unless a newer one, even on a later screen, came first', async() => {
    const save = vi.fn().mockResolvedValue(true);
    const waiting = {_: 'shareThemeEmojiBackdrop' as const, backdrop_id: -5};
    let ready: (save: ReturnType<typeof theme>) => void;
    const first = createThemeSaver({account: 1, peerId: 5 as PeerId, save, onError: vi.fn()});
    const sent = first.sendWhenReady(waiting, new Promise((resolve) => ready = resolve));
    expect(getHeldTheme(1, 5 as PeerId)).toBe(waiting);
    ready(theme(6));
    await sent;
    expect(save).toHaveBeenCalledWith(theme(6));
    expect(getHeldTheme(1, 5 as PeerId)).toEqual(theme(6).shown);

    const later = createThemeSaver({account: 1, peerId: 5 as PeerId, save, onError: vi.fn()});
    const outdated = first.sendWhenReady(waiting, new Promise((resolve) => ready = resolve));
    later.schedule(theme(7));
    ready(theme(8));
    await outdated;
    expect(save).not.toHaveBeenCalledWith(theme(8));
    expect(getHeldTheme(1, 5 as PeerId)).toEqual(theme(7).shown);
  });

  it('lets go of a waiting choice when there is nothing to send for it', async() => {
    const saver = createThemeSaver({account: 1, peerId: 5 as PeerId, save: vi.fn(), onError: vi.fn()});
    await saver.sendWhenReady({_: 'shareThemeEmojiBackdrop', backdrop_id: -5}, Promise.reject(new Error('no list')));
    expect(getHeldTheme(1, 5 as PeerId)).toBeUndefined();
  });

  it('lets go of the held theme on a failure', async() => {
    const onError = vi.fn();
    const saver = createThemeSaver({account: 1, peerId: 5 as PeerId, save: () => Promise.reject(new Error('x')), onError});
    saver.schedule(theme(4));
    await saver.flush();
    expect(onError).toHaveBeenCalled();
    expect(getHeldTheme(1, 5 as PeerId)).toBeUndefined();
  });
});
