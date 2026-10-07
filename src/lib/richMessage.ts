import {MessageEntity, Page, PageBlock, PageCaption, RichMessage, RichText, TextWithEntities} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
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
  const joined = emptySummary();
  for(const [index, text] of texts.entries()) {
    const textWithEntities = wrapSummaryRichText(text);
    const offset = joined.text.length + (index ? separator.length : 0);
    if(index) {
      joined.text += separator;
    }

    joined.text += textWithEntities.text;
    appendEntities(joined, textWithEntities.entities, offset);
  }

  return joined;
}
