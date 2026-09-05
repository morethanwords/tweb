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

export function flattenRichMessageSummary(richMessage?: RichMessage, maxLength = 100): Summary {
  return flattenRichMessage(richMessage, maxLength, true);
}

/** Real rich-message text only, without UI fallback labels such as Photo or Unsupported. */
export function flattenRichMessageContent(richMessage?: RichMessage, maxLength = 0): Summary {
  return flattenRichMessage(richMessage, maxLength, false);
}

function flattenRichMessage(richMessage: RichMessage, maxLength: number, includeFallbacks: boolean): Summary {
  if(!richMessage) {
    return emptySummary();
  }

  const summary = emptySummary();
  appendBlocks(summary, richMessage.blocks || [], '', includeFallbacks);

  if(maxLength && summary.text.length > maxLength) {
    // Hard-truncate to maxLength. Don't use limitSymbols() here: it trims *leading* whitespace,
    // which would shift every entity offset out of alignment (and its soft +10 slack means it
    // wouldn't actually cut at maxLength). trimEnd() only can't move earlier offsets. Clamp entities
    // to the cut boundary (before the ellipsis) so none spills over.
    const truncated = summary.text.slice(0, maxLength).trimEnd();
    summary.text = truncated + '...';
    summary.entities = summary.entities.filter((entity) => entity.offset < truncated.length);
    for(const entity of summary.entities) {
      entity.length = Math.min(entity.length, truncated.length - entity.offset);
    }
  }

  return summary;
}

export function flattenRichMessageSummaryText(richMessage?: RichMessage, maxLength?: number) {
  return flattenRichMessageSummary(richMessage, maxLength).text;
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
        const start = block.start ?? (block.pFlags.reversed ? block.items.length : 1);
        const num = item.num || `${block.pFlags.reversed ? start - index : start + index}`;
        const itemPrefix = `${prefix}${num}. `;
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
        appendTextWithEntitiesLine(summary, joinCells(row.cells.map((cell) => cell.text || emptyRichText)), prefix);
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
function wrapSummaryRichText(richText: RichText): TextWithEntities {
  const textWithEntities = wrapTelegramRichText(richText);
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

function joinCells(cells: RichText[]): TextWithEntities {
  const joined = emptySummary();
  for(const [index, cell] of cells.entries()) {
    const textWithEntities = wrapSummaryRichText(cell);
    const offset = joined.text.length + (index ? 1 : 0);
    if(index) {
      joined.text += '\t';
    }

    joined.text += textWithEntities.text;
    appendEntities(joined, textWithEntities.entities, offset);
  }

  return joined;
}
