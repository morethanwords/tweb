import {describe, expect, it} from 'vitest';
import type {ShareTheme, ShareThemeBackdropOption} from '@layer';
import {getDefaultBackdrop, MAX_THEME_EMOJI, shareThemeToAppearance, themeEmojiKey} from '@components/popups/myQrCode/theme';
import {layoutCaption} from '@components/popups/myQrCode/caption';
import {EMOJI_PERIOD, emojiNodes, modelNodes, symbolNodes} from '@components/popups/myQrCode/fieldNodes';

const option = (backdrop_id: number, name: string): ShareThemeBackdropOption => ({
  _: 'shareThemeBackdropOption',
  backdrop_id,
  name,
  center_color: 0x111111 * backdrop_id,
  edge_color: 0x0A0A0A * backdrop_id,
  pattern_color: 0x050505,
  text_color: 0xEEEEEE
});

const BACKDROPS = [option(1, 'Black'), option(2, 'Emerald'), option(3, 'Neon Blue')];

describe('myQrCode theme', () => {
  it('shows the default for a peer with no theme, or before its full peer is there', () => {
    expect(shareThemeToAppearance(undefined, BACKDROPS)).toMatchObject({kind: 'default', backdropId: 1, emojis: []});
    expect(shareThemeToAppearance({_: 'shareThemeDefault'}, BACKDROPS).backdrop.name).toBe('Black');
  });

  it('falls back to the built-in look while the list has not come', () => {
    const appearance = shareThemeToAppearance({_: 'shareThemeDefault'});
    expect(appearance.kind).toBe('default');
    expect(appearance.backdrop).toEqual(getDefaultBackdrop());
    expect(appearance.backdrop.center_color).toBe(0x363738);
  });

  it('reads a backdrop alone as a colour', () => {
    const theme: ShareTheme = {_: 'shareThemeEmojiBackdrop', backdrop_id: 2};
    expect(shareThemeToAppearance(theme, BACKDROPS)).toMatchObject({kind: 'color', backdropId: 2, emojis: []});
    expect(shareThemeToAppearance(theme, BACKDROPS).backdrop.name).toBe('Emerald');
  });

  it('reads emoji alone, on the default backdrop', () => {
    const theme: ShareTheme = {_: 'shareThemeEmojiBackdrop', emojis: [{_: 'reactionEmoji', emoticon: 'fire'}, {_: 'reactionCustomEmoji', document_id: '5'}]};
    const appearance = shareThemeToAppearance(theme, BACKDROPS);
    expect(appearance.kind).toBe('emoji');
    expect(appearance.backdrop.name).toBe('Black');
    expect(appearance.emojis.map(themeEmojiKey)).toEqual(['fire', 'c:5']);
  });

  it('reads a backdrop with emoji', () => {
    const theme: ShareTheme = {_: 'shareThemeEmojiBackdrop', backdrop_id: 3, emojis: [{_: 'reactionEmoji', emoticon: 'wave'}]};
    expect(shareThemeToAppearance(theme, BACKDROPS)).toMatchObject({kind: 'emoji', backdropId: 3});
  });

  it('reads a served id naming the default backdrop as the default circle', () => {
    expect(shareThemeToAppearance({_: 'shareThemeEmojiBackdrop', backdrop_id: 1}, BACKDROPS).kind).toBe('default');
  });

  it('shows the default for an id the list does not have, and for an id before the list', () => {
    expect(shareThemeToAppearance({_: 'shareThemeEmojiBackdrop', backdrop_id: 99}, BACKDROPS).kind).toBe('default');
    expect(shareThemeToAppearance({_: 'shareThemeEmojiBackdrop', backdrop_id: 2}).kind).toBe('default');
  });

  it('keeps at most six emoji', () => {
    const emojis = '123456789'.split('').map((emoticon) => ({_: 'reactionEmoji' as const, emoticon}));
    expect(shareThemeToAppearance({_: 'shareThemeEmojiBackdrop', emojis}, BACKDROPS).emojis).toHaveLength(MAX_THEME_EMOJI);
  });

  it('takes the colours of a gift from the gift', () => {
    const theme = {
      _: 'shareThemeGift',
      stargift: {
        _: 'starGiftUnique',
        id: '7',
        attributes: [
          {_: 'starGiftAttributeModel', name: 'm', document: {id: '1'}},
          {_: 'starGiftAttributePattern', name: 'p', document: {id: '2'}},
          {_: 'starGiftAttributeBackdrop', name: 'Neon Blue', backdrop_id: 3, center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4}
        ]
      }
    } as unknown as ShareTheme;
    const appearance = shareThemeToAppearance(theme, BACKDROPS);
    expect(appearance.kind).toBe('gift');
    expect(appearance.backdrop).toEqual({center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4});
    // a gift never gets the palette's tuned look, which goes by name
    expect(appearance.backdrop.name).toBeUndefined();
    expect(appearance.giftArt).toEqual({model: {id: '1'}, pattern: {id: '2'}});
  });

  it('shows the default for a gift it cannot read', () => {
    const theme = {_: 'inputShareThemeGift', stargift: {_: 'inputSavedStarGiftSlug', slug: 'a'}} as ShareTheme;
    expect(shareThemeToAppearance(theme, BACKDROPS).kind).toBe('default');
    expect(shareThemeToAppearance({_: 'shareThemeGift', stargift: {_: 'starGift'}} as ShareTheme, BACKDROPS).kind).toBe('default');
  });
});

describe('myQrCode caption', () => {
  const measure = (text: string, size: number) => text.length * size * 0.5;
  const fonts = [30, 25, 19];

  it('takes the largest size that fits one line', () => {
    expect(layoutCaption('@ABC', 250, fonts, measure)).toEqual({fontSize: 30, lines: ['@ABC']});
    expect(layoutCaption('@ABCDEFGHIJKLMNOP', 250, fonts, measure)).toEqual({fontSize: 25, lines: ['@ABCDEFGHIJKLMNOP']});
  });

  it('wraps at the smallest size, in lines of an even width', () => {
    const {fontSize, lines} = layoutCaption('FIRST SECOND THIRD FOURTH', 150, fonts, measure);
    expect(fontSize).toBe(19);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((line) => measure(line, 19) <= 150)).toBe(true);
  });

  it('ends a caption that is too long with an ellipsis, in no more than three lines', () => {
    const {lines} = layoutCaption('A'.repeat(200), 150, fonts, measure);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
    expect(lines.every((line) => measure(line, 19) <= 150)).toBe(true);
  });
});

describe('myQrCode field', () => {
  it('is the same every time', () => {
    expect(emojiNodes(1000, 900, 3)).toEqual(emojiNodes(1000, 900, 3));
  });

  it('repeats by its period, so that a shift by it shows the same picture', () => {
    const nodes = emojiNodes(1400, 1300, 3);
    const key = (node: {x: number, y: number, size: number, index: number}) => [Math.round(node.x * 100), Math.round(node.y * 100), node.size.toFixed(3), node.index].join();
    const have = new Set(nodes.map(key));
    let compared = 0;
    for(const node of nodes) {
      if(node.x + EMOJI_PERIOD.width > 1300 || node.y + EMOJI_PERIOD.height > 1200 || node.x < 100 || node.y < 100) continue;
      ++compared;
      expect(have.has(key({...node, x: node.x + EMOJI_PERIOD.width}))).toBe(true);
      expect(have.has(key({...node, y: node.y + EMOJI_PERIOD.height}))).toBe(true);
    }

    expect(compared).toBeGreaterThan(10);
    expect(new Set(nodes.map((node) => node.index))).toEqual(new Set([0, 1, 2]));
    expect(emojiNodes(1000, 900, 0)).toEqual([]);
  });

  it('keeps the symbols off the models', () => {
    const models = modelNodes(1300, 1300);
    expect(models.length).toBeGreaterThan(0);
    for(const symbol of symbolNodes(1300, 1300, models)) {
      for(const model of models) {
        expect(Math.hypot(model.x - symbol.x, model.y - symbol.y)).toBeGreaterThan(model.size * 0.33);
      }
    }
  });
});
