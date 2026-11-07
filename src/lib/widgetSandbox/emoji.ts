import type {EmojiRun} from 'widget-sandbox/renderer/core';
import {getEmojiImageUrl, getImageEmojis} from '@lib/richTextProcessor/emojiImage';

/**
 * A widget's emoji are the client's (RendererEnv.emoji): drawn with its images wherever a message draws them so — every
 * platform but Apple's, whose font has them (isEmojiNative) — in the widget's text and on its canvas alike.
 */

/** Below this no character is an emoji or part of one: a text of them alone needs no look at all. */
const MAY_BE_EMOJI = /[^\u0000-¨ª-­¯-῿]/;

/** `max`: the most parts the renderer takes for the text now; a text of more emoji than that is not looked at further. */
export function splitWidgetEmoji(text: string, max = Infinity): EmojiRun[] | undefined {
  if(!MAY_BE_EMOJI.test(text)) return;
  const emojis = getImageEmojis(text, max + 1);
  if(!emojis.length || emojis.length > max) return;
  const runs: EmojiRun[] = [];
  let last = 0;
  for(const {index, emoji, unicode} of emojis) {
    if(index > last) runs.push(text.slice(last, index));
    // the URL whatever document the widget is in (Document Picture-in-Picture has a base of its own)
    runs.push({emoji, src: new URL(getEmojiImageUrl(unicode), location.href).href});
    last = index + emoji.length;
  }

  if(last < text.length) runs.push(text.slice(last));
  return runs;
}
