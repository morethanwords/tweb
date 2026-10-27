import {MessageEntity, Page, PageBlock, PageCaption, PageListOrderedItem, RichMessage, RichText, TextWithEntities} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import sortEntities from '@lib/richTextProcessor/sortEntities';
import {formatListItemMarker} from '@lib/richTextProcessor/orderedList';
import {MATH_MARKER_RE, decodeInlineMath} from '@helpers/math/mathMarker';

const emptyRichText: RichText = {_: 'textEmpty'};

type Summary = TextWithEntities.textWithEntities;

export function richMessageToPage(richMessage: RichMessage): Page.page {
  // A streamed draft is rendered from every revision the sender pushes, so this runs on
  // partial data far more often than on a finished message. Reading through `pFlags` blindly
  // turns one unexpected revision into a throw inside `renderMessage`, which loses the bubble.
  const pFlags = richMessage.pFlags || {};
  return {
    _: 'page',
    pFlags: {
      rtl: pFlags.rtl,
      part: pFlags.part
    },
    url: '',
    blocks: richMessage.blocks || [],
    photos: richMessage.photos || [],
    documents: richMessage.documents || [],
    views: 0
  };
}

export function isRichMessagePart(richMessage: RichMessage) {
  return !!richMessage.pFlags?.part;
}

export function flattenRichMessageSummary(richMessage?: RichMessage): Summary {
  return flattenRichMessage(richMessage, true);
}

/** Real rich-message text only, without UI fallback labels such as Photo or Unsupported. */
export function flattenRichMessageContent(richMessage?: RichMessage): Summary {
  return flattenRichMessage(richMessage, false);
}

// A preview cut to a length is getRichMessagePreview's (wrappers/richMessagePreview).
function flattenRichMessage(richMessage: RichMessage, includeFallbacks: boolean): Summary {
  const summary = emptySummary();
  if(richMessage) appendBlocks(summary, richMessage.blocks || [], '', includeFallbacks);
  return summary;
}

export function flattenRichMessageSummaryText(richMessage?: RichMessage) {
  return flattenRichMessageSummary(richMessage).text;
}

// a revision of a rich message is never changed in place, so its answer can be kept
const spoilersCache: WeakMap<RichMessage, boolean> = new WeakMap();

/** Whether a rich message hides any of its text behind a spoiler. */
export function hasRichMessageSpoilers(richMessage?: RichMessage) {
  if(!richMessage) return false;
  let hasSpoilers = spoilersCache.get(richMessage);
  if(hasSpoilers === undefined) {
    hasSpoilers = flattenRichMessageContent(richMessage).entities.some((entity) => entity._ === 'messageEntitySpoiler');
    spoilersCache.set(richMessage, hasSpoilers);
  }

  return hasSpoilers;
}

/**
 * Whether a rich message is as wide as a message gets, the way tdesktop lays one out: text takes the
 * width of its longest line, but a table (stretched over the width), a row of buttons, details, a
 * pullquote and media take all of it, and a quote or a list as much as what is inside. So a message
 * with one of them keeps its width whatever its text is - a bot editing it in place does not resize it.
 */
export function isRichMessageFullWidth(blocks: PageBlock[]): boolean {
  return blocks.some(isFullWidthBlock);
}

function isFullWidthBlock(block: PageBlock): boolean {
  switch(block._) {
    case 'pageBlockTitle':
    case 'pageBlockSubtitle':
    case 'pageBlockAuthorDate':
    case 'pageBlockHeader':
    case 'pageBlockSubheader':
    case 'pageBlockParagraph':
    case 'pageBlockPreformatted':
    case 'pageBlockFooter':
    case 'pageBlockKicker':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockThinking':
    case 'pageBlockMath':
    case 'pageBlockBlockquote':
    case 'pageBlockDivider':
    case 'pageBlockAnchor':
      return false;
    case 'pageBlockBlockquoteBlocks':
      return isRichMessageFullWidth(block.blocks);
    case 'pageBlockList':
      return block.items.some((item) => item._ === 'pageListItemBlocks' && isRichMessageFullWidth(item.blocks));
    case 'pageBlockOrderedList':
      return block.items.some((item) => item._ === 'pageListOrderedItemBlocks' && isRichMessageFullWidth(item.blocks));
    default:
      return true;
  }
}

/**
 * A file or an audio of a rich message: one document drawn as the document row a message's own
 * file or audio is, with its caption under it — never in a collage or a slideshow.
 */
export type DocumentRowBlock = PageBlock.pageBlockAudio | PageBlock.pageBlockDocument;

export function isDocumentRowBlock(block: PageBlock | undefined): block is DocumentRowBlock {
  return block?._ === 'pageBlockAudio' || block?._ === 'pageBlockDocument';
}

export function getDocumentRowBlockId(block: DocumentRowBlock) {
  return block._ === 'pageBlockAudio' ? block.audio_id : block.document_id;
}

/** The number an ordered list shows for its item, the one it carries or the one its place gives. */
export function getOrderedListItemNumber(block: PageBlock.pageBlockOrderedList, index: number) {
  const start = block.start ?? (block.pFlags.reversed ? block.items.length : 1);
  return block.items[index].num || `${block.pFlags.reversed ? start - index : start + index}`;
}

function emptySummary(): Summary {
  return {
    _: 'textWithEntities',
    text: '',
    entities: []
  };
}

function appendBlocks(summary: Summary, blocks: PageBlock[], prefix = '', includeFallbacks = true) {
  for(const block of blocks) {
    appendBlock(summary, block, prefix, includeFallbacks);
  }
}

function appendBlock(summary: Summary, block: PageBlock, prefix = '', includeFallbacks = true) {
  switch(block._) {
    case 'pageBlockTitle':
    case 'pageBlockSubtitle':
    case 'pageBlockHeader':
    case 'pageBlockSubheader':
    case 'pageBlockParagraph':
    case 'pageBlockPreformatted':
    case 'pageBlockFooter':
    case 'pageBlockKicker':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockThinking':
      appendRichTextLine(summary, block.text, prefix);
      break;
    case 'pageBlockMath':
      appendPlainLine(summary, block.source, prefix);
      break;
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      appendRichTextLine(summary, block.text, prefix);
      appendRichTextLine(summary, block.caption, prefix);
      break;
    case 'pageBlockBlockquoteBlocks':
      appendBlocks(summary, block.blocks, prefix, includeFallbacks);
      appendRichTextLine(summary, block.caption, prefix);
      break;
    case 'pageBlockList':
      block.items.forEach((item) => {
        const itemPrefix = prefix + '- ';
        if(item._ === 'pageListItemText') {
          appendRichTextLine(summary, item.text, itemPrefix);
        } else {
          appendBlocks(summary, item.blocks, itemPrefix, includeFallbacks);
        }
      });
      break;
    case 'pageBlockOrderedList':
      block.items.forEach((item, index) => {
        const itemPrefix = `${prefix}${getOrderedListItemNumber(block, index)}. `;
        if(item._ === 'pageListOrderedItemText') {
          appendRichTextLine(summary, item.text, itemPrefix);
        } else {
          appendBlocks(summary, item.blocks, itemPrefix, includeFallbacks);
        }
      });
      break;
    case 'pageBlockTable':
      appendRichTextLine(summary, block.title, prefix);
      for(const row of block.rows) {
        appendTextWithEntitiesLine(summary, joinRichTexts(row.cells.map((cell) => cell.text || emptyRichText), '\t'), prefix);
      }
      break;
    case 'pageBlockDetails':
      appendRichTextLine(summary, block.title, prefix);
      appendBlocks(summary, block.blocks, prefix, includeFallbacks);
      break;
    case 'pageBlockPhoto':
      appendCaptionOrFallback(summary, block.caption, 'Photo', prefix, includeFallbacks);
      break;
    case 'pageBlockVideo':
      appendCaptionOrFallback(summary, block.caption, 'Video', prefix, includeFallbacks);
      break;
    case 'pageBlockAudio':
      appendCaptionOrFallback(summary, block.caption, 'Audio', prefix, includeFallbacks);
      break;
    case 'pageBlockDocument':
      appendCaptionOrFallback(summary, block.caption, 'File', prefix, includeFallbacks);
      break;
    case 'pageBlockMap':
      appendCaptionOrFallback(summary, block.caption, 'Location', prefix, includeFallbacks);
      break;
    case 'inputPageBlockMap':
      appendCaptionOrFallback(summary, block.caption, 'Location', prefix, includeFallbacks);
      break;
    case 'pageBlockEmbed':
      appendCaptionOrFallback(summary, block.caption, 'Embed', prefix, includeFallbacks);
      break;
    case 'pageBlockEmbedPost': {
      const before = summary.text;
      appendCaptionOrFallback(summary, block.caption, 'Embed', prefix, includeFallbacks);
      if(!includeFallbacks || summary.text === before) {
        if(!includeFallbacks) appendPlainLine(summary, block.author, prefix);
        appendBlocks(summary, block.blocks, prefix, includeFallbacks);
      }
      break;
    }
    case 'pageBlockCollage':
    case 'pageBlockSlideshow': {
      const before = summary.text;
      appendCaptionOrFallback(summary, block.caption, 'Media', prefix, includeFallbacks);
      if(!includeFallbacks || summary.text === before) {
        appendBlocks(summary, block.items, prefix, includeFallbacks);
      }
      break;
    }
    case 'pageBlockCover':
      appendBlock(summary, block.cover, prefix, includeFallbacks);
      break;
    case 'pageBlockRelatedArticles':
      appendRichTextLine(summary, block.title, prefix);
      for(const article of block.articles) {
        appendPlainLine(summary, article.title, prefix);
        appendPlainLine(summary, article.description, prefix);
        if(!includeFallbacks) appendPlainLine(summary, article.author, prefix);
      }
      break;
    case 'pageBlockUnsupported':
      if(includeFallbacks) appendPlainLine(summary, 'Unsupported block', prefix);
      break;
    case 'pageBlockDivider':
    case 'pageBlockAnchor':
      break;
    case 'pageBlockChannel':
      if(!includeFallbacks && 'title' in block.channel) {
        appendPlainLine(summary, block.channel.title, prefix);
      }
      break;
    case 'pageBlockAuthorDate':
      appendRichTextLine(summary, block.author, prefix);
      break;
    case 'pageBlockButtonRow':
      appendTextWithEntitiesLine(summary, joinRichTexts(block.buttons.map((button) => button.text), ' '), prefix);
      break;
    default:
      if(includeFallbacks) appendPlainLine(summary, `Unsupported block: ${(block as PageBlock)._}`, prefix);
      break;
  }
}

function appendCaptionOrFallback(
  summary: Summary,
  caption: PageCaption,
  fallback: string,
  prefix = '',
  includeFallback = true
) {
  const before = summary.text;
  appendRichTextLine(summary, caption?.text || emptyRichText, prefix);
  if(!includeFallback) {
    appendRichTextLine(summary, caption?.credit || emptyRichText, prefix);
  }
  if(includeFallback && summary.text === before) {
    appendPlainLine(summary, fallback, prefix);
  }
}

function appendRichTextLine(summary: Summary, richText: RichText, prefix = '') {
  appendTextWithEntitiesLine(summary, wrapSummaryRichText(richText), prefix);
}

// wrapTelegramRichText carries inline math (`textMath`) as an opaque `\x02<base64>\x02` marker for the
// IV's Temml renderer. Summaries are plain text, so decode markers back to the raw LaTeX source and
// shift any following entities by the length delta so their offsets stay aligned.
export function wrapSummaryRichText(richText: RichText): TextWithEntities {
  const textWithEntities = wrapTelegramRichText(richText);
  // a summary is text: an inline button is only its label there
  textWithEntities.entities = textWithEntities.entities?.filter((entity) => entity._ !== 'messageEntityRichButton');
  const {text} = textWithEntities;
  if(!text.includes('\x02')) {
    return textWithEntities;
  }

  let out = '';
  let last = 0;
  const shifts: Array<{from: number, delta: number}> = [];
  for(const match of text.matchAll(MATH_MARKER_RE)) {
    const source = decodeInlineMath(match[1]);
    out += text.slice(last, match.index) + source;
    const markerEnd = match.index + match[0].length;
    shifts.push({from: markerEnd, delta: source.length - match[0].length});
    last = markerEnd;
  }
  out += text.slice(last);

  const shiftOffset = (offset: number) => {
    let delta = 0;
    for(const shift of shifts) {
      if(offset >= shift.from) delta += shift.delta;
    }
    return offset + delta;
  };

  return {
    _: 'textWithEntities',
    text: out,
    entities: (textWithEntities.entities || []).map((entity) => {
      const offset = shiftOffset(entity.offset);
      const end = shiftOffset(entity.offset + entity.length);
      return {
        ...entity,
        offset,
        length: Math.max(0, end - offset)
      };
    })
  };
}

function appendTextWithEntitiesLine(summary: Summary, textWithEntities: TextWithEntities, prefix = '') {
  if(!textWithEntities.text.trim()) {
    return;
  }

  const lineStart = summary.text ? summary.text.length + 1 : 0;
  if(summary.text) {
    summary.text += '\n';
  }

  summary.text += prefix + textWithEntities.text;
  appendEntities(summary, textWithEntities.entities, lineStart + prefix.length);
}

function appendPlainLine(summary: Summary, text: string, prefix = '') {
  if(!text?.trim()) {
    return;
  }

  appendTextWithEntitiesLine(summary, {
    _: 'textWithEntities',
    text,
    entities: []
  }, prefix);
}

function appendEntities(summary: Summary, entities: MessageEntity[], offset: number) {
  for(const entity of entities || []) {
    summary.entities.push({
      ...entity,
      offset: entity.offset + offset
    });
  }
}

function joinRichTexts(texts: RichText[], separator: string): TextWithEntities {
  return joinTexts(texts.map(wrapSummaryRichText), separator);
}

function joinTexts(texts: TextWithEntities[], separator: string): Summary {
  const joined = emptySummary();
  for(const [index, textWithEntities] of texts.entries()) {
    const offset = joined.text.length + (index ? separator.length : 0);
    if(index) {
      joined.text += separator;
    }

    joined.text += textWithEntities.text;
    appendEntities(joined, textWithEntities.entities, offset);
  }

  return joined;
}

const PLAIN_MESSAGE_DIVIDER = '——————————';
const PLAIN_MESSAGE_TABLE_CELL_SEPARATOR = '  |  ';

/**
 * A rich message as a plain one, for a sender who may not post rich text. What a plain message
 * carries stays — bold, links, code, a quote with its author; a heading turns bold and a formula
 * code, a list and a table are written out as text, and a picture leaves its caption. Android's
 * conversion (RichMessageConvert) does the same. Entities only a rich message carries (a highlight,
 * an index) are left for the receiving field to drop.
 */
export function richMessageToPlainMessage(richMessage: RichMessage): Summary {
  const plain = joinTexts(plainMessageBlocks(richMessage.blocks || []), '\n');
  sortEntities(plain.entities);
  return plain;
}

function plainMessageBlocks(blocks: PageBlock[], depth = 0) {
  return blocks.map((block) => plainMessageBlock(block, depth)).filter(Boolean);
}

function plainMessageBlock(block: PageBlock, depth: number): Summary | undefined {
  switch(block._) {
    case 'pageBlockParagraph':
    case 'pageBlockFooter':
    case 'pageBlockKicker':
    case 'pageBlockThinking':
      return wrapSummaryRichText(block.text);
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
      return withWholeEntity(wrapSummaryRichText(block.text), (length) => ({_: 'messageEntityBold', offset: 0, length}));
    case 'pageBlockPreformatted':
      return withWholeEntity(wrapSummaryRichText(block.text), (length) => ({_: 'messageEntityPre', offset: 0, length, language: block.language || ''}));
    case 'pageBlockMath':
      return withWholeEntity(plainText(block.source), (length) => ({_: 'messageEntityCode', offset: 0, length}));
    case 'pageBlockDivider':
      return plainText(PLAIN_MESSAGE_DIVIDER);
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      return quotedPlainMessage(wrapSummaryRichText(block.text), block.caption);
    case 'pageBlockBlockquoteBlocks':
      return quotedPlainMessage(joinTexts(plainMessageBlocks(block.blocks, depth), '\n'), block.caption);
    case 'pageBlockDetails':
      return joinTexts(nonEmpty([wrapSummaryRichText(block.title), ...plainMessageBlocks(block.blocks, depth)]), '\n');
    case 'pageBlockList':
    case 'pageBlockOrderedList':
      return joinTexts(block.items.map((item, index) => {
        const content = 'text' in item ?
          wrapSummaryRichText(item.text) :
          joinTexts(plainMessageBlocks(item.blocks, depth + 1), '\n');
        return prefixedText('  '.repeat(depth) + plainMessageListMarker(block, index), content);
      }), '\n');
    case 'pageBlockTable':
      return joinTexts(nonEmpty([
        wrapSummaryRichText(block.title),
        ...block.rows.map((row) => joinRichTexts(row.cells.map((cell) => cell.text || emptyRichText), PLAIN_MESSAGE_TABLE_CELL_SEPARATOR))
      ]), '\n');
    case 'pageBlockAuthorDate':
      return wrapSummaryRichText(block.author);
    case 'pageBlockCover':
      return plainMessageBlock(block.cover, depth);
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
    case 'pageBlockDocument':
    case 'pageBlockMap':
    case 'inputPageBlockMap':
    case 'pageBlockEmbed':
    case 'pageBlockEmbedPost':
    case 'pageBlockCollage':
    case 'pageBlockSlideshow': {
      const caption = joinTexts(nonEmpty([block.caption?.text, block.caption?.credit].map((text) => wrapSummaryRichText(text || emptyRichText))), '\n');
      return caption.text ? caption : undefined;
    }
  }
}

function plainMessageListMarker(block: PageBlock.pageBlockList | PageBlock.pageBlockOrderedList, index: number) {
  const item = block.items[index];
  const {checkbox, checked} = item.pFlags;
  if(block._ === 'pageBlockList') {
    return formatListItemMarker({ordered: false, checkbox, checked});
  }

  const number = getOrderedListItemNumber(block, index);
  const value = Number(number);
  return formatListItemMarker({
    ordered: true,
    ...(Number.isInteger(value) ?
      {value, type: (item as PageListOrderedItem).type || block.type} :
      {num: number}),
    checkbox,
    checked
  });
}

function quotedPlainMessage(body: Summary, author: RichText) {
  const authorText = wrapSummaryRichText(author || emptyRichText);
  const quote = joinTexts(nonEmpty([
    body,
    authorText.text ? prefixedText('— ', authorText) : undefined
  ]), '\n');
  if(!quote.text) return;
  return withWholeEntity(quote, (length) => ({_: 'messageEntityBlockquote', offset: 0, length, pFlags: {}}));
}

// the entity over the whole text takes in the ones of its kind inside it: a bold heading's own bold
// would be a second bold over the same letters, a quote in a quote one a plain message cannot hold
function withWholeEntity(textWithEntities: TextWithEntities, entity: (length: number) => MessageEntity): Summary | undefined {
  if(!textWithEntities.text) return;
  const whole = entity(textWithEntities.text.length);
  return {
    _: 'textWithEntities',
    text: textWithEntities.text,
    entities: [whole, ...textWithEntities.entities.filter((inner) => inner._ !== whole._)]
  };
}

function prefixedText(prefix: string, textWithEntities: TextWithEntities): Summary {
  return joinTexts([plainText(prefix), textWithEntities], '');
}

function plainText(text: string): Summary {
  return {_: 'textWithEntities', text: text || '', entities: []};
}

function nonEmpty(texts: TextWithEntities[]) {
  return texts.filter((text) => text?.text);
}
