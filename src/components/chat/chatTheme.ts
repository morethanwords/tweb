import {unwrap} from 'solid-js/store';
import {ChatFull, ChatTheme, StarGift, Theme, UserFull, WallPaper, WallPaperSettings} from '@layer';
import {appState} from '@stores/appState';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import {cleanEmoji} from '@lib/richTextProcessor/fixEmoji';

/**
 * A chat theme made of a collectible gift, in the shape of a cloud theme so the chat background and
 * colours take it like any other. It keeps the gift for the background to draw its symbols.
 */
export type GiftTheme = Theme.theme & {giftTheme: ChatTheme.chatThemeUniqueGift};

// * the background tells themes apart by reference — one object per gift keeps it from redrawing
const giftThemes: Map<string, GiftTheme> = new Map();

export function getGiftChatThemeSlug(chatTheme: ChatTheme) {
  return chatTheme?._ === 'chatThemeUniqueGift' ? (chatTheme.gift as StarGift.starGiftUnique).slug : undefined;
}

/**
 * What tells chat themes apart: an emoticon, a gift, or '' for no theme. An emoticon is compared
 * without its variation selectors, as tdesktop finds it: the server names the theme it was given
 * as `⛄` by `⛄️` in the service message.
 */
export function getChatThemeKey(chatTheme: ChatTheme | undefined) {
  const slug = getGiftChatThemeSlug(chatTheme);
  if(slug) {
    return 'gift:' + slug;
  }

  const emoticon = (chatTheme as ChatTheme.chatTheme)?.emoticon;
  return emoticon ? cleanEmoji(emoticon) : '';
}

export function getThemeByEmoticon(emoticon: string) {
  if(!emoticon) {
    return;
  }

  const key = cleanEmoji(emoticon);
  return unwrap(appState.accountThemes.themes?.find((theme) => theme.emoticon && cleanEmoji(theme.emoticon) === key));
}

export function getThemeFromChatTheme(chatTheme: ChatTheme | undefined): Theme | undefined {
  const slug = getGiftChatThemeSlug(chatTheme);
  if(!slug) {
    return getThemeByEmoticon((chatTheme as ChatTheme.chatTheme)?.emoticon);
  }

  let theme = giftThemes.get(slug);
  if(!theme) {
    // * nothing to draw with: left to the chat's own background, and asked again next time
    if(!(chatTheme as ChatTheme.chatThemeUniqueGift).theme_settings?.length) {
      return;
    }

    // * a copy: the full peer store reconciles its theme in place once the chat takes another one
    const giftTheme = copy(unwrap(chatTheme as ChatTheme.chatThemeUniqueGift));
    theme = {
      _: 'theme',
      id: 'gift:' + slug,
      access_hash: '',
      slug: '',
      title: getCollectibleName(giftTheme.gift as StarGift.starGiftUnique),
      pFlags: {},
      settings: giftTheme.theme_settings,
      giftTheme
    };
    giftThemes.set(slug, theme);
  }

  return theme;
}

export function getGiftChatTheme(theme: unknown) {
  return (theme as GiftTheme)?.giftTheme;
}

// * one copy per wallpaper as it is set up: the background tells them apart by reference, and the
// * full peer store rewrites its own object in place when the same wallpaper comes with new settings
const wallPaperSnapshots: Map<string, WallPaper> = new Map();

/**
 * The chat's wallpaper as the background takes it. An image dimmed by its intensity is drawn
 * differently by day and by night, so with `isNight` it is a new one for each side of the day.
 */
function getWallPaperSnapshot(wallPaper: WallPaper, isNight?: boolean) {
  // * read through the store, so whoever asks follows changes of the settings too
  const settings = JSON.stringify(wallPaper.settings ?? null);
  const isDimmedImage = wallPaper._ === 'wallPaper' && !wallPaper.pFlags?.pattern && !!wallPaper.settings?.intensity;
  const key = wallPaper.id + settings + (isDimmedImage && isNight !== undefined ? (isNight ? ':night' : ':day') : '');
  let snapshot = wallPaperSnapshots.get(key);
  if(!snapshot) {
    wallPaperSnapshots.set(key, snapshot = copy(unwrap(wallPaper)));
  }

  return snapshot;
}

const NO_SETTINGS: WallPaperSettings = {_: 'wallPaperSettings', pFlags: {}};

/** The same wallpaper set up the same way, as tdesktop's `WallPaper::equals` tells them apart. */
export function isSameWallPaper(a: WallPaper, b: WallPaper) {
  return a._ === b._ &&
    String(a.id) === String(b.id) &&
    deepEqual(a.settings ?? NO_SETTINGS, b.settings ?? NO_SETTINGS, ['flags']);
}

/**
 * The background a chat shows for its full peer, as tdesktop draws it: a theme (by emoticon or a
 * gift) gives the colours and its own wallpaper, and a wallpaper set for the chat stands in for
 * that wallpaper. A wallpaper that only names a theme by its emoticon is that theme.
 */
export function getChatBackgroundFromFullPeer(
  fullPeer: UserFull | ChatFull | undefined,
  isNight?: boolean
): {theme?: Theme, wallPaper?: WallPaper} {
  if(!fullPeer) {
    return {};
  }

  const storeWallPaper = (fullPeer as ChatFull.channelFull).wallpaper;
  const wallPaper = storeWallPaper && getWallPaperSnapshot(storeWallPaper, isNight);
  const theme = getThemeFromChatTheme((fullPeer as UserFull.userFull).theme) ||
    getThemeByEmoticon((fullPeer as ChatFull.channelFull).theme_emoticon);
  const wallPaperTheme = getThemeByEmoticon(wallPaper?.settings?.emoticon);
  if(wallPaperTheme) {
    return {theme: theme || wallPaperTheme};
  }

  return {theme, wallPaper};
}
