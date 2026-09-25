import hasRichTextContent from '@lib/richTextProcessor/hasRichTextContent';
import type {InlineButtonType, InputRichMessage, PageBlock, PageCaption, PageTableCell, PageTableRow, RichText} from '@layer';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';
import {TLSerialization} from '@lib/mtproto/tl_utils';
import emojiRegExp from '@vendor/emoji/regex';
import {getOrderedListTypePresentation} from '@lib/richTextProcessor/orderedList';

export type RichMessageLimits = {
  lengthLimit: number,
  maxBlocks: number,
  maxDepth: number,
  maxMedia: number,
  maxTableColumns: number,
  serializedSizeLimit: number
};

export type RichMessageMetrics = {
  textLength: number,
  blockCount: number,
  maxDepth: number,
  mediaCount: number,
  maxTableColumns: number,
  tableConflict: boolean,
  serializedSize: number
};

export type RichMessageLimitError =
  'length' |
  'blocks' |
  'depth' |
  'media' |
  'tableColumns' |
  'size' |
  'empty' |
  'content' |
  'unsupported' |
  'invalid';

export type RichMessageValidationOptions = {
  draft?: boolean,
  streaming?: boolean
};

export type RichMessageValidationResult = {
  valid: boolean,
  error?: RichMessageLimitError,
  metrics: RichMessageMetrics,
  limits: RichMessageLimits
};

export type RichMessageLimitAppConfig = Pick<
  MTAppConfig,
  'rich_message_length_limit' |
  'rich_message_max_blocks' |
  'rich_message_max_depth' |
  'rich_message_max_media' |
  'rich_message_max_table_cols'
>;

export type RichMessageBlocksSource =
  PageBlock[] |
  Pick<InputRichMessage.inputRichMessage, 'blocks'>;

export const DEFAULT_RICH_MESSAGE_LIMITS: Readonly<RichMessageLimits> = Object.freeze({
  lengthLimit: 32768,
  maxBlocks: 500,
  maxDepth: 16,
  maxMedia: 50,
  maxTableColumns: 20,
  serializedSizeLimit: 256 * 1024
});

function configLimit(value: number, fallback: number) {
  return typeof(value) === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function resolveRichMessageLimits(
  appConfig: Partial<RichMessageLimitAppConfig> = {}
): RichMessageLimits {
  return {
    lengthLimit: configLimit(appConfig.rich_message_length_limit, DEFAULT_RICH_MESSAGE_LIMITS.lengthLimit),
    maxBlocks: configLimit(appConfig.rich_message_max_blocks, DEFAULT_RICH_MESSAGE_LIMITS.maxBlocks),
    maxDepth: configLimit(appConfig.rich_message_max_depth, DEFAULT_RICH_MESSAGE_LIMITS.maxDepth),
    maxMedia: configLimit(appConfig.rich_message_max_media, DEFAULT_RICH_MESSAGE_LIMITS.maxMedia),
    maxTableColumns: configLimit(appConfig.rich_message_max_table_cols, DEFAULT_RICH_MESSAGE_LIMITS.maxTableColumns),
    serializedSizeLimit: DEFAULT_RICH_MESSAGE_LIMITS.serializedSizeLimit
  };
}

function addRichTextMetrics(text: RichText | undefined, depth: number, metrics: RichMessageMetrics): number {
  if(!text) return 0;
  metrics.maxDepth = Math.max(metrics.maxDepth, depth);

  switch(text._) {
    case 'textEmpty':
      return 0;
    case 'textPlain':
      return text.text.length;
    case 'textConcat':
      return text.texts.reduce(
        (length, child) => length + addRichTextMetrics(child, depth + 1, metrics),
        0
      );
    case 'textImage':
      return 0;
    case 'textMath':
      return text.source.length;
    case 'textCustomEmoji':
      return text.alt.length;
    case 'textDiff':
    case 'textButton':
      return addRichTextMetrics(text.text, depth + 1, metrics);
    case 'textBold':
    case 'textItalic':
    case 'textUnderline':
    case 'textStrike':
    case 'textFixed':
    case 'textUrl':
    case 'textEmail':
    case 'textSubscript':
    case 'textSuperscript':
    case 'textMarked':
    case 'textPhone':
    case 'textAnchor':
    case 'textSpoiler':
    case 'textMention':
    case 'textHashtag':
    case 'textBotCommand':
    case 'textCashtag':
    case 'textAutoUrl':
    case 'textAutoEmail':
    case 'textAutoPhone':
    case 'textBankCard':
    case 'textMentionName':
    case 'textDate':
      return addRichTextMetrics(text.text, depth + 1, metrics);
  }
}

function addCaptionMetrics(caption: PageCaption | undefined, depth: number, metrics: RichMessageMetrics) {
  if(!caption) return 0;
  return addRichTextMetrics(caption.text, depth, metrics) +
    addRichTextMetrics(caption.credit, depth, metrics);
}

function tableColumnMeasurementLimit(maxTableColumns: number) {
  if(maxTableColumns <= 0) return 1;
  return maxTableColumns >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : maxTableColumns + 1;
}

type TableInterval = {start: number, end: number};

function tableSpan(value?: number) {
  if(value === undefined) return {valid: true, value: 1};
  const valid = Number.isInteger(value) && value > 0 && value <= 0x7FFFFFFF;
  return {
    valid,
    value: valid ? value : 1
  };
}

function intervalOverlaps(interval: TableInterval, start: number, end: number) {
  return interval.start < end && start < interval.end;
}

function firstFreeTableColumn(intervals: TableInterval[], start: number) {
  let column = start;
  for(const interval of intervals) {
    if(interval.start > column) break;
    if(interval.end > column) column = interval.end;
  }
  return column;
}

function measureTableLayout(rows: PageTableRow[], maxColumns: number) {
  const occupancy = rows.map(() => [] as TableInterval[]);
  let columns = 0;
  let conflict = false;

  for(let rowIndex = 0; rowIndex < rows.length; ++rowIndex) {
    let column = 0;
    for(const cell of rows[rowIndex].cells) {
      column = firstFreeTableColumn(occupancy[rowIndex], column);
      const colspan = tableSpan(cell.colspan);
      const rowspan = tableSpan(cell.rowspan);
      if(!colspan.valid || !rowspan.valid) conflict = true;

      const end = Math.min(Number.MAX_SAFE_INTEGER, column + colspan.value);
      const rowLimit = Math.min(rows.length, rowIndex + rowspan.value);
      for(let occupiedRow = rowIndex; occupiedRow < rowLimit; ++occupiedRow) {
        const intervals = occupancy[occupiedRow];
        if(intervals.some((interval) => intervalOverlaps(interval, column, end))) {
          conflict = true;
        }
        intervals.push({start: column, end});
        intervals.sort((left, right) => left.start - right.start);
      }

      columns = Math.max(columns, Math.min(end, maxColumns));
      column = end;
    }
  }

  return {columns, conflict};
}

function addTableMetrics(
  rows: PageTableRow[],
  depth: number,
  metrics: RichMessageMetrics,
  maxColumns: number
) {
  metrics.blockCount += rows.length;
  rows.forEach((row) => row.cells.forEach((cell: PageTableCell) => {
    metrics.textLength += addRichTextMetrics(cell.text, depth + 1, metrics);
  }));
  const layout = measureTableLayout(rows, maxColumns);
  metrics.maxTableColumns = Math.max(
    metrics.maxTableColumns,
    layout.columns
  );
  metrics.tableConflict ||= layout.conflict;
}

function addBlocksMetrics(
  blocks: PageBlock[],
  depth: number,
  metrics: RichMessageMetrics,
  tableColumnsLimit: number
) {
  blocks.forEach((block) => addBlockMetrics(block, depth, metrics, tableColumnsLimit));
}

function addBlockMetrics(
  block: PageBlock,
  depth: number,
  metrics: RichMessageMetrics,
  tableColumnsLimit: number
) {
  // Desktop treats a cover as a presentation wrapper around its inner block.
  if(block._ === 'pageBlockCover') {
    addBlockMetrics(block.cover, depth, metrics, tableColumnsLimit);
    return;
  }

  ++metrics.blockCount;
  metrics.maxDepth = Math.max(metrics.maxDepth, depth);

  // A top-level PageBlock and the root RichText values stored directly on it
  // are both at depth 0. Only recursive PageBlock/RichText edges increase the
  // depth. List items and table rows count as blocks, so their text starts one
  // level below the containing list/table.
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
      metrics.textLength += addRichTextMetrics(block.text, depth, metrics);
      return;
    case 'pageBlockAuthorDate':
      metrics.textLength += addRichTextMetrics(block.author, depth, metrics);
      return;
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      metrics.textLength += addRichTextMetrics(block.text, depth, metrics) +
        addRichTextMetrics(block.caption, depth, metrics);
      return;
    case 'pageBlockBlockquoteBlocks':
      metrics.textLength += addRichTextMetrics(block.caption, depth, metrics);
      addBlocksMetrics(block.blocks, depth + 1, metrics, tableColumnsLimit);
      return;
    case 'pageBlockDetails':
      metrics.textLength += addRichTextMetrics(block.title, depth, metrics);
      addBlocksMetrics(block.blocks, depth + 1, metrics, tableColumnsLimit);
      return;
    case 'pageBlockEmbedPost':
      metrics.textLength += addCaptionMetrics(block.caption, depth, metrics);
      addBlocksMetrics(block.blocks, depth + 1, metrics, tableColumnsLimit);
      return;
    case 'pageBlockList':
      metrics.blockCount += block.items.length;
      block.items.forEach((item) => {
        if(item._ === 'pageListItemText') {
          metrics.textLength += addRichTextMetrics(item.text, depth + 1, metrics);
        } else {
          addBlocksMetrics(item.blocks, depth + 1, metrics, tableColumnsLimit);
        }
      });
      return;
    case 'pageBlockOrderedList':
      metrics.blockCount += block.items.length;
      block.items.forEach((item) => {
        if(item._ === 'pageListOrderedItemText') {
          metrics.textLength += addRichTextMetrics(item.text, depth + 1, metrics);
        } else {
          addBlocksMetrics(item.blocks, depth + 1, metrics, tableColumnsLimit);
        }
      });
      return;
    case 'pageBlockTable':
      metrics.textLength += addRichTextMetrics(block.title, depth, metrics);
      addTableMetrics(block.rows, depth, metrics, tableColumnsLimit);
      return;
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
    case 'pageBlockDocument':
      ++metrics.mediaCount;
      metrics.textLength += addCaptionMetrics(block.caption, depth, metrics);
      return;
    case 'pageBlockButtonRow':
      block.buttons.forEach((button) => {
        metrics.textLength += addRichTextMetrics(button.text, depth + 1, metrics);
      });
      return;
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      addBlocksMetrics(block.items, depth + 1, metrics, tableColumnsLimit);
      metrics.textLength += addCaptionMetrics(block.caption, depth, metrics);
      return;
    case 'pageBlockEmbed':
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      metrics.textLength += addCaptionMetrics(block.caption, depth, metrics);
      return;
    case 'pageBlockRelatedArticles':
      metrics.textLength += addRichTextMetrics(block.title, depth, metrics);
      return;
    case 'pageBlockMath':
      metrics.textLength += block.source.length;
      return;
    case 'pageBlockUnsupported':
    case 'pageBlockDivider':
    case 'pageBlockAnchor':
    case 'pageBlockChannel':
      return;
  }
}

const INPUT_BLOCKS = new Set<PageBlock['_']>([
  'pageBlockParagraph',
  'pageBlockHeading1',
  'pageBlockHeading2',
  'pageBlockHeading3',
  'pageBlockHeading4',
  'pageBlockHeading5',
  'pageBlockHeading6',
  'pageBlockPreformatted',
  'pageBlockFooter',
  'pageBlockDivider',
  'pageBlockAnchor',
  'pageBlockList',
  'pageBlockOrderedList',
  'pageBlockBlockquote',
  'pageBlockBlockquoteBlocks',
  'pageBlockPullquote',
  'pageBlockPhoto',
  'pageBlockVideo',
  'pageBlockAudio',
  'pageBlockCollage',
  'pageBlockSlideshow',
  'pageBlockTable',
  'pageBlockDetails',
  'inputPageBlockMap',
  'pageBlockMath',
  'pageBlockThinking',
  'pageBlockButtonRow'
]);

const SINGLE_EMOJI_REG_EXP = new RegExp(`^(?:${emojiRegExp})$`);
const DATE_FORMAT_FLAGS = new Set([
  'relative',
  'short_time',
  'long_time',
  'short_date',
  'long_date',
  'day_of_week'
]);

function richTextContentLength(text?: RichText): number {
  if(!text) return 0;
  switch(text._) {
    case 'textEmpty':
      return 0;
    case 'textPlain':
      return text.text.length;
    case 'textMath':
      return text.source.length;
    case 'textCustomEmoji':
      return text.alt.length;
    case 'textImage':
      return 0;
    case 'textConcat':
      return text.texts.reduce((length, child) => length + richTextContentLength(child), 0);
    case 'textDiff':
      return richTextContentLength(text.text);
    default:
      return richTextContentLength(text.text);
  }
}

function validTextUrl(url: string) {
  if(!url) return false;
  if(/[\u0000-\u0020\u007F]/.test(url)) return false;
  if(url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
  try {
    return ['http:', 'https:', 'tg:', 'tonsite:'].includes(new URL(url, 'https://t.me').protocol);
  } catch{
    return false;
  }
}

function validPositiveLong(value: string | number) {
  if(typeof(value) === 'number') return Number.isSafeInteger(value) && value > 0;
  if(!/^[1-9][0-9]*$/.test(value)) return false;
  const maxLong = '9223372036854775807';
  return value.length < maxLong.length || value.length === maxLong.length && value <= maxLong;
}

function validDateFormat(pFlags: RichText.textDate['pFlags']) {
  if(!pFlags || typeof(pFlags) !== 'object') return false;
  for(const [name, value] of Object.entries(pFlags)) {
    if(!DATE_FORMAT_FLAGS.has(name) || value !== undefined && value !== true) return false;
  }
  return !(pFlags.short_time && pFlags.long_time) &&
    !(pFlags.short_date && pFlags.long_date);
}

function hasDateFormat(pFlags: RichText.textDate['pFlags']) {
  return [...DATE_FORMAT_FLAGS].some((name) => pFlags[name as keyof typeof pFlags]);
}

/**
 * What a user may put on a button in a message of their own — a link, text to copy, someone's
 * profile, or nothing (desktop and WebA offer the same four). The rest act on a bot's message.
 */
function validateAuthoredButtonType(type: InlineButtonType): RichMessageLimitError | undefined {
  switch(type._) {
    case 'inlineButtonTypeUrl':
      return validTextUrl(type.url) ? undefined : 'invalid';
    case 'inlineButtonTypeCopy':
      return type.copy_text ? undefined : 'invalid';
    case 'inlineButtonTypeUserProfile':
      return validPositiveLong(type.user_id) ? undefined : 'invalid';
    case 'inputInlineButtonTypeUserProfile':
    case 'inlineButtonTypeDisabled':
      return;
    default:
      return 'unsupported';
  }
}

function validateRichButton(
  button: {text: RichText, type: InlineButtonType},
  options: RichMessageValidationOptions
): RichMessageLimitError | undefined {
  return validateAuthoredButtonType(button.type) || validateRequiredRichText(button.text, options);
}

function validateRichTextStructure(text: RichText): RichMessageLimitError | undefined {
  switch(text._) {
    case 'textEmpty':
    case 'textPlain':
      return;
    case 'textButton':
      return validateRichButton(text, {draft: true});
    case 'textImage':
    case 'textDiff':
      return 'unsupported';
    case 'textMention':
    case 'textHashtag':
    case 'textBotCommand':
    case 'textCashtag':
    case 'textAutoUrl':
    case 'textAutoEmail':
    case 'textAutoPhone':
    case 'textBankCard':
      return 'invalid';
    case 'textUrl':
      if(!validTextUrl(text.url)) return 'invalid';
      return validateRichTextStructure(text.text);
    case 'textEmail':
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.email)) return 'invalid';
      return validateRichTextStructure(text.text);
    case 'textPhone':
      if(!/^\+?[0-9 ()-]{3,}$/.test(text.phone)) return 'invalid';
      return validateRichTextStructure(text.text);
    case 'textAnchor':
      if(!text.name) return 'invalid';
      return validateRichTextStructure(text.text);
    case 'textMath':
      return text.source.trim() ? undefined : 'content';
    case 'textCustomEmoji':
      if(!validPositiveLong(text.document_id)) return 'invalid';
      return !text.alt || SINGLE_EMOJI_REG_EXP.test(text.alt) ? undefined : 'invalid';
    case 'textDate':
      if(
        !Number.isInteger(text.date) ||
        text.date < 0 ||
        text.date > Date.now() / 1000 + 3 * 366 * 86400
      ) return 'invalid';
      if(!validDateFormat(text.pFlags)) return 'invalid';
      if(richTextContentLength(text.text) > (hasDateFormat(text.pFlags) ? 32 : 128)) {
        return 'invalid';
      }
      return validateRichTextStructure(text.text);
    case 'textMentionName':
      if(text.user_id === undefined || text.user_id === null) return 'invalid';
      return validateRichTextStructure(text.text);
    case 'textConcat':
      for(const child of text.texts) {
        const error = validateRichTextStructure(child);
        if(error) return error;
      }
      return;
    default:
      return validateRichTextStructure(text.text);
  }
}

function validateCaption(caption?: PageCaption) {
  if(!caption) return;
  return validateRichTextStructure(caption.text) || validateRichTextStructure(caption.credit);
}

function validTlInt(value: number) {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7FFFFFFF;
}

function validInputMap(block: PageBlock.inputPageBlockMap) {
  if(block.geo._ !== 'inputGeoPoint') return false;
  const {accuracy_radius, lat, long} = block.geo;
  return (
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(long) &&
    Math.abs(long) <= 180 &&
    (
      accuracy_radius === undefined ||
      validTlInt(accuracy_radius) && accuracy_radius >= 0
    ) &&
    validTlInt(block.zoom) &&
    block.zoom > 0 &&
    validTlInt(block.w) &&
    block.w > 0 &&
    validTlInt(block.h) &&
    block.h > 0
  );
}

function validOrderedListType(value?: string) {
  return value === undefined || !!getOrderedListTypePresentation(value);
}

function validateRequiredRichText(
  text: RichText,
  options: RichMessageValidationOptions
): RichMessageLimitError | undefined {
  const error = validateRichTextStructure(text);
  if(error) return error;
  if(!options.draft && !hasRichTextContent(text)) return 'content';
}

function validateListItem(
  item: PageBlock.pageBlockList['items'][number] | PageBlock.pageBlockOrderedList['items'][number],
  options: RichMessageValidationOptions
): RichMessageLimitError | undefined {
  if('num' in item && item.num !== undefined) return 'invalid';
  if('value' in item && item.value !== undefined && !validTlInt(item.value)) return 'invalid';
  if('type' in item && !validOrderedListType(item.type)) return 'invalid';
  if(item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText') {
    return validateRichTextStructure(item.text);
  }
  return validateBlocksStructure(item.blocks, options, true);
}

function validateBlockStructure(
  block: PageBlock,
  options: RichMessageValidationOptions,
  allowEmptyParagraph = false
): RichMessageLimitError | undefined {
  if(block._ === 'pageBlockMap') return 'invalid';
  if(!INPUT_BLOCKS.has(block._)) return 'unsupported';
  if(block._ === 'pageBlockThinking' && !options.streaming) return 'unsupported';

  switch(block._) {
    case 'pageBlockParagraph': {
      const error = validateRichTextStructure(block.text);
      if(error) return error;
      if(!options.draft && !allowEmptyParagraph && !hasRichTextContent(block.text)) return 'content';
      return;
    }
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockPreformatted':
    case 'pageBlockFooter':
    case 'pageBlockThinking':
      return validateRequiredRichText(block.text, options);
    case 'pageBlockAnchor':
      return block.name ? undefined : 'invalid';
    case 'pageBlockDivider':
      return;
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
      return validateCaption(block.caption);
    case 'inputPageBlockMap':
      return validInputMap(block) ? validateCaption(block.caption) : 'invalid';
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote': {
      const error = validateRichTextStructure(block.text) || validateRichTextStructure(block.caption);
      if(error) return error;
      if(!options.draft && !hasRichTextContent(block.text)) return 'content';
      return;
    }
    case 'pageBlockBlockquoteBlocks': {
      const error = validateRichTextStructure(block.caption);
      return error || validateBlocksStructure(block.blocks, options, true);
    }
    case 'pageBlockDetails': {
      const error = validateRichTextStructure(block.title);
      return error || validateBlocksStructure(block.blocks, options, true);
    }
    case 'pageBlockList':
    case 'pageBlockOrderedList':
      if(!options.draft && !block.items.length) return 'content';
      if(block._ === 'pageBlockOrderedList') {
        if(block.start !== undefined && !validTlInt(block.start)) return 'invalid';
        if(!validOrderedListType(block.type)) return 'invalid';
      }
      for(const item of block.items) {
        const error = validateListItem(item, options);
        if(error) return error;
      }
      return;
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      if(!options.draft && !block.items.length) return 'content';
      if(
        block._ === 'pageBlockCollage' &&
        block.items.length > MESSAGES_ALBUM_MAX_SIZE
      ) return 'invalid';
      {
        const error = validateCaption(block.caption);
        if(error) return error;
      }
      if(block.items.some((item) => item._ !== 'pageBlockPhoto' && item._ !== 'pageBlockVideo')) {
        return 'invalid';
      }
      for(const item of block.items) {
        const error = validateBlockStructure(item, options);
        if(error) return error;
      }
      return;
    case 'pageBlockTable':
      if(!options.draft && (!block.rows.length || block.rows.some((row) => !row.cells.length))) return 'content';
      {
        const error = validateRichTextStructure(block.title);
        if(error) return error;
      }
      for(const row of block.rows) {
        for(const cell of row.cells) {
          if(
            !tableSpan(cell.colspan).valid ||
            !tableSpan(cell.rowspan).valid ||
            cell.pFlags.align_center && cell.pFlags.align_right ||
            cell.pFlags.valign_middle && cell.pFlags.valign_bottom
          ) return 'invalid';
          if(cell.text) {
            const error = validateRichTextStructure(cell.text);
            if(error) return error;
          }
        }
      }
      return;
    case 'pageBlockMath':
      return block.source.trim() ? undefined : 'content';
    case 'pageBlockButtonRow': {
      const {align_left, align_center, align_right} = block.pFlags;
      if(+!!align_left + +!!align_center + +!!align_right > 1) return 'invalid';
      if(!block.buttons.length) return 'content';
      for(const button of block.buttons) {
        const error = validateRichButton(button, options);
        if(error) return error;
      }
      return;
    }
    default:
      return 'unsupported';
  }
}

function validateBlocksStructure(
  blocks: PageBlock[],
  options: RichMessageValidationOptions,
  requireContent = false
): RichMessageLimitError | undefined {
  if(!options.draft && requireContent && !blocks.length) return 'content';
  for(let index = 0; index < blocks.length; ++index) {
    const block = blocks[index];
    const error = validateBlockStructure(
      block,
      options,
      block._ === 'pageBlockParagraph' && index > 0 && index < blocks.length - 1
    );
    if(error) return error;
  }
}

function serializedBlocksSize(blocks: PageBlock[]) {
  try {
    const serializer = new TLSerialization();
    serializer.storeObject(blocks, 'Vector<PageBlock>', 'rich_message.blocks');
    return serializer.getOffset();
  } catch{
    return Number.POSITIVE_INFINITY;
  }
}

function sourceBlocks(source: RichMessageBlocksSource) {
  return Array.isArray(source) ? source : source.blocks;
}

export function measureRichMessage(
  source: RichMessageBlocksSource,
  limits: RichMessageLimits = DEFAULT_RICH_MESSAGE_LIMITS
): RichMessageMetrics {
  const metrics: RichMessageMetrics = {
    textLength: 0,
    blockCount: 0,
    maxDepth: 0,
    mediaCount: 0,
    maxTableColumns: 0,
    tableConflict: false,
    serializedSize: 0
  };
  const blocks = sourceBlocks(source);
  addBlocksMetrics(
    blocks,
    0,
    metrics,
    tableColumnMeasurementLimit(limits.maxTableColumns)
  );
  metrics.serializedSize = serializedBlocksSize(blocks);
  return metrics;
}

export function validateRichMessage(
  source: RichMessageBlocksSource,
  limits: RichMessageLimits = DEFAULT_RICH_MESSAGE_LIMITS,
  options: RichMessageValidationOptions = {}
): RichMessageValidationResult {
  const blocks = sourceBlocks(source);
  const metrics = measureRichMessage(source, limits);
  const structureError = !options.draft && !blocks.length ? 'empty' :
    validateBlocksStructure(blocks, options);
  const error: RichMessageLimitError = metrics.textLength > limits.lengthLimit ? 'length' :
    metrics.blockCount > limits.maxBlocks ? 'blocks' :
    metrics.maxDepth > limits.maxDepth ? 'depth' :
    metrics.mediaCount > limits.maxMedia ? 'media' :
    metrics.maxTableColumns > limits.maxTableColumns ? 'tableColumns' :
    metrics.serializedSize > limits.serializedSizeLimit ? 'size' :
    metrics.tableConflict ? 'invalid' :
    structureError;

  return {
    valid: !error,
    error,
    metrics,
    limits: {...limits}
  };
}
