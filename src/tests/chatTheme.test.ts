/*
 * A chat's theme: an emoticon theme or a collectible gift (layer `ChatTheme`). The background takes
 * a gift theme as a cloud theme, and the gift's pattern marks where the gift's symbol goes with a
 * hidden `<g id="GiftPatterns">` of rotated `<rect>`s (tdesktop `ParseGiftSymbols`).
 */
import {describe, expect, it} from 'vitest';
import {ChatTheme, StarGift, Theme, UserFull, WallPaper, WallPaperSettings} from '@layer';
import {chooseGiftSymbolIndex, parseGiftPatternSymbols} from '@components/chat/giftPatternSymbols';
import {getChatBackgroundFromFullPeer, getChatThemeKey, getGiftChatTheme, getThemeFromChatTheme, isSameWallPaper} from '@components/chat/chatTheme';
import {setAppStateSilent} from '@stores/appState';

// * two slots of a real gift theme pattern (1440×2960), and a rect outside the group
const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 2960">
  <g id="Back"><rect x="1" y="2" width="3" height="4"/></g>
  <g id="GiftPatterns" style="visibility:hidden">
    <rect x="297.7" y="193.92" width="124.34" height="124.34" transform="translate(-77.93 197.62) rotate(-27.83)" fill="#f0f"/>
    <rect x="720" y="1480" width="144" height="148" fill="#f0f"/>
  </g>
</svg>`;

describe('parseGiftPatternSymbols', () => {
  it('reads the slots of the gift group as fractions of the tile, with their turn', () => {
    const symbols = parseGiftPatternSymbols(SVG);
    expect(symbols).toHaveLength(2);

    expect(symbols[0].x).toBeCloseTo(297.7 / 1440);
    expect(symbols[0].y).toBeCloseTo(193.92 / 2960);
    expect(symbols[0].width).toBeCloseTo(124.34 / 1440);
    expect(symbols[0].height).toBeCloseTo(124.34 / 2960);
    expect(symbols[0].rotation).toBe(-27.83);

    expect(symbols[1]).toEqual({x: .5, y: .5, width: .1, height: .05, rotation: 0});
  });

  it('finds nothing in a pattern made for no gift', () => {
    expect(parseGiftPatternSymbols('<svg viewBox="0 0 10 10"><rect x="1" y="1" width="2" height="2"/></svg>')).toEqual([]);
    expect(parseGiftPatternSymbols('<svg><g id="GiftPatterns"><rect x="1" y="1" width="2" height="2"/></g></svg>')).toEqual([]);
  });
});

describe('chooseGiftSymbolIndex', () => {
  it('keeps the biggest slot nearest the middle for the gift itself', () => {
    const corner = {x: 0, y: 0, width: .3, height: .3, rotation: 0};
    const middleSmall = {x: .45, y: .45, width: .05, height: .05, rotation: 0};
    const middleBig = {x: .4, y: .4, width: .15, height: .15, rotation: 0};
    expect(chooseGiftSymbolIndex([corner, middleSmall, middleBig])).toBe(2);
    expect(chooseGiftSymbolIndex([])).toBe(-1);
  });
});

const wallPaper = (slug: string): WallPaper.wallPaper => ({
  _: 'wallPaper',
  id: slug,
  access_hash: 0,
  slug,
  pFlags: {pattern: true},
  document: undefined
});

const giftTheme = (slug: string): ChatTheme.chatThemeUniqueGift => ({
  _: 'chatThemeUniqueGift',
  gift: {
    _: 'starGiftUnique',
    pFlags: {theme_available: true},
    id: slug,
    gift_id: 1,
    title: 'Cake',
    slug,
    num: 162820,
    attributes: [],
    availability_issued: 1,
    availability_total: 1
  } as StarGift.starGiftUnique,
  theme_settings: [{
    _: 'themeSettings',
    pFlags: {},
    base_theme: {_: 'baseThemeClassic'},
    accent_color: 0x598591,
    wallpaper: wallPaper(slug + '-paper')
  }]
});

const accountTheme = (emoticon: string): Theme.theme => ({
  _: 'theme',
  id: emoticon,
  access_hash: 0,
  slug: emoticon,
  title: '0',
  emoticon,
  pFlags: {default: true},
  settings: []
});

describe('chat theme helpers', () => {
  setAppStateSilent('accountThemes', {_: 'account.themes', hash: 0, themes: [accountTheme('🎄'), accountTheme('⛄')]});

  it('tells chat themes apart by emoticon or gift', () => {
    expect(getChatThemeKey(undefined)).toBe('');
    expect(getChatThemeKey({_: 'chatTheme', emoticon: ''})).toBe('');
    expect(getChatThemeKey({_: 'chatTheme', emoticon: '🎄'})).toBe('🎄');
    expect(getChatThemeKey(giftTheme('Cake-1'))).toBe('gift:Cake-1');
  });

  it('takes an emoticon with a variation selector for the theme without one', () => {
    // * set as the account theme names it, the service message names it with U+FE0F
    const fromServer: ChatTheme.chatTheme = {_: 'chatTheme', emoticon: '\u26c4\ufe0f'};
    expect(getChatThemeKey(fromServer)).toBe(getChatThemeKey({_: 'chatTheme', emoticon: '\u26c4'}));
    expect(getThemeFromChatTheme(fromServer)).toEqual(accountTheme('\u26c4'));
  });

  it('gives one cloud-shaped theme per gift, named after the collectible', () => {
    const theme = getThemeFromChatTheme(giftTheme('Cake-2'));
    expect(theme).toBe(getThemeFromChatTheme(giftTheme('Cake-2')));
    expect(theme.title).toBe('Cake #162,820');
    expect(theme.settings[0].accent_color).toBe(0x598591);
    expect(getGiftChatTheme(theme).gift).toMatchObject({slug: 'Cake-2'});
    expect(getGiftChatTheme(accountTheme('🎄'))).toBeUndefined();

    // * a gift handed over without its settings draws nothing, and is not remembered that way
    expect(getThemeFromChatTheme({...giftTheme('Cake-5'), theme_settings: []})).toBeUndefined();
    expect(getThemeFromChatTheme(giftTheme('Cake-5')).settings).toHaveLength(1);
  });

  it('keeps a gift theme whole when the full peer takes another theme in place', () => {
    const source: Record<string, any> = giftTheme('Cake-3');
    const theme = getThemeFromChatTheme(source as ChatTheme);
    // * what the app's full peer store does on reconcile: the same object rewritten into the next theme
    delete source.gift;
    delete source.theme_settings;
    Object.assign(source, {_: 'chatTheme', emoticon: '🎄'});

    expect(getGiftChatTheme(theme)?.gift).toMatchObject({slug: 'Cake-3'});
    expect(theme.settings).toHaveLength(1);
    expect(theme).toBe(getThemeFromChatTheme(giftTheme('Cake-3')));
  });

  it('lays the chat\'s wallpaper over its theme, which keeps the colours', () => {
    const paper = wallPaper('own');
    expect(getChatBackgroundFromFullPeer({theme: {_: 'chatTheme', emoticon: '🎄'}} as UserFull.userFull)).toEqual({theme: accountTheme('🎄')});
    expect(getChatBackgroundFromFullPeer({theme: {_: 'chatTheme', emoticon: '🎄'}, wallpaper: paper} as UserFull.userFull))
    .toEqual({theme: accountTheme('🎄'), wallPaper: paper});

    const gift = getChatBackgroundFromFullPeer({theme: giftTheme('Cake-4'), wallpaper: paper} as UserFull.userFull);
    expect(getGiftChatTheme(gift.theme)?.gift).toMatchObject({slug: 'Cake-4'});
    expect(gift.wallPaper).toEqual(paper);

    expect(getChatBackgroundFromFullPeer({wallpaper: paper} as UserFull.userFull)).toEqual({wallPaper: paper});
    // * an emoticon nobody knows leaves the wallpaper alone
    expect(getChatBackgroundFromFullPeer({theme: {_: 'chatTheme', emoticon: '🦄'}, wallpaper: paper} as UserFull.userFull)).toEqual({wallPaper: paper});
    expect(getChatBackgroundFromFullPeer(undefined)).toEqual({});
  });

  it('hands the background one copy per wallpaper as it is set up', () => {
    const background = (fullPeer: object, isNight?: boolean) => getChatBackgroundFromFullPeer(fullPeer as UserFull.userFull, isNight).wallPaper;
    const source: WallPaper.wallPaper = {...wallPaper('snapshot'), settings: {_: 'wallPaperSettings', pFlags: {}, intensity: 50}};
    const first = background({wallpaper: source});
    expect(first).not.toBe(source);
    expect(first).toEqual(source);
    expect(background({wallpaper: source})).toBe(first);

    // * what the full peer store does when the same wallpaper comes with other settings: rewrites it in place
    source.settings.intensity = 30;
    const second = background({wallpaper: source});
    expect(second).not.toBe(first);
    expect(second.settings.intensity).toBe(30);
    expect(first.settings.intensity).toBe(50);

    // * a pattern is drawn the same by day and by night
    expect(background({wallpaper: source}, true)).toBe(background({wallpaper: source}, false));

    // * an image is dimmed by night only
    const image: WallPaper.wallPaper = {...source, id: 'snapshot-image', slug: 'snapshot-image', pFlags: {}};
    const night = background({wallpaper: image}, true);
    expect(night).not.toBe(background({wallpaper: image}, false));
    expect(background({wallpaper: image}, true)).toBe(night);
  });

  it('tells a wallpaper set up the same way from one set up otherwise', () => {
    const settings = (extra: object = {}): WallPaperSettings => ({_: 'wallPaperSettings', pFlags: {}, ...extra});
    const paper = wallPaper('same');
    expect(isSameWallPaper(paper, {...paper, settings: settings()})).toBe(true);
    expect(isSameWallPaper({...paper, settings: settings({intensity: 40, flags: 8})}, {...paper, settings: settings({intensity: 40})})).toBe(true);
    expect(isSameWallPaper({...paper, settings: settings({intensity: 40})}, {...paper, settings: settings({intensity: 50})})).toBe(false);
    expect(isSameWallPaper(paper, {...paper, settings: settings({pFlags: {blur: true}})})).toBe(false);
    expect(isSameWallPaper(paper, wallPaper('other'))).toBe(false);

    // * gradients have no id of their own: their colours tell them apart
    const gradient = (color: number): WallPaper.wallPaperNoFile => ({_: 'wallPaperNoFile', id: 0, pFlags: {}, settings: settings({background_color: color})});
    expect(isSameWallPaper(gradient(1), gradient(1))).toBe(true);
    expect(isSameWallPaper(gradient(1), gradient(2))).toBe(false);
  });

  it('takes a wallpaper that only names a theme by its emoticon for that theme', () => {
    const named: WallPaper.wallPaperNoFile = {
      _: 'wallPaperNoFile',
      id: 0,
      pFlags: {},
      settings: {_: 'wallPaperSettings', pFlags: {}, emoticon: '🎄'}
    };
    expect(getChatBackgroundFromFullPeer({_: 'channelFull', wallpaper: named} as any)).toEqual({theme: accountTheme('🎄')});
  });
});
