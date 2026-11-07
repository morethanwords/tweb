import type {InputSavedStarGift, Reaction, ShareTheme, ShareThemeBackdropOption, StarGift, StarGiftAttribute} from '@layer';
import {BackdropInput, DEFAULT_BACKDROP, DEFAULT_BACKDROP_NAME} from './colors';
import {BUILT_IN_BACKDROPS, isBuiltInBackdropId} from './backdropTable';

/**
 * What a share theme looks like, apart from how it is drawn. Pure: the screen reads the served `ShareTheme` and the
 * list of backdrops through here, so a test needs no DOM.
 */

/** The most emoji a theme holds (`QrShareView.MAX_EMOJI`) */
export const MAX_THEME_EMOJI = 6;

export type ThemeKind = 'default' | 'color' | 'emoji' | 'gift';

export type ThemeEmoji = {
  /** A plain emoji */
  emoticon?: string,
  /** A custom one */
  documentId?: DocId
};

export type GiftArt = {
  /** The model's sticker, floating on the backdrop */
  model?: StarGiftAttribute.starGiftAttributeModel['document'],
  /** The symbol the backdrop is patterned with */
  pattern?: StarGiftAttribute.starGiftAttributePattern['document']
};

export type Appearance = {
  kind: ThemeKind,
  backdrop: BackdropInput,
  /** The server's id of the backdrop, when one is picked */
  backdropId?: number,
  emojis: ThemeEmoji[],
  gift?: StarGift.starGiftUnique,
  giftArt?: GiftArt
};

export function reactionToThemeEmoji(reaction: Reaction): ThemeEmoji | undefined {
  if(reaction._ === 'reactionEmoji') return {emoticon: reaction.emoticon};
  if(reaction._ === 'reactionCustomEmoji') return {documentId: reaction.document_id as DocId};
}

export const themeEmojiKey = (emoji: ThemeEmoji) => emoji.documentId ? 'c:' + emoji.documentId : emoji.emoticon;

/** The backdrop a theme without one wears: the served one named like the default, else the built-in look */
export function getDefaultBackdrop(backdrops?: ShareThemeBackdropOption[]): BackdropInput {
  return backdrops?.find((backdrop) => backdrop.name === DEFAULT_BACKDROP_NAME) || {...DEFAULT_BACKDROP, name: DEFAULT_BACKDROP_NAME};
}

function defaultAppearance(backdrops?: ShareThemeBackdropOption[]): Appearance {
  const backdrop = getDefaultBackdrop(backdrops);
  return {
    kind: 'default',
    backdrop,
    backdropId: (backdrop as ShareThemeBackdropOption).backdrop_id,
    emojis: []
  };
}

/**
 * @param theme the one the full peer holds; `undefined` while the full peer is not there
 * @param backdrops the served colours; `undefined` until they come, and then a theme naming one shows as the default
 */
export function shareThemeToAppearance(theme: ShareTheme | undefined, backdrops?: ShareThemeBackdropOption[]): Appearance {
  switch(theme?._) {
    case 'shareThemeEmojiBackdrop': {
      const emojis = (theme.emojis || []).map(reactionToThemeEmoji).filter(Boolean).slice(0, MAX_THEME_EMOJI);
      // a colour of the built-in table, picked before the served list came, stays itself until it is saved by its id
      const id = theme.backdrop_id;
      const backdrop = id === undefined ? undefined :
        backdrops?.find((option) => option.backdrop_id === id) ??
        (isBuiltInBackdropId(id) ? BUILT_IN_BACKDROPS.find((option) => option.backdrop_id === id) : undefined);
      // the default circle sends no id, and a served id naming the default backdrop reads as that circle
      const isDefault = !backdrop || backdrop.name === DEFAULT_BACKDROP_NAME;
      if(isDefault) {
        return {...defaultAppearance(backdrops), kind: emojis.length ? 'emoji' : 'default', emojis};
      }

      return {kind: emojis.length ? 'emoji' : 'color', backdrop, backdropId: backdrop.backdrop_id, emojis};
    }

    case 'shareThemeGift': {
      const gift = theme.stargift;
      if(gift._ !== 'starGiftUnique') break;

      const backdrop = gift.attributes.find((attribute) => attribute._ === 'starGiftAttributeBackdrop') as StarGiftAttribute.starGiftAttributeBackdrop;
      if(!backdrop) break;

      const model = gift.attributes.find((attribute) => attribute._ === 'starGiftAttributeModel') as StarGiftAttribute.starGiftAttributeModel;
      const pattern = gift.attributes.find((attribute) => attribute._ === 'starGiftAttributePattern') as StarGiftAttribute.starGiftAttributePattern;
      return {
        kind: 'gift',
        // a gift's backdrop is never the tuned one: only the palette's own is
        backdrop: {
          center_color: backdrop.center_color,
          edge_color: backdrop.edge_color,
          pattern_color: backdrop.pattern_color,
          text_color: backdrop.text_color
        },
        emojis: [],
        gift,
        giftArt: {model: model?.document, pattern: pattern?.document}
      };
    }
  }

  return defaultAppearance(backdrops);
}

/* Editing: what a pick makes of the theme on show, and what is sent for it */

export const isDefaultBackdrop = (backdrop: BackdropInput) => backdrop.name === DEFAULT_BACKDROP_NAME;

/** A colour of the built-in table has no server id to be sent by: it waits for the served list (`backdropWaitsForIds`) */
export const waitsForServedId = (appearance: Appearance) => {
  return appearance.kind !== 'gift' && !isDefaultBackdrop(appearance.backdrop) && isBuiltInBackdropId(appearance.backdropId);
};

/** A colour picked: `undefined` is the default circle. A gift gives way to it, the emoji stay. */
export function withBackdrop(appearance: Appearance, backdrops: ShareThemeBackdropOption[] | undefined, option?: ShareThemeBackdropOption): Appearance {
  const backdrop = option && !isDefaultBackdrop(option) ? option : getDefaultBackdrop(backdrops);
  const isDefault = isDefaultBackdrop(backdrop);
  const emojis = appearance.kind === 'gift' ? [] : appearance.emojis;
  return {
    kind: emojis.length ? 'emoji' : isDefault ? 'default' : 'color',
    backdrop,
    backdropId: (backdrop as ShareThemeBackdropOption).backdrop_id,
    emojis
  };
}

/**
 * An emoji tapped: a toggle. A pick over a full set drops the oldest, and a gift gives way to the colour `fallback`
 * (the last one shown, else the default) - a gift theme has no emoji.
 */
export function withEmojiToggled(appearance: Appearance, emoji: ThemeEmoji, fallback: Appearance): Appearance {
  const base = appearance.kind === 'gift' ? fallback : appearance;
  const key = themeEmojiKey(emoji);
  const without = base.emojis.filter((item) => themeEmojiKey(item) !== key);
  const emojis = without.length < base.emojis.length ? without : [...base.emojis, emoji].slice(-MAX_THEME_EMOJI);
  return {
    kind: emojis.length ? 'emoji' : isDefaultBackdrop(base.backdrop) ? 'default' : 'color',
    backdrop: base.backdrop,
    backdropId: base.backdropId,
    emojis
  };
}

/** A collectible tapped: it takes the whole theme, and the emoji go */
export function withGift(gift: StarGift.starGiftUnique): Appearance | undefined {
  return shareThemeToAppearance({_: 'shareThemeGift', stargift: gift});
}

export type ShareThemeToSave = {
  /** What `messages.setShareTheme` takes */
  theme: ShareTheme,
  /** What the full peer holds afterwards: the same, but for a gift, whose input constructor is not a thing to keep */
  shown: ShareTheme
};

/**
 * @param giftInput how the owner names the gift: its slug for the own profile, the chat and the saved id for a chat's
 * @returns `undefined` for a gift that cannot be named, which cannot be saved
 */
export function appearanceToShareTheme(appearance: Appearance, giftInput?: InputSavedStarGift): ShareThemeToSave | undefined {
  if(appearance.kind === 'gift') {
    if(!appearance.gift || !giftInput) return;
    return {
      theme: {_: 'inputShareThemeGift', stargift: giftInput},
      shown: {_: 'shareThemeGift', stargift: appearance.gift}
    };
  }

  const hasBackdrop = !isDefaultBackdrop(appearance.backdrop) && appearance.backdropId !== undefined;
  if(!hasBackdrop && !appearance.emojis.length) {
    return {theme: {_: 'shareThemeDefault'}, shown: {_: 'shareThemeDefault'}};
  }

  const theme: ShareTheme.shareThemeEmojiBackdrop = {_: 'shareThemeEmojiBackdrop'};
  if(hasBackdrop) theme.backdrop_id = appearance.backdropId;
  if(appearance.emojis.length) {
    theme.emojis = appearance.emojis.map((emoji): Reaction => emoji.documentId ?
      {_: 'reactionCustomEmoji', document_id: emoji.documentId} :
      {_: 'reactionEmoji', emoticon: emoji.emoticon});
  }

  return {theme, shown: theme};
}

/** The input naming a gift of the owner: the own profile's by its slug, a chat's by the input its list came with */
export function giftToInput(gift: StarGift.starGiftUnique, isSelf: boolean, chatInput?: InputSavedStarGift): InputSavedStarGift | undefined {
  if(isSelf) return gift.slug ? {_: 'inputSavedStarGiftSlug', slug: gift.slug} : undefined;
  return chatInput?._ === 'inputSavedStarGiftChat' ? chatInput : undefined;
}
