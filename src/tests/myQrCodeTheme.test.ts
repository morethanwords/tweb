import {describe, expect, it} from 'vitest';
import type {ShareTheme, ShareThemeBackdropOption} from '@layer';
import {getDefaultBackdrop, MAX_THEME_EMOJI, shareThemeToAppearance, themeEmojiKey} from '@components/popups/myQrCode/theme';
import {layoutCaption} from '@components/popups/myQrCode/caption';
import {EmojiFieldFrame, modelNodes, PlacedEmoji, placeEmojiField, symbolNodes} from '@components/popups/myQrCode/fieldNodes';

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
  const frame: EmojiFieldFrame = {width: 375, height: 750, x: 0, y: 0, time: 0, focusX: 187.5, focusY: 300, count: 3};
  const place = (overrides: Partial<EmojiFieldFrame> = {}) => {
    const placed: PlacedEmoji[] = [];
    placeEmojiField({...frame, ...overrides}, (emoji) => placed.push({...emoji}));
    return placed;
  };

  it('is the same every time', () => {
    expect(place({x: 40, y: -90, time: 12.5})).toEqual(place({x: 40, y: -90, time: 12.5}));
  });

  it('keeps every copy on the surface, and gives every emoji its turn', () => {
    const placed = place({x: -61, y: 23, time: 4});
    expect(placed.length).toBeGreaterThan(20);
    for(const emoji of placed) {
      expect(emoji.x).toBeGreaterThanOrEqual(0);
      expect(emoji.x).toBeLessThanOrEqual(frame.width);
      expect(emoji.y).toBeGreaterThanOrEqual(0);
      expect(emoji.y).toBeLessThanOrEqual(frame.height);
      expect(emoji.alpha).toBeGreaterThan(0);
      expect(emoji.alpha).toBeLessThanOrEqual(1);
      expect(emoji.size).toBeGreaterThan(0);
    }

    expect(new Set(placed.map((emoji) => emoji.index))).toEqual(new Set([0, 1, 2]));
    expect(place({count: 0})).toEqual([]);
  });

  it('leaves no node of the lattice empty', () => {
    const placed = place();
    // away from the edges (past the 90 px where they are pressed), every node (86 x 70, odd rows a half cell along,
    // from the middle) has its copy within its orbit (10 px) and bob (3 px)
    let nodes = 0;
    for(let row = -3; row <= 3; ++row) {
      for(let col = -2; col <= 2; ++col) {
        const x = frame.width / 2 + col * 86 + ((row & 1) ? 43 : 0), y = frame.height / 2 + row * 70;
        if(x < 100 || x > frame.width - 100) continue;
        ++nodes;
        expect(placed.some((emoji) => Math.hypot(emoji.x - x, emoji.y - y) <= 14)).toBe(true);
      }
    }

    expect(nodes).toBeGreaterThan(15);
  });

  it('makes the copies smaller towards the edges', () => {
    const placed = place();
    const average = (list: PlacedEmoji[]) => list.reduce((sum, emoji) => sum + emoji.size, 0) / list.length;
    const nearEdge = placed.filter((emoji) => Math.min(emoji.x, frame.width - emoji.x, emoji.y, frame.height - emoji.y) < 40);
    const inside = placed.filter((emoji) => Math.min(emoji.x, frame.width - emoji.x, emoji.y, frame.height - emoji.y) > 120);
    expect(nearEdge.length).toBeGreaterThan(0);
    expect(inside.length).toBeGreaterThan(0);
    expect(average(nearEdge)).toBeLessThan(average(inside) * 0.75);
  });

  it('has no period: the field moved by six cells is not the same picture', () => {
    const key = (list: PlacedEmoji[]) => list.map((emoji) => `${Math.round(emoji.x)},${Math.round(emoji.y)},${emoji.index}`).sort().join(' ');
    expect(key(place({x: 6 * 86}))).not.toEqual(key(place()));
    expect(key(place({y: 6 * 70}))).not.toEqual(key(place()));
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

describe('the built-in colours (Android\'s table)', () => {
  it('stand in for a served list that has not come or lacks the default', async() => {
    const {BUILT_IN_BACKDROPS, usableBackdrops} = await import('@components/popups/myQrCode/backdropTable');
    expect(BUILT_IN_BACKDROPS).toHaveLength(80);
    expect(BUILT_IN_BACKDROPS[0].name).toBe('Black');
    expect(BUILT_IN_BACKDROPS.every((option) => option.backdrop_id < 0)).toBe(true);
    expect(usableBackdrops(undefined)).toBe(BUILT_IN_BACKDROPS);
    const served = [{_: 'shareThemeBackdropOption' as const, backdrop_id: 7, name: 'Emerald', center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4}];
    expect(usableBackdrops(served)).toBe(BUILT_IN_BACKDROPS);
    const withDefault = [...served, {...served[0], backdrop_id: 8, name: 'Black'}];
    expect(usableBackdrops(withDefault)).toBe(withDefault);
  });

  it('a built-in colour stays itself against the served list until it is saved, and is never sent', async() => {
    const {BUILT_IN_BACKDROPS} = await import('@components/popups/myQrCode/backdropTable');
    const {shareThemeToAppearance, waitsForServedId} = await import('@components/popups/myQrCode/theme');
    const emerald = BUILT_IN_BACKDROPS.find((option) => option.name === 'Emerald');
    const served = [{_: 'shareThemeBackdropOption' as const, backdrop_id: 8, name: 'Black', center_color: 1, edge_color: 2, pattern_color: 3, text_color: 4}];
    const appearance = shareThemeToAppearance({_: 'shareThemeEmojiBackdrop', backdrop_id: emerald.backdrop_id}, served);
    expect(appearance.backdrop.name).toBe('Emerald');
    expect(appearance.backdropId).toBe(emerald.backdrop_id);
    expect(waitsForServedId(appearance)).toBe(true);
    expect(waitsForServedId(shareThemeToAppearance(undefined, BUILT_IN_BACKDROPS))).toBe(false);
  });
});

describe('the free pill burning down (iOS\'s QrStudioBurn)', async() => {
  const {burnCut, burnFront, burnLevel, burnParticles, burnRestart, REFILL} = await import('@components/popups/myQrCode/pillBurn');
  const state = burnRestart(undefined, 100, 160);

  it('pours in, then burns back with the minute', () => {
    expect(burnLevel(state, 100)).toBe(0);
    // the minute runs from the start of the pour
    expect(burnLevel(state, 100 + REFILL)).toBeCloseTo(1 - REFILL / 60, 5);
    expect(burnLevel(state, 130)).toBeCloseTo(0.5, 5);
    expect(burnLevel(state, 160)).toBe(0);
    // a fill with no timer pours in and stays
    const kept = burnRestart(state, 130, Infinity);
    expect(burnLevel(kept, 130)).toBeCloseTo(0.5, 5);
    expect(burnLevel(kept, 200)).toBe(1);
  });

  it('covers nothing, all, or up to a front of its own', () => {
    expect(burnCut(0, 160, 36, 1, 0)).toBeUndefined();
    const kept = burnRestart(undefined, 100, Infinity);
    expect(burnCut(burnFront(kept, 160, 101), 160, 36, 101, 0)).toBe(true);
    const cut = burnCut(80, 160, 36, 120, 0) as [number, number][];
    const front = cut.slice(1, -1).map(([x]) => x);
    expect(Math.min(...front)).toBeGreaterThan(80 - 4.01);
    expect(Math.max(...front)).toBeLessThanOrEqual(80);
  });

  it('sends sparks off the burning front only, the same for the same moment', () => {
    expect(burnParticles(burnRestart(undefined, 100, Infinity), 160, 36, 120)).toEqual([]);
    const particles = burnParticles(state, 160, 36, 130);
    expect(particles.length).toBeGreaterThan(20);
    expect(particles).toEqual(burnParticles(state, 160, 36, 130));
    // born at the front (half way, ~85 px) and drifting on and up from it
    const front = burnFront(state, 160, 130);
    expect(particles.every((particle) => particle.x > front - 10 && particle.y < 36 + 10)).toBe(true);
  });

  it('fizzes on the front and trails off it as Android\'s sparks: on and up, fading with the way, few of them glowing', () => {
    const particles = burnParticles(state, 160, 36, 130);
    const front = burnFront(state, 160, 130);
    const sparks = particles.filter((particle) => !particle.halo);
    const mean = (list: typeof sparks) => list.reduce((sum, particle) => sum + particle.alpha, 0) / list.length;
    const near = sparks.filter((particle) => particle.x < front + 6), far = sparks.filter((particle) => particle.x > front + 30);
    expect(near.length).toBeGreaterThan(10);
    expect(far.length).toBeGreaterThan(5);
    expect(mean(near)).toBeGreaterThan(mean(far) * 1.5);
    expect(sparks.reduce((sum, particle) => sum + particle.vx, 0)).toBeGreaterThan(0);
    expect(sparks.reduce((sum, particle) => sum + particle.vy, 0)).toBeLessThan(0);
    // the glow of a flying spark (the spots on the front stand still) is for one in a few
    const glows = particles.filter((particle) => particle.halo && (particle.vx || particle.vy));
    expect(glows.length).toBeLessThan(sparks.length / 4);
  });
});
