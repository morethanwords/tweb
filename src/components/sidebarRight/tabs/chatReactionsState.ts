import type {ChatReactions, Reaction} from '@layer';
import type {ChatAvailableReactionsOptions} from '@appManagers/appChatsManager';
import {cleanEmoji} from '@lib/richTextProcessor/fixEmoji';
import parseEntities from '@lib/richTextProcessor/parseEntities';
import clamp from '@helpers/number/clamp';
import createEmojiReaction from '@appManagers/utils/reactions/createEmojiReaction';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import getReactionDocId from '@appManagers/utils/reactions/getReactionDocId';
import docIdToReaction from '@appManagers/utils/reactions/docIdToReaction';
import {DEFAULT_REACTIONS_UNIQ_MAX} from '@appManagers/utils/reactions/filterReactionsAtUniqCap';
import {PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';

/**
 * The state of the chat's Reactions screen, apart from the screen: what it opens with, how a change
 * moves it, and what a save sends. A group keeps the All / Some / None choice; a channel has the
 * modern editor — a master switch, an ordered list of standard and custom emoji, a maximum of
 * distinct reactions per post and Stars reactions (as on Android).
 */

/** Seeded when Some is chosen with nothing picked (Android): the thumbs, else the first two active. */
const SEED_EMOTICONS = ['👍', '👎'];
export const DEFAULT_REACTIONS_IN_CHAT_MAX = 100;

export type ChatReactionsCatalogItem = {
  emoticon: string,
  // the standard reaction's select animation: what the emoji picker shows for it
  docId?: DocId
};

export type ReactionsSavePayload = {
  reactions: ChatReactions,
  options: ChatAvailableReactionsOptions
};

export function hasReaction(reactions: Reaction[], reaction: Reaction) {
  return reactions.some((other) => reactionsEqual(other, reaction));
}

function withoutReaction(reactions: Reaction[], reaction: Reaction) {
  return reactions.filter((other) => !reactionsEqual(other, reaction));
}

function getSeedReactions(activeEmoticons: string[]): Reaction[] {
  let emoticons = SEED_EMOTICONS.filter((emoticon) => activeEmoticons.includes(emoticon));
  if(!emoticons.length) {
    emoticons = activeEmoticons.slice(0, 2);
  }

  return emoticons.map(createEmojiReaction);
}

// * Groups

export type GroupReactionsMode = 'all' | 'some' | 'none';
export type GroupReactionsDraft = {
  mode: GroupReactionsMode,
  // All's flag as the chat had it: a switch to All made here allows the standard reactions only
  allowCustom: boolean,
  // the Some list, kept while another mode is chosen; reactions the screen does not show (custom
  // emoji another client set, an inactive emoji) stay in it untouched and in their place
  reactions: Reaction[]
};

export function initGroupDraft(available: ChatReactions | undefined): GroupReactionsDraft {
  if(available?._ === 'chatReactionsAll') {
    return {mode: 'all', allowCustom: !!available.pFlags?.allow_custom, reactions: []};
  }

  if(available?._ === 'chatReactionsSome' && available.reactions.length) {
    return {mode: 'some', allowCustom: false, reactions: available.reactions.slice()};
  }

  return {mode: 'none', allowCustom: false, reactions: []};
}

export function setGroupMode(draft: GroupReactionsDraft, mode: GroupReactionsMode, activeEmoticons: string[]): GroupReactionsDraft {
  if(draft.mode === mode) {
    return draft;
  }

  if(mode === 'all') {
    return {...draft, mode, allowCustom: false};
  }

  if(mode === 'some' && !draft.reactions.length) {
    return {...draft, mode, reactions: getSeedReactions(activeEmoticons)};
  }

  return {...draft, mode};
}

export function toggleGroupReaction(draft: GroupReactionsDraft, reaction: Reaction, checked: boolean): GroupReactionsDraft {
  const has = hasReaction(draft.reactions, reaction);
  if(checked === has) {
    return draft;
  }

  const reactions = checked ? [...draft.reactions, reaction] : withoutReaction(draft.reactions, reaction);
  // * taking off the last one turns reactions off (Android)
  return {...draft, mode: reactions.length ? 'some' : 'none', reactions};
}

export function buildGroupPayload(draft: GroupReactionsDraft): ReactionsSavePayload {
  let reactions: ChatReactions;
  if(draft.mode === 'all') {
    reactions = {_: 'chatReactionsAll', pFlags: draft.allowCustom ? {allow_custom: true} : {}};
  } else if(draft.mode === 'some' && draft.reactions.length) {
    reactions = {_: 'chatReactionsSome', reactions: draft.reactions.slice()};
  } else {
    reactions = {_: 'chatReactionsNone'};
  }

  return {reactions, options: {}};
}

// * Channels

export type ChannelReactionsDraft = {
  enabled: boolean,
  // the free reactions in their order, Stars never among them
  reactions: Reaction[],
  paid: boolean,
  limit: number
};

export function initChannelDraft({available, paid, limit, activeEmoticons}: {
  available: ChatReactions | undefined,
  paid: boolean,
  limit: number,
  activeEmoticons: string[]
}): ChannelReactionsDraft {
  let reactions: Reaction[] = [];
  if(available?._ === 'chatReactionsAll') {
    reactions = activeEmoticons.map(createEmojiReaction);
  } else if(available?._ === 'chatReactionsSome') {
    reactions = available.reactions.filter((reaction) => reaction._ !== 'reactionPaid');
  }

  return {
    // * Stars alone are reactions too
    enabled: !!reactions.length || paid,
    reactions,
    paid,
    limit
  };
}

export function setChannelEnabled(draft: ChannelReactionsDraft, enabled: boolean, activeEmoticons: string[]): ChannelReactionsDraft {
  if(draft.enabled === enabled) {
    return draft;
  }

  // * off keeps the list for coming back; on with nothing in it takes the standard ones
  if(enabled && !draft.reactions.length) {
    return {...draft, enabled, reactions: activeEmoticons.map(createEmojiReaction)};
  }

  return {...draft, enabled};
}

export type ChannelInsertResult =
  | {draft: ChannelReactionsDraft, refused?: undefined}
  | {draft: ChannelReactionsDraft, refused: 'duplicate' | 'limit'};

/** Puts a reaction at `index` of the free list; never twice, never past `max` */
export function insertChannelReaction(
  draft: ChannelReactionsDraft,
  reaction: Reaction,
  index: number,
  max: number
): ChannelInsertResult {
  if(reaction._ === 'reactionPaid') {
    return {draft: setChannelPaid(draft, true)};
  }

  if(hasReaction(draft.reactions, reaction)) {
    return {draft, refused: 'duplicate'};
  }

  if(draft.reactions.length >= max) {
    return {draft, refused: 'limit'};
  }

  const reactions = draft.reactions.slice();
  reactions.splice(clamp(index, 0, reactions.length), 0, reaction);
  return {draft: {...draft, reactions}};
}

export function removeChannelReactionAt(draft: ChannelReactionsDraft, index: number): ChannelReactionsDraft {
  if(index < 0 || index >= draft.reactions.length) {
    return draft;
  }

  const reactions = draft.reactions.slice();
  reactions.splice(index, 1);
  return {...draft, reactions};
}

export function removeChannelReaction(draft: ChannelReactionsDraft, reaction: Reaction): ChannelReactionsDraft {
  if(reaction._ === 'reactionPaid') {
    return setChannelPaid(draft, false);
  }

  return hasReaction(draft.reactions, reaction) ? {...draft, reactions: withoutReaction(draft.reactions, reaction)} : draft;
}

export function setChannelPaid(draft: ChannelReactionsDraft, paid: boolean): ChannelReactionsDraft {
  return draft.paid === paid ? draft : {...draft, paid};
}

export function setChannelLimit(draft: ChannelReactionsDraft, limit: number): ChannelReactionsDraft {
  return draft.limit === limit ? draft : {...draft, limit};
}

export function countCustomReactions(reactions: Reaction[]) {
  return reactions.reduce((count, reaction) => count + +(reaction._ === 'reactionCustomEmoji'), 0);
}

/** The level a channel needs for the draft: one per custom emoji, while reactions are on */
export function getRequiredBoostLevel(draft: ChannelReactionsDraft) {
  return draft.enabled ? countCustomReactions(draft.reactions) : 0;
}

function isExactlyCatalog(reactions: Reaction[], activeEmoticons: string[]) {
  if(reactions.length !== activeEmoticons.length) {
    return false;
  }

  const set = new Set(activeEmoticons);
  return reactions.every((reaction) => reaction._ === 'reactionEmoji' && set.delete(reaction.emoticon));
}

export function buildChannelPayload(draft: ChannelReactionsDraft, {activeEmoticons, paidShown}: {
  activeEmoticons: string[],
  // the paid switch is on the screen: its state is sent as it is, false included
  paidShown: boolean
}): ReactionsSavePayload {
  const options: ChatAvailableReactionsOptions = {};
  if(paidShown) {
    options.paidEnabled = draft.enabled && draft.paid;
  }

  if(!draft.enabled) {
    return {reactions: {_: 'chatReactionsNone'}, options};
  }

  // * sent even when it is the global maximum: left out, the server keeps a lower one
  options.reactionsLimit = draft.limit;

  let reactions: ChatReactions;
  if(!draft.reactions.length) {
    reactions = {_: 'chatReactionsNone'};
  } else if(isExactlyCatalog(draft.reactions, activeEmoticons)) {
    reactions = {_: 'chatReactionsAll', pFlags: {}};
  } else {
    reactions = {_: 'chatReactionsSome', reactions: draft.reactions.slice()};
  }

  return {reactions, options};
}

function chatReactionsEqual(a: ChatReactions, b: ChatReactions) {
  if(a._ !== b._) {
    return false;
  }

  if(a._ === 'chatReactionsAll') {
    return !!a.pFlags?.allow_custom === !!(b as ChatReactions.chatReactionsAll).pFlags?.allow_custom;
  }

  if(a._ === 'chatReactionsSome') {
    const other = (b as ChatReactions.chatReactionsSome).reactions;
    return a.reactions.length === other.length && a.reactions.every((reaction, index) => reactionsEqual(reaction, other[index]));
  }

  return true;
}

export function savePayloadsEqual(a: ReactionsSavePayload, b: ReactionsSavePayload) {
  return chatReactionsEqual(a.reactions, b.reactions) &&
    a.options.reactionsLimit === b.options.reactionsLimit &&
    a.options.paidEnabled === b.options.paidEnabled;
}

// * The emoji picker

/** A cell of the emoji picker as it reports a click */
export type PickedEmoji = {docId?: DocId, emoji?: string};

/**
 * What a cell of the emoji picker stands for: Stars, a standard reaction (its select animation, or
 * its emoji), or a custom emoji
 */
export function pickedEmojiToReaction(emoji: PickedEmoji, catalog: ChatReactionsCatalogItem[]): Reaction {
  if(emoji.docId) {
    return docIdToReaction(emoji.docId, (docId) => catalog.find((item) => item.docId === docId)?.emoticon);
  }

  const emoticon = emoji.emoji && cleanEmoji(emoji.emoji);
  const standard = emoticon && catalog.find((item) => item.emoticon === emoticon);
  if(standard) {
    return createEmojiReaction(standard.emoticon);
  }
}

/** The custom emoji a reaction is drawn as, if any: Stars' own, a standard one's select animation, a custom one */
export function reactionToDocId(reaction: Reaction, catalog: ChatReactionsCatalogItem[]): DocId | undefined {
  return getReactionDocId(reaction, (emoticon) => catalog.find((item) => item.emoticon === emoticon)?.docId);
}

// * The field: the reactions as a line of emoji, edited as text

/** The character Stars are drawn as in the field and copied as (the field's own token for them is a sentinel) */
export const PAID_PLAIN_EMOJI = '⭐';

/**
 * What a token of the field's text, a new one (pasted, dropped, typed), stands for: an ACTIVE standard
 * reaction (its emoji, or its select animation), a custom emoji, or Stars while their switch is shown.
 * Anything else — text, an emoji that is no active reaction — stands for nothing and is dropped.
 */
export function fieldTokenToReaction(token: PickedEmoji, {catalog, activeEmoticons, paidShown}: {
  catalog: ChatReactionsCatalogItem[],
  activeEmoticons: string[],
  paidShown: boolean
}): Reaction | undefined {
  if(!token.docId && !token.emoji) {
    return;
  }

  let reaction = pickedEmojiToReaction(token, catalog);
  // * Stars copied out of the field are their plain character; a standard reaction with it wins
  if(!reaction && paidShown && !token.docId && cleanEmoji(token.emoji) === cleanEmoji(PAID_PLAIN_EMOJI)) {
    reaction = {_: 'reactionPaid'};
  }

  if(reaction?._ === 'reactionPaid') {
    return paidShown ? reaction : undefined;
  }

  // * an inactive one cannot be newly allowed
  if(reaction?._ === 'reactionEmoji' && !activeEmoticons.includes(reaction.emoticon)) {
    return;
  }

  return reaction;
}

/** Whether a token of the field's text is how the field draws `reaction` */
function isFieldTokenOf(token: PickedEmoji, reaction: Reaction) {
  switch(reaction._) {
    case 'reactionPaid': return token.docId === PAID_REACTION_EMOJI_DOCID;
    case 'reactionCustomEmoji': return token.docId === reaction.document_id;
    case 'reactionEmoji': return !token.docId && !!token.emoji && cleanEmoji(token.emoji) === cleanEmoji(reaction.emoticon);
    default: return false;
  }
}

/** The reactions in the order the field shows them: Stars first, when on */
export function getChannelFieldReactions(draft: ChannelReactionsDraft): Reaction[] {
  return draft.paid ? [{_: 'reactionPaid'}, ...draft.reactions] : draft.reactions;
}

/**
 * The draft after an edit of the field's text (as tdesktop's field takes it): what stands where it stood
 * stays, whatever it is (an inactive emoji another client set too); of what came in between them — a paste,
 * a drop, an emoji typed — only reactions, each once and none already there (the first one wins), and
 * no more than `max` free ones. Stars are the paid switch wherever they come in, and stand first.
 * `caret` is the token the caret stands before in `tokens`; the result's is in the field's new order.
 */
export function editChannelField(
  draft: ChannelReactionsDraft,
  tokens: PickedEmoji[],
  caret: number,
  options: Parameters<typeof fieldTokenToReaction>[1] & {max: number}
): {draft: ChannelReactionsDraft, caret: number, refused?: 'limit'} {
  const previous = getChannelFieldReactions(draft);
  let prefix = 0;
  while(prefix < tokens.length && prefix < previous.length && isFieldTokenOf(tokens[prefix], previous[prefix])) {
    ++prefix;
  }

  let suffix = 0;
  while(
    prefix + suffix < tokens.length &&
    prefix + suffix < previous.length &&
    isFieldTokenOf(tokens[tokens.length - 1 - suffix], previous[previous.length - 1 - suffix])
  ) {
    ++suffix;
  }

  const kept = [...previous.slice(0, prefix), ...previous.slice(previous.length - suffix)];
  let free = countFreeReactions(kept);
  let refused: 'limit';
  const inserted: Reaction[] = [];
  // * how many of the new ones stand before the caret
  let insertedBeforeCaret = 0;
  const insertedTokens = tokens.slice(prefix, tokens.length - suffix);
  insertedTokens.forEach((token, index) => {
    const reaction = fieldTokenToReaction(token, options);
    if(!reaction || hasReaction(kept, reaction) || hasReaction(inserted, reaction)) {
      return;
    }

    if(reaction._ !== 'reactionPaid') {
      if(free >= options.max) {
        refused = 'limit';
        return;
      }

      ++free;
    }

    inserted.push(reaction);
    if(prefix + index < caret) {
      ++insertedBeforeCaret;
    }
  });

  const list = [...previous.slice(0, prefix), ...inserted, ...previous.slice(previous.length - suffix)];
  let index = caret <= prefix ?
    caret :
    (caret >= tokens.length - suffix ? caret - (tokens.length - suffix) + prefix + inserted.length : prefix + insertedBeforeCaret);

  // * Stars move to the front: what stood before them moves one place on
  const paidIndex = list.findIndex((reaction) => reaction._ === 'reactionPaid');
  if(paidIndex > 0 && index <= paidIndex) {
    ++index;
  }

  const reactions = list.filter((reaction) => reaction._ !== 'reactionPaid');
  const paid = paidIndex !== -1;
  const changed = paid !== draft.paid || reactions.length !== draft.reactions.length ||
    reactions.some((reaction, i) => reaction !== draft.reactions[i]);
  return {
    draft: changed ? {...draft, reactions, paid} : draft,
    caret: clamp(index, 0, reactions.length + +paid),
    ...(refused && {refused})
  };
}

function countFreeReactions(reactions: Reaction[]) {
  return reactions.reduce((count, reaction) => count + +(reaction._ !== 'reactionPaid'), 0);
}

/**
 * Whether typed text would become a reaction, under the rule of a paste (`fieldTokenToReaction`): it holds an emoji
 * and every emoji in it is an active standard reaction. Checked before the text replaces the selection, so one
 * that would be dropped afterwards never takes the selected reactions with it.
 */
export function isReactionTyping(data: string | null | undefined, options: Parameters<typeof fieldTokenToReaction>[1]) {
  if(!data) {
    return false;
  }

  const emojis = parseEntities(data).filter((entity) => entity._ === 'messageEntityEmoji');
  return !!emojis.length && emojis.every((entity) => {
    return !!fieldTokenToReaction({emoji: data.substr(entity.offset, entity.length)}, options);
  });
}
