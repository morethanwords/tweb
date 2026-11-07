import type {Document, DocumentAttribute, Message, MessageEntity, MessageMedia, PageBlock, PageListItem, PageListOrderedItem, Photo, RichText} from '@layer';
import type {LocalTextWithOptionalEntities} from '@types';
import calcImageInBox from '@helpers/calcImageInBox';
import mediaSizes from '@helpers/mediaSizes';
import canSeeMessageMedia from '@lib/appManagers/utils/messages/canSeeMessageMedia';
import getGroupedText from '@appManagers/utils/messages/getGroupedText';
import getMainGroupedMessage from '@appManagers/utils/messages/getMainGroupedMessage';
import {richMessageToPlainMessage} from '@lib/richMessage';

type HistoryMessage = Message.message | Message.messageService;

/**
 * How the text of a message is laid out in a kind of chat, read from bubbles it has shown
 */
export type MessageTextMetrics = {
  /** for a canvas */
  font: string,
  lineHeight: number,
  /** the widest a line of text gets: a bubble at its widest */
  lineWidth: number
};

type TextPart = {
  /** of the message's own text, which wraps */
  paragraphs: string[],
  /** of its quotes, a smaller font in a narrower box */
  quoteParagraphs: string[],
  /** of its code blocks, which scroll instead of wrapping */
  codeLines: number,
  /** a line or three each */
  collapsedQuotes: number
};

const richTexts = new WeakMap<object, LocalTextWithOptionalEntities>();

// * a text with its formulas left out: one is laid out as a formula, not as its source is written
function withoutMath(text: RichText): RichText {
  if(text?._ === 'textMath') {
    return {_: 'textEmpty'};
  } else if(text?._ === 'textConcat') {
    return {...text, texts: text.texts.map(withoutMath)};
  } else if(text && 'text' in text && typeof(text.text) === 'object') {
    return {...text, text: withoutMath(text.text)} as RichText;
  }

  return text;
}

// * a block's own texts (not a media's caption, which is no text of a block counted) without their formulas
function withoutBlockMath<T extends PageBlock | PageListItem | PageListOrderedItem>(block: T): T {
  const texts: {[key: string]: RichText} = {};
  for(const key of ['text', 'caption', 'title', 'author']) {
    const text = (block as any)[key] as RichText;
    if(text?._?.startsWith('text')) texts[key] = withoutMath(text);
  }

  return {...block, ...texts};
}

/**
 * The blocks of a rich message its height is counted by, for a lower bound: those that show their text as it is written
 * out - paragraphs, headings, lists, quotes but a collapsed one, code, a closed section's summary and an open one's
 * blocks, all without their formulas. Any other (a table, whose cells stand side by side or scroll; media and their
 * captions; a cover; a divider; a formula; a block of a later layer) counts for nothing
 */
function getCountedBlocks(blocks: PageBlock[]): PageBlock[] {
  return blocks.flatMap((block): PageBlock[] => {
    switch(block._) {
      case 'pageBlockParagraph':
      case 'pageBlockTitle':
      case 'pageBlockSubtitle':
      case 'pageBlockHeader':
      case 'pageBlockSubheader':
      case 'pageBlockHeading1':
      case 'pageBlockHeading2':
      case 'pageBlockHeading3':
      case 'pageBlockHeading4':
      case 'pageBlockHeading5':
      case 'pageBlockHeading6':
      case 'pageBlockKicker':
      case 'pageBlockFooter':
      case 'pageBlockThinking':
      case 'pageBlockPullquote':
      case 'pageBlockAuthorDate':
        return [withoutBlockMath(block)];
      case 'pageBlockPreformatted': // * a display formula's is its source
        return block.language === 'math' ? [] : [block];
      case 'pageBlockBlockquote':
        return block.pFlags?.collapsed ? [] : [withoutBlockMath(block)];
      case 'pageBlockBlockquoteBlocks':
        return [{...withoutBlockMath(block), blocks: getCountedBlocks(block.blocks)}];
      case 'pageBlockDetails':
        return [{...withoutBlockMath(block), blocks: block.pFlags?.open ? getCountedBlocks(block.blocks) : []}];
      case 'pageBlockList':
        return [{...block, items: block.items.map((item) => item._ === 'pageListItemBlocks' ? {...item, blocks: getCountedBlocks(item.blocks)} : withoutBlockMath(item))}];
      case 'pageBlockOrderedList':
        return [{...block, items: block.items.map((item) => item._ === 'pageListOrderedItemBlocks' ? {...item, blocks: getCountedBlocks(item.blocks)} : withoutBlockMath(item))}];
      default:
        return [];
    }
  });
}

/**
 * The text of a message: of a rich one (whose own text is empty) the blocks it is counted by (`getCountedBlocks`) as a
 * plain message writes them out, a block a paragraph at least - its headings and lists lay out taller still
 */
function getText(message: Message.message): LocalTextWithOptionalEntities {
  const richMessage = message.rich_message;
  if(!richMessage) {
    return {text: message.message, entities: message.entities};
  }

  let text = richTexts.get(richMessage);
  if(!text) {
    text = richMessageToPlainMessage({...richMessage, blocks: getCountedBlocks(richMessage.blocks || [])});
    richTexts.set(richMessage, text);
  }

  return text;
}

/**
 * The text of a message by how it is laid out. A quote and a code block are blocks: the line breaks around one are
 * its edges, not empty lines; inline code is left out, it may not wrap
 */
function splitText({text, entities}: LocalTextWithOptionalEntities): TextPart {
  const part: TextPart = {paragraphs: [], quoteParagraphs: [], codeLines: 0, collapsedQuotes: 0};
  if(!text) {
    return part;
  }

  const blocks: {from: number, to: number, entity: MessageEntity}[] = [];
  let plain = '';
  for(const entity of entities || []) {
    if(entity._ === 'messageEntityPre' || entity._ === 'messageEntityBlockquote' || entity._ === 'messageEntityCode') {
      blocks.push({from: entity.offset, to: entity.offset + entity.length, entity});
    }
  }

  blocks.sort((a, b) => a.from - b.from);
  const addParagraphs = (chunk: string, afterBlock: boolean, beforeBlock: boolean) => {
    if(afterBlock) chunk = chunk.replace(/^\n+/, '');
    if(beforeBlock) chunk = chunk.replace(/\n+$/, '');
    if(chunk) part.paragraphs.push(...chunk.split('\n'));
  };

  let cursor = 0, afterBlock = false;
  for(const {from, to, entity} of blocks) {
    if(from < cursor) { // * inside another one
      continue;
    }

    if(entity._ === 'messageEntityCode') { // * inline: the text around it goes on
      plain += text.slice(cursor, from);
      cursor = to;
      continue;
    }

    addParagraphs(plain + text.slice(cursor, from), afterBlock, true);
    plain = '';
    const inner = text.slice(from, to).replace(/^\n+|\n+$/g, '');
    if(entity._ === 'messageEntityPre') {
      part.codeLines += inner.split('\n').length;
    } else if((entity as MessageEntity.messageEntityBlockquote).pFlags?.collapsed) {
      ++part.collapsedQuotes;
    } else {
      part.quoteParagraphs.push(...inner.split('\n'));
    }

    cursor = to;
    afterBlock = true;
  }

  addParagraphs((plain + text.slice(cursor)).replace(/\n+$/, ''), afterBlock, false);
  return part;
}

function getMediaSize(message: Message.message) {
  // * a self-destructing one is a line of notice instead
  if(!canSeeMessageMedia(message)) {
    return;
  }

  const media = message.media;
  if(media._ === 'messageMediaPhoto') {
    let w: number, h: number;
    for(const size of (media.photo as Photo.photo)?.sizes || []) {
      if('w' in size && size.w && size.h && (!w || size.w * size.h > w * h)) {
        w = size.w;
        h = size.h;
      }
    }

    return w && {w, h};
  } else if(media._ === 'messageMediaDocument') {
    const attributes = (media.document as Document.document)?.attributes || [];
    const attribute = attributes.find((attribute) => attribute._ === 'documentAttributeVideo') as DocumentAttribute.documentAttributeVideo;
    if(attribute?.w && attribute.h && !attributes.some((attribute) => attribute._ === 'documentAttributeSticker')) {
      return {w: attribute.w, h: attribute.h, round: !!attribute.pFlags?.round_message};
    }
  }
}

/**
 * The height a widget message's block has at least, as the chat knows it before the widget runs; nothing where the
 * chat does not draw widgets
 */
export type GetWidgetHeight = (message: Message.message, media: MessageMedia.messageMediaWidget) => number;

function getWidgetBlockHeight(message: Message.message, getWidgetHeight?: GetWidgetHeight) {
  const media = message.media;
  return media?._ === 'messageMediaWidget' && getWidgetHeight ? getWidgetHeight(message, media) : 0;
}

/**
 * A height the bubble of a message has at least - never more than it gets, the bubble's frame left out, when nothing
 * is known of how this chat lays text out: the text in as many lines as it has paragraphs, or as its length makes at
 * the smallest font in the widest bubble; a photo or a video no taller than a phone shows it, in an album a tile; a
 * widget as high as `getWidgetHeight` knows it
 */
export function getBubbleHeightAtLeast(message: HistoryMessage, inAlbum?: boolean, getWidgetHeight?: GetWidgetHeight) {
  const LINE = 16, SMALL_LINE = 14, LINE_CHARS = 200, MEDIA_SIZE = 240, ALBUM_TILE_SIZE = 120;
  if(message?._ !== 'message') {
    return 0;
  }

  let height = 0;
  const text = getText(message);
  if(text.text) {
    const {paragraphs, quoteParagraphs, codeLines, collapsedQuotes} = splitText(text);
    const countLines = (paragraphs: string[]) => Math.max(paragraphs.length, Math.ceil(paragraphs.reduce((length, paragraph) => length + paragraph.length, 0) / LINE_CHARS));
    height += LINE * countLines(paragraphs) + SMALL_LINE * (countLines(quoteParagraphs) + codeLines + collapsedQuotes);
  }

  const size = getMediaSize(message);
  if(size) {
    height += Math.min(size.h, size.h * MEDIA_SIZE / size.w, inAlbum ? ALBUM_TILE_SIZE : MEDIA_SIZE);
  }

  return height + getWidgetBlockHeight(message, getWidgetHeight);
}

let measureContext: CanvasRenderingContext2D, measureFont: string;
export function measureTextWidth(text: string, font: string) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if(measureFont !== font) {
    measureContext.font = measureFont = font;
  }

  return measureContext.measureText(text).width;
}

/**
 * The height of a message's bubble laid out the way the chat lays out its text, still at least: each paragraph in as
 * many lines as its width at the regular weight fills at the widest a line gets (wrapping on words only adds lines),
 * a quote's and a code block's at four fifths of the size,
 * a photo or a video in the box a bubble gives it (less a tenth: a narrow chat shrinks the box), a widget as high as
 * `getWidgetHeight` knows it, a row of reactions at its lowest, everything else - the frame, a link preview, the
 * comments button, which not every post with comments shows - left out
 */
export function estimateBubbleHeight(message: HistoryMessage, metrics: MessageTextMetrics, inAlbum?: boolean, getWidgetHeight?: GetWidgetHeight) {
  const REACTIONS = 32, POLL_OPTION = 32, ALBUM_TILE_SIZE = 120, SMALL_SCALE = .8;
  if(message?._ !== 'message') {
    return 0;
  }

  let height = 0;
  const text = getText(message);
  if(text.text) {
    const {paragraphs, quoteParagraphs, codeLines, collapsedQuotes} = splitText(text);
    const countLines = (paragraphs: string[], scale: number) => paragraphs.reduce((lines, paragraph) => {
      return lines + (paragraph ? Math.max(1, Math.ceil(measureTextWidth(paragraph, metrics.font) * scale / metrics.lineWidth)) : 1);
    }, 0);

    height += countLines(paragraphs, 1) * metrics.lineHeight;
    // * quotes and code at their smaller font and lines
    height += (countLines(quoteParagraphs, SMALL_SCALE) + codeLines + collapsedQuotes) * metrics.lineHeight * SMALL_SCALE;
  }

  const size = getMediaSize(message);
  if(size) {
    const box = size.round ? mediaSizes.active.round : mediaSizes.active.regular;
    height += inAlbum ?
      Math.min(size.h, ALBUM_TILE_SIZE) :
      calcImageInBox(size.w, size.h, box.width, box.height).height * 0.9;
  }

  const media = message.media;
  if(media?._ === 'messageMediaPoll') {
    height += media.poll.answers.length * POLL_OPTION;
  }

  height += getWidgetBlockHeight(message, getWidgetHeight);

  if(message.reactions?.results?.length) {
    height += REACTIONS;
  }

  return height;
}

/**
 * An album (oldest first) as its one bubble shows it: the caption of the only item that has one - none when more do -
 * and the reactions of its main item
 */
export function getAlbumBubbleMessage(items: Message.message[]): Message.message {
  const caption = getGroupedText(items);
  return {...getMainGroupedMessage(items), message: caption?.message || '', entities: caption?.entities};
}

type GetHeight = (message: HistoryMessage, inAlbum: boolean) => number;

const getGroupedId = (message: HistoryMessage) => (message as Message.message)?.grouped_id;

/**
 * An album's bubble from its items, in whatever order they come
 */
function getAlbumHeight(items: HistoryMessage[], getHeight: GetHeight) {
  const sorted = (items as Message.message[]).slice().sort((a, b) => a.mid - b.mid);
  return getHeight(getAlbumBubbleMessage(sorted), true);
}

/**
 * How many of the messages, in the order they go away from a point of the screen, fill `height` by `getHeight`, and
 * how much they fill: an album is one bubble and is never split
 */
function fillHeight(messages: HistoryMessage[], height: number, getHeight: GetHeight) {
  let filled = 0, count = 0;
  for(; count < messages.length && filled < height; ++count) {
    const groupedId = getGroupedId(messages[count]);
    if(!groupedId) {
      filled += getHeight(messages[count], false);
    } else if(groupedId !== getGroupedId(messages[count - 1])) {
      const items: HistoryMessage[] = [];
      for(let i = count; getGroupedId(messages[i]) === groupedId; ++i) {
        items.push(messages[i]);
      }

      filled += getAlbumHeight(items, getHeight);
    }
  }

  while(count < messages.length && getGroupedId(messages[count]) && getGroupedId(messages[count]) === getGroupedId(messages[count - 1])) {
    ++count;
  }

  return {count, filled};
}

/**
 * Where the message a chat opens at stands on its screen, counted from the screen's top: the end of the chat at the
 * bottom, a message jumped to with its middle at `center`, or a message with its top at `top` - the first unread one
 * under the bars over the screen, the one the chat was left at where it stood
 */
export type FirstScreenPlace = 'end' | {center: number} | {top: number};

/**
 * Which of the messages (newest first) fill a screen of `height` with the one at `index` - its whole album - standing
 * at `place`, and `margin` more on each side: from the newest to the oldest index kept. Where one side ends with the
 * chat before it fills its part, the scroll stops there, the message moves toward that edge, and the other side shows
 * the rest of the screen. All of them when they may not fill it
 */
export function countFirstScreen(
  messages: HistoryMessage[],
  index: number,
  place: FirstScreenPlace,
  height: number,
  margin: number,
  isEnd: {top?: boolean, bottom?: boolean},
  getHeight: GetHeight = getBubbleHeightAtLeast
) {
  const groupedId = getGroupedId(messages[index]);
  let newest = index, oldest = index;
  while(groupedId && getGroupedId(messages[newest - 1]) === groupedId) --newest;
  while(groupedId && getGroupedId(messages[oldest + 1]) === groupedId) ++oldest;
  const messageHeight = groupedId ? getAlbumHeight(messages.slice(newest, oldest + 1), getHeight) : getHeight(messages[index], false);

  // * the screen above the message and below it, at most: the message is `messageHeight` high at least
  let above: number, below: number;
  if(place === 'end') {
    [above, below] = [height - messageHeight, 0];
  } else if('center' in place) {
    [above, below] = [place.center, height - place.center];
  } else {
    [above, below] = [place.top, height - place.top - messageHeight];
  }

  // * each side in the order it goes away from the message
  const older = messages.slice(oldest + 1);
  const newer = messages.slice(0, newest).reverse();
  // * the margin counts from the screen's edge: a message standing past it covers that much of it itself
  const fill = (side: HistoryMessage[], need: number) => fillHeight(side, Math.max(0, need + margin), getHeight);
  // * what a side that ends with the chat leaves of the screen to the other one
  const leftBy = (side: HistoryMessage[], sideFill: ReturnType<typeof fillHeight>, endsWithChat: boolean) => {
    return endsWithChat && sideFill.count === side.length ? height - messageHeight - sideFill.filled : -Infinity;
  };

  const newerFill = fill(newer, Math.max(below, leftBy(older, fill(older, above), isEnd.top)));
  const olderFill = fill(older, Math.max(above, leftBy(newer, newerFill, isEnd.bottom)));
  return {newest: newest - newerFill.count, oldest: oldest + olderFill.count};
}

/**
 * The history without the messages older than `oldestMid`, nor - when it is given - those from `newerThanMid` up:
 * the ends left out are not reached any more
 */
export function keepFrom<T extends {
  history?: number[],
  messages?: unknown[],
  isEnd?: {top?: boolean, bottom?: boolean, both?: boolean}
}>(historyResult: T, oldestMid: number, newerThanMid?: number): T {
  const isKept = (item: unknown) => {
    const mid = typeof(item) === 'number' ? item : (item as {mid?: number}).mid;
    return mid >= oldestMid && (newerThanMid === undefined || mid < newerThanMid);
  };

  return {
    ...historyResult,
    history: historyResult.history?.filter(isKept),
    ...(historyResult.messages && {messages: historyResult.messages.filter(isKept)}),
    ...(historyResult.isEnd && {isEnd: {
      ...historyResult.isEnd,
      top: false,
      both: false,
      ...(newerThanMid !== undefined && {bottom: false})
    }})
  };
}

/**
 * The messages of a history (newest first) from index `newest` to `oldest`, by its order, not by their ids: the
 * order shown can put a message being sent after newer ones. An end of the chat stays reached only where nothing past
 * it is left out
 */
export function keepRange<T extends {
  history: number[],
  messages?: unknown[],
  isEnd?: {top?: boolean, bottom?: boolean, both?: boolean}
}>(historyResult: T, newest: number, oldest: number): T {
  const leftOutOlder = oldest < historyResult.history.length - 1, leftOutNewer = newest > 0;
  const isEnd = historyResult.isEnd;
  return {
    ...historyResult,
    history: historyResult.history.slice(newest, oldest + 1),
    ...(historyResult.messages && {messages: historyResult.messages.slice(newest, oldest + 1)}),
    ...(isEnd && {isEnd: {
      ...isEnd,
      top: isEnd.top && !leftOutOlder,
      bottom: isEnd.bottom && !leftOutNewer,
      both: isEnd.both && !leftOutOlder && !leftOutNewer
    }})
  };
}

/**
 * Two parts of a history as one, the newer first: ending where the part at each end does, or the other part where
 * that one is empty
 */
export function joinHistories<T extends {
  history: number[],
  messages?: unknown[],
  isEnd?: {top?: boolean, bottom?: boolean, both?: boolean}
}>(newer: T, older: T): T {
  const atTop = older.history.length ? older : newer;
  const atBottom = newer.history.length ? newer : older;
  return {
    ...older,
    history: [...newer.history, ...older.history],
    ...(older.messages && {messages: [...newer.messages, ...older.messages]}),
    ...(older.isEnd && {isEnd: {...older.isEnd, top: atTop.isEnd.top, bottom: atBottom.isEnd.bottom, both: false}})
  };
}
