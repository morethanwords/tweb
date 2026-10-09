import type {MessageEntity, TextWithEntities} from '@layer';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {FontFamily, FontWeightBold} from '@config/font';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';

// * these mirror `folderTag.module.scss`: the tags of a row are fitted to it before they are drawn,
// * so the widths have to be known without laying anything out
const FOLDER_TAG_FONT = `${FontWeightBold} 11px ${FontFamily}`;
const FOLDER_TAG_PADDING = 10;
const FOLDER_TAG_EMOJI_SIZE = 13;
const FOLDER_TAG_GAP = 4;

const widths = new Map<string, number>();

/**
 * How wide a tag with this text is: the text upper-cased, and every emoji in it - a custom one, or
 * one drawn as text or as a picture - a square of its own (`folderTag.module.scss`)
 */
export function measureFolderTag(title: TextWithEntities | string) {
  const raw = typeof(title) === 'string' ? {text: title, entities: [] as MessageEntity[]} : title;
  const key = raw.text + '\x01' + (raw.entities || [])
  .filter((entity) => entity._ === 'messageEntityCustomEmoji')
  .map((entity) => entity.offset + ':' + entity.length)
  .join(',');

  let width = widths.get(key);
  if(width !== undefined) {
    return width;
  }

  // * the same parse the tag is rendered from, which finds the emoji in the text
  const {text, entities} = wrapTextWithEntities({_: 'textWithEntities', text: raw.text, entities: raw.entities || []});
  const emojis = entities
  .filter((entity) => entity._ === 'messageEntityCustomEmoji' || entity._ === 'messageEntityEmoji')
  .sort((a, b) => a.offset - b.offset);

  let plain = '', offset = 0, emojiCount = 0;
  for(const entity of emojis) {
    if(entity.offset < offset) { // * a custom emoji over the emoji it stands for
      continue;
    }

    plain += text.slice(offset, entity.offset);
    offset = entity.offset + entity.length;
    ++emojiCount;
  }
  plain += text.slice(offset);

  width = Math.ceil(getTextWidth(plain.toUpperCase(), FOLDER_TAG_FONT)) +
    emojiCount * FOLDER_TAG_EMOJI_SIZE +
    FOLDER_TAG_PADDING;
  widths.set(key, width);
  return width;
}

export function getFolderTagMoreText(count: number) {
  return '+' + count;
}

/**
 * Which of a row's tags fit in its width, as Telegram Desktop lays them out: in the folders' order
 * while they fit, every one after the first that does not is counted into a "+N" at the end - and
 * when the "+N" itself does not fit, it takes the place of the last tag that did.
 *
 * @returns how many tags go first, and the number on the "+N" after them (0 for none)
 */
export function fitFolderTags(
  tagWidths: number[],
  availableWidth: number,
  getMoreWidth: (count: number) => number = (count) => measureFolderTag(getFolderTagMoreText(count)),
  gap = FOLDER_TAG_GAP
) {
  let visible = 0, more = 0;
  for(const width of tagWidths) {
    if(more || availableWidth < width) {
      ++more;
      continue;
    }

    ++visible;
    availableWidth -= width + gap;
  }

  if(more && availableWidth < getMoreWidth(more)) {
    // * with no tag to give its place up, not even the "+N" has room
    return visible ? {visible: visible - 1, more: more + 1} : {visible: 0, more: 0};
  }

  return {visible, more};
}
