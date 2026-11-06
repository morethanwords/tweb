import type {ComposeMessageWithAiArgs} from '@appManagers/aiTonesManager';
import type {MessageEntity} from '@layer';
import getPeerThreadKey from '@appManagers/utils/messages/getPeerThreadKey';
import LETTER_REG_EXP from '@helpers/string/letterRegExp';
import I18n, {LangPackKey} from '@lib/langPack';
import parseEntities from '@lib/richTextProcessor/parseEntities';

/**
 * An AI editor's request saved to be made again on what a chat sends: all of it but the text, which is the
 * message's own at the time it goes. Kept in the settings, which every account of the tab shares, by account and chat
 * (`getAiSendStyleKey`)
 */
export type AiSendStyle = Pick<ComposeMessageWithAiArgs, 'customPrompt' | 'toneNameOrId' | 'proofRead' | 'translateTo' | 'emojify'> & {
  /** the style's title as it was saved, to name it: the tone itself is looked up by `toneNameOrId` */
  toneTitle?: string
};

type AiSendStyleRequestKey = Exclude<keyof AiSendStyle, 'toneTitle'>;
const REQUEST_KEYS: AiSendStyleRequestKey[] = ['customPrompt', 'toneNameOrId', 'proofRead', 'translateTo', 'emojify'];

/** The part of a request that is made again, or nothing when it asks for no change */
export function getAiSendStyleOfRequest(request: ComposeMessageWithAiArgs, toneTitle?: string): AiSendStyle {
  if(!request) return;
  let style: AiSendStyle;
  for(const key of REQUEST_KEYS) {
    const value = request[key];
    if(value) (style ??= {})[key] = value as never;
  }

  if(style?.toneNameOrId && !style.customPrompt && toneTitle) style.toneTitle = toneTitle;
  return style;
}

/** Whether the two ask for the same, whatever they are called: nothing, both of them, too */
export function isSameAiSendStyle(a: AiSendStyle, b: AiSendStyle) {
  if(!a || !b) return !a === !b;
  return REQUEST_KEYS.every((key) => (a[key] || undefined) === (b[key] || undefined));
}

/**
 * A style as the settings keep it: a string, which takes the place of the one before whole. An object would be merged
 * into it by the settings' store - and in the other tabs, which get the change as the settings stand once it is sent
 * there, also after the old one was cleared first - keeping the keys of the style before (a translation by a fix)
 */
export function keepAiSendStyle(style: AiSendStyle | undefined) {
  return style ? JSON.stringify(style) : undefined;
}

export function readKeptAiSendStyle(kept: string | undefined): AiSendStyle {
  if(typeof(kept) !== 'string') return;
  try {
    return JSON.parse(kept);
  } catch{}
}

/** A chat of an account (by its own peer), or a topic of it, or a conversation of a channel's direct messages */
export function getAiSendStyleKey(accountPeerId: PeerId, peerId: PeerId, threadId?: number) {
  return `${accountPeerId}:${getPeerThreadKey(peerId, threadId)}`;
}

// * what the parser finds that nothing rewrites, and that takes the rest of its word with it: a link (the parser stops
// * a long one short), an email, a bot command
const CUTTING_ENTITIES: Set<MessageEntity['_']> = new Set([
  'messageEntityUrl',
  'messageEntityEmail',
  'messageEntityBotCommand'
]);
// * a link the parser does not take at all: from a scheme or `www.` at a word's start, past what opens it (a bracket)
const LINK_START_REG_EXP = /^(?:[a-z][\w+.-]*:\/\/|www\.)/i;
const OPENING_REG_EXP = /^[^\p{L}\p{N}@#$]+/u;
// * a word's own characters: letters with their marks, digits, the underscore, and the joiners some scripts write with
const WORD_CHARACTER_REG_EXP = /[\p{L}\p{M}\p{N}_\u200c\u200d]/u;
const TAG_SIGNS = new Set(['@', '#', '$']);

/** A word without its usernames, hashtags and cashtags: a sign where no word goes on, with all of a word after it */
function withoutTags(word: string) {
  let rest = '', afterWordCharacter = false, inTag = false;
  for(const character of word) {
    const isWordCharacter = WORD_CHARACTER_REG_EXP.test(character);
    if(inTag && isWordCharacter) continue;
    inTag = !afterWordCharacter && TAG_SIGNS.has(character);
    if(!inTag) rest += character;
    afterWordCharacter = isWordCharacter;
  }

  return rest;
}

/**
 * Whether a message has words for the AI editor to rewrite: one that starts with a bot command goes to the bot as typed,
 * and one of nothing but emoji, digits, links, emails or usernames goes as it is. Word by word, once over the text: in
 * doubt a message goes as written
 */
export function hasTextToRewrite(text: string) {
  const trimmed = text.trim();
  if(!trimmed) return false;
  const entities = parseEntities(trimmed)
  .filter((entity) => CUTTING_ENTITIES.has(entity._))
  .sort((a, b) => a.offset - b.offset);
  if(entities[0]?._ === 'messageEntityBotCommand' && !entities[0].offset) return false;

  let rest = '', next = 0;
  for(const {0: word, index: start} of trimmed.matchAll(/\S+/g)) {
    if(LINK_START_REG_EXP.test(word.replace(OPENING_REG_EXP, ''))) continue;
    // * the words go in order, and so do the entities: the ones ended before this word are behind for good
    const end = start + word.length;
    while(next < entities.length && entities[next].offset + entities[next].length <= start) ++next;
    const cut = entities[next]?.offset < end ? entities[next] : undefined;
    rest += withoutTags(cut ? word.slice(0, Math.max(0, cut.offset - start)) : word) + ' ';
  }

  return LETTER_REG_EXP.test(rest);
}

/** What the style is called in a sentence and on a button, in the interface's language as it is now */
export function formatAiSendStyleLabel(style: AiSendStyle): string {
  let label: string;
  if(style.customPrompt) {
    label = I18n.format('AiEditor.ApplyOnSend.Label.Prompt', true);
  } else if(style.toneNameOrId) {
    label = I18n.format('AiEditor.ApplyOnSend.Label.Style', true, [style.toneTitle || style.toneNameOrId]);
  } else if(style.translateTo) {
    const language = I18n.format(`Language.${style.translateTo}` as LangPackKey, true);
    label = I18n.format('AiEditor.ApplyOnSend.Label.Translate', true, [language]);
  } else if(style.proofRead) {
    label = I18n.format('AiEditor.ApplyOnSend.Label.Fix', true);
  }

  if(!style.emojify) return label;
  return label ?
    I18n.format('AiEditor.ApplyOnSend.Label.WithEmoji', true, [label]) :
    I18n.format('Emoji', true);
}
