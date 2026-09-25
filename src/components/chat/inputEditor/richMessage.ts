import hasRichTextContent from '@lib/richTextProcessor/hasRichTextContent';
import concatRichText from '@lib/richTextProcessor/concatRichText';
import {inputPageBlock, inputRichText} from '@lib/richTextProcessor/inputRichMessageBlocks';
import type {JSONContent} from '@tiptap/core';
import type {
  Document,
  InputRichMessage,
  PageBlock,
  PageButton,
  PageListItem,
  PageListOrderedItem,
  PageTableCell,
  PageTableRow,
  Photo,
  RichMessage,
  RichText
} from '@layer';
import checkRTL from '@helpers/string/checkRTL';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import getPhotoInput from '@appManagers/utils/photos/getPhotoInput';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';
import {
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import {getEffectiveCodeBlockLanguage} from '@components/chat/inputEditor/codeLanguage';
import {
  BUTTON_ROW_NODE_NAME,
  MAX_BUTTONS_PER_ROW,
  RICH_BUTTON_NODE_NAME,
  getButtonRowAlign,
  richButtonAttributes,
  richButtonFromAttributes,
  richButtonFromInlineType,
  richButtonInlineType,
  richButtonLabelText,
  richButtonStyle
} from '@components/chat/inputEditor/richButtonModel';
import {getPageButtonRowAlign} from '@components/wrappers/buttonTypes';

type RichMessageDocumentOptions = {
  draft?: boolean,
  noAutolink?: boolean,
  rtl?: boolean
};

type StructuredRichMessage = InputRichMessage.inputRichMessage | RichMessage.richMessage;

export type TiptapRichMessageDocument = {
  input: InputRichMessage.inputRichMessage,
  output: RichMessage.richMessage
};

const EMPTY_RICH_TEXT: RichText.textEmpty = {_: 'textEmpty'};

function emptyPageCaption() {
  return {
    _: 'pageCaption' as const,
    text: EMPTY_RICH_TEXT,
    credit: EMPTY_RICH_TEXT
  };
}

export function splitOversizedRichMediaCollage(
  block: PageBlock.pageBlockCollage
): Array<
  PageBlock.pageBlockCollage |
  PageBlock.pageBlockPhoto |
  PageBlock.pageBlockVideo
> {
  if(block.items.length <= MESSAGES_ALBUM_MAX_SIZE) return [block];

  const chunks = Array.from(
    {length: Math.ceil(block.items.length / MESSAGES_ALBUM_MAX_SIZE)},
    (_value, index) => block.items.slice(
      index * MESSAGES_ALBUM_MAX_SIZE,
      (index + 1) * MESSAGES_ALBUM_MAX_SIZE
    )
  );
  return chunks.map((items, index) => {
    const caption = index === chunks.length - 1 ? block.caption : emptyPageCaption();
    const item = items[0];
    return items.length === 1 && (item._ === 'pageBlockPhoto' || item._ === 'pageBlockVideo') ?
      {...item, caption} :
      {...block, items, caption};
  });
}

function plainRichText(text: string): RichText {
  return text ? {_: 'textPlain', text} : EMPTY_RICH_TEXT;
}


function dateFlags(value: unknown): RichText.textDate['pFlags'] {
  if(!value || typeof(value) !== 'object') return {};
  const flags = value as RichText.textDate['pFlags'];
  return {
    relative: flags.relative || undefined,
    short_time: flags.short_time || undefined,
    long_time: flags.long_time || undefined,
    short_date: flags.short_date || undefined,
    long_date: flags.long_date || undefined,
    day_of_week: flags.day_of_week || undefined
  };
}

function wrapRichTextMark(text: RichText, mark: NonNullable<JSONContent['marks']>[number]): RichText {
  switch(mark.type) {
    case 'bold':
      return {_: 'textBold', text};
    case 'italic':
      return {_: 'textItalic', text};
    case 'underline':
      return {_: 'textUnderline', text};
    case 'strike':
      return {_: 'textStrike', text};
    case 'code':
      return {_: 'textFixed', text};
    case 'spoiler':
      return {_: 'textSpoiler', text};
    case 'subscript':
      return {_: 'textSubscript', text};
    case 'superscript':
      return {_: 'textSuperscript', text};
    case 'highlight':
      return {_: 'textMarked', text};
    case 'link': {
      const url = typeof(mark.attrs?.href) === 'string' ? mark.attrs.href : '';
      const anchorName = typeof(mark.attrs?.richAnchorName) === 'string' ? mark.attrs.richAnchorName : '';
      if(anchorName) return {_: 'textAnchor', text, name: anchorName};
      if(url.startsWith('mailto:')) {
        const email = url.slice('mailto:'.length);
        return email ? {_: 'textEmail', text, email} : text;
      }
      if(url.startsWith('tel:')) {
        const phone = url.slice('tel:'.length);
        return phone ? {_: 'textPhone', text, phone} : text;
      }
      if(url.startsWith('tg://user?')) {
        const userId = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('id');
        if(userId) return {_: 'textMentionName', text, user_id: userId};
      }
      return url ? {_: 'textUrl', text, url, webpage_id: 0} : text;
    }
    case 'mentionName': {
      const userId = mark.attrs?.userId;
      return userId === undefined || userId === null ? text : {
        _: 'textMentionName',
        text,
        user_id: userId
      };
    }
    case 'formattedDate': {
      const date = Number(mark.attrs?.date);
      return !Number.isFinite(date) ? text : {
        _: 'textDate',
        pFlags: dateFlags(mark.attrs?.pFlags),
        text,
        date: Math.trunc(date)
      };
    }
    default:
      return text;
  }
}

function applyRichTextMarks(text: RichText, marks: JSONContent['marks'] = []): RichText {
  for(let index = marks.length - 1; index >= 0; --index) {
    text = wrapRichTextMark(text, marks[index]);
  }
  return text;
}

function stringAttribute(node: JSONContent, ...names: string[]) {
  for(const name of names) {
    const value = node.attrs?.[name];
    if(typeof(value) === 'string' && value) return value;
  }
  return '';
}

/**
 * A button as the message carries it: its label, what it does and how it looks. A button with no
 * label or nothing to do is left out — the server would refuse the whole message.
 */
function richButtonFromAttrs(attrs: Record<string, any>) {
  const button = richButtonFromAttributes(attrs);
  const type = richButtonInlineType(button);
  const text = inlineContentToRichText(attrs?.label);
  if(!type || !hasRichTextContent(text)) return;
  return {text, type, style: richButtonStyle(button)};
}

function richButtonToAttrs(button: {text: RichText, type: PageButton['type'], style?: PageButton['style']}) {
  const value = richButtonFromInlineType(button.type, button.style);
  return value && richButtonAttributes(value, richTextToTiptapInlineContent(button.text));
}

function inlineNodeToRichText(node: JSONContent): RichText {
  if(node.type === RICH_BUTTON_NODE_NAME) {
    // a button's look is its style; formatting around it does not carry over
    const button = richButtonFromAttrs(node.attrs);
    return button ? {_: 'textButton', ...button} : EMPTY_RICH_TEXT;
  }

  let text: RichText;
  if(node.type === 'text') {
    text = plainRichText(node.text || '');
  } else if(node.type === 'hardBreak') {
    text = plainRichText('\n');
  } else if(node.type === 'customEmoji') {
    const documentId = node.attrs?.documentId ?? node.attrs?.id;
    const alt = stringAttribute(node, 'emoji', 'alt', 'name');
    text = documentId === undefined || documentId === null ? plainRichText(alt) : {
      _: 'textCustomEmoji',
      document_id: documentId,
      alt
    };
  } else if(node.type === 'inlineMath') {
    const source = stringAttribute(node, 'source', 'latex');
    text = source ? {_: 'textMath', source} : EMPTY_RICH_TEXT;
  } else if(node.type === 'mention') {
    const label = stringAttribute(node, 'label', 'text');
    const userId = node.attrs?.userId ?? node.attrs?.id;
    const inner = plainRichText(label);
    text = userId === undefined || userId === null ? inner : {
      _: 'textMentionName',
      text: inner,
      user_id: userId
    };
  } else if(node.type === 'inlineRichAnchor') {
    const name = stringAttribute(node, 'name');
    text = name ? {_: 'textAnchor', text: EMPTY_RICH_TEXT, name} : EMPTY_RICH_TEXT;
  } else if(node.content?.length) {
    text = inlineContentToRichText(node.content);
  } else {
    text = plainRichText(stringAttribute(node, 'label', 'alt', 'source', 'caption'));
  }

  return applyRichTextMarks(text, node.marks);
}

function inlineContentToRichText(content: JSONContent[] = []): RichText {
  return concatRichText(content.map(inlineNodeToRichText));
}

function joinRichTextLines(lines: RichText[]): RichText {
  return concatRichText(lines.flatMap((line, index) => (
    index ? [plainRichText('\n'), line] : [line]
  )));
}

export function tiptapDocumentToCaptionRichText(document: JSONContent): RichText {
  return joinRichTextLines((document.type === 'doc' ? document.content || [] : [document])
  .map((node) => {
    if(node.type === 'paragraph' || node.type === 'heading') {
      return inlineContentToRichText(node.content);
    }
    return plainRichText(fallbackNodeText(node));
  }));
}

function inlineQuoteState(node: JSONContent) {
  const mark = node.marks?.find((mark) => mark.type === 'inlineQuote');
  return mark ? {collapsed: !!mark.attrs?.collapsed} : undefined;
}

function withoutInlineQuote(node: JSONContent): JSONContent {
  if(!node.marks?.some((mark) => mark.type === 'inlineQuote')) return node;
  const marks = node.marks.filter((mark) => mark.type !== 'inlineQuote');
  return {...node, marks: marks.length ? marks : undefined};
}

function paragraphPageBlocks(node: JSONContent): PageBlock[] {
  const content = node.content || [];
  if(!content.some(inlineQuoteState)) {
    return [{_: 'pageBlockParagraph', text: inlineContentToRichText(content)}];
  }

  const groups: Array<{
    collapsed?: boolean,
    content: JSONContent[],
    quoted: boolean
  }> = [];
  content.forEach((child) => {
    const quote = inlineQuoteState(child);
    const previous = groups[groups.length - 1];
    if(!previous || previous.quoted !== !!quote || previous.collapsed !== quote?.collapsed) {
      groups.push({collapsed: quote?.collapsed, content: [], quoted: !!quote});
    }
    groups[groups.length - 1].content.push(withoutInlineQuote(child));
  });

  return groups.map((group): PageBlock => {
    const text = inlineContentToRichText(group.content);
    if(!group.quoted) return {_: 'pageBlockParagraph', text};

    const quote: PageBlock.pageBlockBlockquote = {
      _: 'pageBlockBlockquote',
      pFlags: {collapsed: group.collapsed || undefined},
      text,
      caption: EMPTY_RICH_TEXT
    };
    return quote;
  });
}

function fallbackNodeText(node: JSONContent): string {
  if(node.type === 'text') return node.text || '';
  if(node.type === RICH_BUTTON_NODE_NAME) return richButtonLabelText(node.attrs?.label);
  if(node.type === BUTTON_ROW_NODE_NAME) {
    return ((node.attrs?.buttons || []) as Record<string, any>[]).map((attrs) => richButtonLabelText(attrs.label)).join(' ');
  }
  if(node.type === 'hardBreak') return '\n';
  if(node.type === 'customEmoji') return stringAttribute(node, 'emoji', 'alt', 'name');
  if(node.type === 'inlineMath' || node.type === 'blockMath') return stringAttribute(node, 'source', 'latex');
  if(node.type === 'mention') return stringAttribute(node, 'label', 'text');
  if(node.content?.length) {
    const separator = new Set([
      'blockquote',
      'bulletList',
      'codeBlock',
      'details',
      'detailsBody',
      'detailsSummary',
      'doc',
      'listItem',
      'orderedList',
      'paragraph',
      'pullquote',
      'pullquoteCaption',
      'pullquoteText',
      'tableCell',
      'tableHeader'
    ]).has(node.type || '') ? '\n' : '';
    return node.content.map(fallbackNodeText).filter(Boolean).join(separator);
  }
  return stringAttribute(node, 'label', 'alt', 'source', 'caption');
}

function quotePageBlock(node: JSONContent, draft: boolean): PageBlock {
  const captionNode = node.content?.find((child) => child.type === 'blockquoteCaption');
  const blocks = nodesToPageBlocks(
    (node.content || []).filter((child) => child !== captionNode),
    draft
  );
  const captionText = stringAttribute(node, 'caption');
  const richCaption = richTextAttribute(node.attrs?.captionRichText);
  const caption = captionNode ?
    inlineContentToRichText(captionNode.content) :
    richCaption && richTextPlainText(richCaption) === captionText ?
      inputRichText(richCaption) :
      plainRichText(captionText);
  const paragraphs = blocks.every((block) => block._ === 'pageBlockParagraph') ?
    blocks as PageBlock.pageBlockParagraph[] :
    undefined;
  // Only `pageBlockBlockquote` can say it is collapsed (layer 229), so a collapsed quote of several
  // paragraphs goes as one text with a line per paragraph — the shape desktop sends it in.
  const collapsed = !!node.attrs?.collapsed && !!paragraphs?.length;
  const quote: PageBlock = collapsed || paragraphs?.length === 1 ? {
    _: 'pageBlockBlockquote',
    pFlags: {collapsed: collapsed || undefined},
    text: joinRichTextLines(paragraphs.map((paragraph) => paragraph.text)),
    caption
  } : {
    _: 'pageBlockBlockquoteBlocks',
    blocks,
    caption
  };

  return quote;
}

function pullquotePageBlock(node: JSONContent): PageBlock.pageBlockPullquote {
  const text = node.content?.find((child) => child.type === 'pullquoteText');
  const caption = node.content?.find((child) => child.type === 'pullquoteCaption');
  return {
    _: 'pageBlockPullquote',
    text: inlineContentToRichText(text?.content),
    caption: inlineContentToRichText(caption?.content)
  };
}

function detailsPageBlock(node: JSONContent, draft: boolean): PageBlock.pageBlockDetails {
  const summary = node.content?.find((child) => child.type === 'detailsSummary');
  const body = node.content?.find((child) => child.type === 'detailsBody');
  const blocks = nodesToPageBlocks(body?.content || [], draft);
  return {
    _: 'pageBlockDetails',
    pFlags: {open: node.attrs?.open ? true : undefined},
    blocks,
    title: inlineContentToRichText(summary?.content)
  };
}

function listItemBlocks(node: JSONContent, draft: boolean) {
  return nodesToPageBlocks(node.content || [], draft);
}

function unorderedListItem(node: JSONContent, draft: boolean): PageListItem {
  const blocks = listItemBlocks(node, draft);
  const checkbox = node.type === 'taskItem' || node.attrs?.checkbox === true ||
    typeof(node.attrs?.checked) === 'boolean';
  const pFlags = checkbox ? {
    checkbox: true as const,
    checked: node.attrs?.checked ? true as const : undefined
  } : {};
  if(blocks.length === 1 && blocks[0]._ === 'pageBlockParagraph') {
    return {_: 'pageListItemText', pFlags, text: blocks[0].text};
  }
  return {_: 'pageListItemBlocks', pFlags, blocks};
}

function integerAttribute(node: JSONContent, name: string) {
  const attribute = node.attrs?.[name];
  if(attribute === undefined || attribute === null || attribute === '') return;
  const value = Number(attribute);
  return Number.isInteger(value) ? value : undefined;
}

function optionalStringAttribute(node: JSONContent, name: string) {
  const value = node.attrs?.[name];
  return typeof(value) === 'string' ? value : undefined;
}

function orderedListItem(node: JSONContent, draft: boolean): PageListOrderedItem {
  const blocks = listItemBlocks(node, draft);
  const checkbox = node.type === 'taskItem' || node.attrs?.checkbox === true ||
    typeof(node.attrs?.checked) === 'boolean';
  const pFlags = checkbox ? {
    checkbox: true as const,
    checked: node.attrs?.checked ? true as const : undefined
  } : {};
  const attributes = {
    value: integerAttribute(node, 'value'),
    type: optionalStringAttribute(node, 'type')
  };
  if(blocks.length === 1 && blocks[0]._ === 'pageBlockParagraph') {
    return {_: 'pageListOrderedItemText', pFlags, text: blocks[0].text, ...attributes};
  }
  return {_: 'pageListOrderedItemBlocks', pFlags, blocks, ...attributes};
}

function cellRichText(node: JSONContent): RichText {
  const parts = (node.content || []).map((child) => {
    if(child.type === 'paragraph') return inlineContentToRichText(child.content);
    return EMPTY_RICH_TEXT;
  });
  return concatRichText(parts.flatMap((part, index) => (
    index ? [plainRichText('\n'), part] : [part]
  )));
}

function positiveSpan(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 1 ? number : undefined;
}

function richTextAttribute(value: unknown): RichText | undefined {
  if(!value || typeof(value) !== 'object') return;
  const type = (value as RichText)._;
  return typeof(type) === 'string' && type.startsWith('text') ? value as RichText : undefined;
}


export function normalizeOpaqueRichBlockForInput(
  source: PageBlock
): PageBlock.pageBlockFooter |
  PageBlock.pageBlockDivider |
  PageBlock.pageBlockAnchor |
  PageBlock.inputPageBlockMap |
  undefined {
  const block = inputPageBlock(source);
  switch(block._) {
    case 'pageBlockFooter':
      return hasRichTextContent(block.text) ? block : undefined;
    case 'pageBlockDivider':
      return block;
    case 'pageBlockAnchor':
      return block.name.trim() ? block : undefined;
    case 'inputPageBlockMap':
      return (
        block.geo._ === 'inputGeoPoint' &&
        Number.isFinite(block.geo.lat) &&
        Math.abs(block.geo.lat) <= 90 &&
        Number.isFinite(block.geo.long) &&
        Math.abs(block.geo.long) <= 180 &&
        (
          block.geo.accuracy_radius === undefined ||
          Number.isInteger(block.geo.accuracy_radius) &&
          block.geo.accuracy_radius >= 0 &&
          block.geo.accuracy_radius <= 0x7FFFFFFF
        ) &&
        Number.isInteger(block.zoom) &&
        block.zoom > 0 &&
        block.zoom <= 0x7FFFFFFF &&
        Number.isInteger(block.w) &&
        block.w > 0 &&
        block.w <= 0x7FFFFFFF &&
        Number.isInteger(block.h) &&
        block.h > 0 &&
        block.h <= 0x7FFFFFFF &&
        block.caption?._ === 'pageCaption'
      ) ? block : undefined;
    default:
      return;
  }
}

function richMediaPageBlock(node: JSONContent): PageBlock | undefined {
  const source = node.attrs?.block;
  if(!source || typeof(source) !== 'object') return;
  const block = inputPageBlock(source as PageBlock);
  if(
    block._ !== 'pageBlockAudio' &&
    block._ !== 'pageBlockPhoto' &&
    block._ !== 'pageBlockVideo' &&
    block._ !== 'pageBlockCollage' &&
    block._ !== 'pageBlockSlideshow'
  ) return;

  return {
    ...block,
    caption: {
      _: 'pageCaption',
      text: inlineContentToRichText(node.content),
      credit: inputRichText(
        richTextAttribute(node.attrs?.captionCredit) || EMPTY_RICH_TEXT
      )
    }
  };
}

function richMapPageBlock(node: JSONContent): PageBlock.inputPageBlockMap | undefined {
  const source = node.attrs?.block;
  if(!source || typeof(source) !== 'object') return;
  const block = inputPageBlock(source as PageBlock);
  if(block._ !== 'inputPageBlockMap') return;

  const normalized = normalizeOpaqueRichBlockForInput({
    ...block,
    caption: {
      _: 'pageCaption',
      text: inlineContentToRichText(node.content),
      credit: inputRichText(
        richTextAttribute(node.attrs?.captionCredit) || EMPTY_RICH_TEXT
      )
    }
  });
  return normalized?._ === 'inputPageBlockMap' ? normalized : undefined;
}

function tableTitle(node: JSONContent, titleNode?: JSONContent): RichText {
  if(titleNode?.type === CHAT_TABLE_TITLE_NODE_NAME) {
    return inlineContentToRichText(titleNode.content);
  }
  const title = typeof(node.attrs?.title) === 'string' ? node.attrs.title : '';
  const richTitle = richTextAttribute(node.attrs?.titleRichText);
  return richTitle && richTextPlainText(richTitle) === title ? richTitle : plainRichText(title);
}

function tableCell(node: JSONContent): PageTableCell {
  const align = node.attrs?.textAlign || node.attrs?.align;
  const verticalAlign = node.attrs?.verticalAlign || node.attrs?.valign;
  return {
    _: 'pageTableCell',
    pFlags: {
      header: node.type === 'tableHeader' || undefined,
      align_center: align === 'center' || undefined,
      align_right: align === 'right' || undefined,
      valign_middle: verticalAlign === 'middle' || undefined,
      valign_bottom: verticalAlign === 'bottom' || undefined
    },
    text: cellRichText(node),
    colspan: positiveSpan(node.attrs?.colspan),
    rowspan: positiveSpan(node.attrs?.rowspan)
  };
}

function tableRows(node: JSONContent): PageTableRow[] {
  return (node.content || []).filter((row) => row.type === 'tableRow').map((row) => ({
    _: 'pageTableRow',
    cells: (row.content || [])
    .filter((cell) => cell.type === 'tableCell' || cell.type === 'tableHeader')
    .map(tableCell)
  }));
}

function tablePageBlock(
  table: JSONContent,
  titleNode?: JSONContent
): PageBlock.pageBlockTable {
  return {
    _: 'pageBlockTable',
    pFlags: {
      bordered: table.attrs?.bordered ? true : undefined,
      striped: table.attrs?.striped ? true : undefined,
      compact: table.attrs?.compact ? true : undefined
    },
    title: tableTitle(table, titleNode),
    rows: tableRows(table)
  };
}

function headingBlock(node: JSONContent): PageBlock {
  const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 1));
  return {
    _: `pageBlockHeading${level}`,
    text: inlineContentToRichText(node.content)
  } as PageBlock;
}

function nodeToPageBlocks(node: JSONContent, draft: boolean): PageBlock[] {
  switch(node.type) {
    case 'doc':
      return nodesToPageBlocks(node.content || [], draft);
    case 'paragraph':
      return paragraphPageBlocks(node);
    case 'heading':
      return [headingBlock(node)];
    case 'codeBlock':
      return [{
        _: 'pageBlockPreformatted',
        text: plainRichText(fallbackNodeText(node)),
        language: getEffectiveCodeBlockLanguage(node.attrs, fallbackNodeText(node))
      }];
    case 'blockquote':
    case 'collapsibleBlockquote':
      return [quotePageBlock(node, draft)];
    case 'pullquote':
      return [pullquotePageBlock(node)];
    case 'details':
      return [detailsPageBlock(node, draft)];
    case 'bulletList':
    case 'taskList':
      return [{
        _: 'pageBlockList',
        items: (node.content || []).map((item) => unorderedListItem(item, draft))
      }];
    case 'orderedList': {
      const start = integerAttribute(node, 'start') ?? 1;
      const startExplicit = node.attrs?.startExplicit ??
        start !== 1;
      return [{
        _: 'pageBlockOrderedList',
        pFlags: {reversed: node.attrs?.reversed ? true : undefined},
        start: startExplicit ? start : undefined,
        type: optionalStringAttribute(node, 'type'),
        items: (node.content || []).map((item) => orderedListItem(item, draft))
      }];
    }
    case CHAT_TABLE_WRAPPER_NODE_NAME: {
      const titleNode = (node.content || []).find(
        (child) => child.type === CHAT_TABLE_TITLE_NODE_NAME
      );
      const table = (node.content || []).find((child) => child.type === 'table');
      return table ? [tablePageBlock(table, titleNode)] : [];
    }
    case 'table':
      return [tablePageBlock(node)];
    case 'blockMath':
    case 'inlineMath':
      return [{_: 'pageBlockMath', source: stringAttribute(node, 'source', 'latex')}];
    case 'richFooter':
      return [{_: 'pageBlockFooter', text: inlineContentToRichText(node.content)}];
    case 'richDivider':
      return [{_: 'pageBlockDivider'}];
    case BUTTON_ROW_NODE_NAME: {
      const buttons = ((node.attrs?.buttons || []) as Record<string, any>[]).flatMap((attrs): PageButton[] => {
        const button = richButtonFromAttrs(attrs);
        return button ? [{_: 'pageButton', ...button}] : [];
      });
      if(!buttons.length) return [];
      const align = getButtonRowAlign(node.attrs?.align);
      return [{
        _: 'pageBlockButtonRow',
        pFlags: {
          align_left: align === 'left' || undefined,
          align_center: align === 'center' || undefined,
          align_right: align === 'right' || undefined
        },
        buttons
      }];
    }
    case 'richAnchor': {
      const name = stringAttribute(node, 'name').trim();
      return name ? [{_: 'pageBlockAnchor', name}] : [];
    }
    case 'richMap': {
      const block = richMapPageBlock(node);
      return block ? [block] : [];
    }
    case 'richMedia': {
      if(node.attrs?.uploadId) return [];
      const block = richMediaPageBlock(node);
      return block?._ === 'pageBlockCollage' ?
        splitOversizedRichMediaCollage(block) :
        block ? [block] : [];
    }
    default: {
      if(node.type === 'opaqueRichBlock' && node.attrs?.block) {
        const source = node.attrs.block as PageBlock;
        if(
          source._ === 'pageBlockFooter' ||
          source._ === 'pageBlockDivider' ||
          source._ === 'pageBlockAnchor' ||
          source._ === 'pageBlockMap' ||
          source._ === 'inputPageBlockMap'
        ) {
          const block = normalizeOpaqueRichBlockForInput(source);
          return block ? [block] : [];
        }
        return [inputPageBlock(source)];
      }
      const text = fallbackNodeText(node);
      return text ? [{_: 'pageBlockParagraph', text: plainRichText(text)}] : [];
    }
  }
}

function normalizePageBlock(block: PageBlock): PageBlock | undefined {
  switch(block._) {
    case 'pageBlockParagraph':
      // Empty paragraphs inside a block vector are meaningful vertical spacing. They are
      // trimmed only at the vector edges in normalizePageBlocks(), matching the native editor.
      return block;
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockPreformatted':
    case 'pageBlockFooter':
      return hasRichTextContent(block.text) ? block : undefined;
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      return hasRichTextContent(block.text) ? block : undefined;
    case 'pageBlockBlockquoteBlocks': {
      const blocks = normalizePageBlocks(block.blocks);
      return blocks.length ? {...block, blocks} : undefined;
    }
    case 'pageBlockDetails': {
      const blocks = normalizePageBlocks(block.blocks);
      return blocks.length ? {...block, blocks} : undefined;
    }
    case 'pageBlockList': {
      const items = block.items.map((item): PageListItem => {
        if(item._ === 'pageListItemText') return item;
        const blocks = normalizePageBlocks(item.blocks);
        return blocks.length ? {...item, blocks} : {
          _: 'pageListItemText',
          pFlags: item.pFlags,
          text: EMPTY_RICH_TEXT
        };
      });
      return items.length ? {...block, items} : undefined;
    }
    case 'pageBlockOrderedList': {
      const items = block.items.map((item): PageListOrderedItem => {
        const {num: _num, ...withoutNum} = item;
        if(item._ === 'pageListOrderedItemText') {
          return withoutNum as PageListOrderedItem;
        }
        const blocks = normalizePageBlocks(item.blocks);
        return blocks.length ? {...withoutNum, blocks} as PageListOrderedItem : {
          _: 'pageListOrderedItemText',
          pFlags: item.pFlags,
          text: EMPTY_RICH_TEXT,
          value: item.value,
          type: item.type
        };
      });
      return items.length ? {...block, items} : undefined;
    }
    case 'pageBlockTable':
      return (
        hasRichTextContent(block.title) ||
        block.rows.some((row) => row.cells.some((cell) => hasRichTextContent(cell.text)))
      ) ?
        block :
        undefined;
    case 'pageBlockMath':
      return block.source.trim() ? block : undefined;
    case 'pageBlockAnchor':
      return block.name ? block : undefined;
    default:
      return block;
  }
}

function isEmptyParagraph(block: PageBlock) {
  return block._ === 'pageBlockParagraph' && !hasRichTextContent(block.text);
}

function normalizePageBlocks(blocks: PageBlock[]) {
  const normalized = blocks.flatMap((block) => {
    const normalized = normalizePageBlock(block);
    return normalized ? [normalized] : [];
  });

  let from = 0;
  let to = normalized.length;
  while(from < to && isEmptyParagraph(normalized[from])) {
    ++from;
  }
  while(to > from && isEmptyParagraph(normalized[to - 1])) {
    --to;
  }

  return normalized.slice(from, to);
}

function nodesToPageBlocks(nodes: JSONContent[], draft = false): PageBlock[] {
  const blocks = nodes.flatMap((node) => nodeToPageBlocks(node, draft));
  return draft ? blocks : normalizePageBlocks(blocks);
}

function richTextDirectionText(text: RichText): string {
  switch(text._) {
    case 'textEmpty':
      return '';
    case 'textPlain':
      return text.text;
    case 'textConcat':
      return text.texts.map(richTextDirectionText).join('');
    case 'textMath':
    case 'textImage':
      return '\uFFFC';
    case 'textCustomEmoji':
      return text.alt || '\uFFFC';
    case 'textDiff':
      return richTextDirectionText(text.text);
    default:
      return richTextDirectionText(text.text);
  }
}

function blockDirectionText(block: PageBlock): RichText | undefined {
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
      return block.text;
    case 'pageBlockAuthorDate':
      return block.author;
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      return block.text;
    case 'pageBlockTable':
    case 'pageBlockDetails':
    case 'pageBlockRelatedArticles':
      return block.title;
    default:
      return;
  }
}

function blocksDirection(blocks: PageBlock[]): boolean | undefined {
  for(const block of blocks) {
    const directionText = blockDirectionText(block);
    if(directionText) {
      const plain = richTextDirectionText(directionText);
      if(plain.trim()) return checkRTL(plain);
    }

    if('blocks' in block) {
      const nested = blocksDirection(block.blocks);
      if(nested !== undefined) return nested;
    } else if(block._ === 'pageBlockCover') {
      const nested = blocksDirection([block.cover]);
      if(nested !== undefined) return nested;
    }

    if(block._ === 'pageBlockList' || block._ === 'pageBlockOrderedList') {
      for(const item of block.items) {
        if(item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText') {
          const plain = richTextDirectionText(item.text);
          if(plain.trim()) return checkRTL(plain);
        } else {
          const nested = blocksDirection(item.blocks);
          if(nested !== undefined) return nested;
        }
      }
    }
  }
}

export function determineRichMessageRtl(blocks: PageBlock[]) {
  return blocksDirection(blocks) || false;
}

function collectDocumentMediaResources(document: JSONContent) {
  const photos = new Map<string, Photo.photo>();
  const documents = new Map<string, Document.document>();
  const visit = (node: JSONContent) => {
    if(node.type === 'richMedia' && !node.attrs?.uploadId) {
      (node.attrs?.photos || []).forEach((photo: Photo) => {
        if(photo?._ === 'photo') photos.set(String(photo.id), photo);
      });
      (node.attrs?.documents || []).forEach((document: Document) => {
        if(document?._ === 'document') documents.set(String(document.id), document);
      });
    }
    node.content?.forEach(visit);
  };
  visit(document);
  return {
    photos: [...photos.values()],
    documents: [...documents.values()]
  };
}

export function tiptapToRichMessage(
  document: JSONContent,
  options: RichMessageDocumentOptions = {}
): TiptapRichMessageDocument {
  const blocks = nodesToPageBlocks(
    document.type === 'doc' ? document.content || [] : [document],
    !!options.draft
  );
  const rtl = determineRichMessageRtl(blocks);
  const resources = collectDocumentMediaResources(document);
  const inputPhotos = resources.photos.map(getPhotoInput);
  const inputDocuments = resources.documents.map(getDocumentInput);

  return {
    input: {
      _: 'inputRichMessage',
      pFlags: {
        rtl: rtl || undefined,
        noautolink: options.noAutolink || undefined
      },
      blocks,
      photos: inputPhotos.length ? inputPhotos : undefined,
      documents: inputDocuments.length ? inputDocuments : undefined
    },
    output: {
      _: 'richMessage',
      pFlags: {rtl: rtl || undefined},
      blocks,
      photos: resources.photos,
      documents: resources.documents
    }
  };
}

function sameMarks(left: JSONContent['marks'], right: JSONContent['marks']) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function appendInline(content: JSONContent[], node: JSONContent) {
  const previous = content[content.length - 1];
  if(previous?.type === 'text' && node.type === 'text' && sameMarks(previous.marks, node.marks)) {
    previous.text = (previous.text || '') + (node.text || '');
  } else {
    content.push(node);
  }
}

function plainTextToInlineContent(text: string, marks: JSONContent['marks']): JSONContent[] {
  const content: JSONContent[] = [];
  const nodeMarks = marks?.length ? marks : undefined;
  text.split('\n').forEach((part, index) => {
    if(index) content.push({type: 'hardBreak', marks: nodeMarks});
    if(part) content.push({type: 'text', text: part, marks: nodeMarks});
  });
  return content;
}

export function richTextToTiptapInlineContent(
  text: RichText,
  marks: JSONContent['marks'] = []
): JSONContent[] {
  switch(text._) {
    case 'textEmpty':
      return [];
    case 'textPlain':
      return plainTextToInlineContent(text.text, marks);
    case 'textConcat': {
      const content: JSONContent[] = [];
      text.texts.forEach((child) => richTextToTiptapInlineContent(child, marks)
      .forEach((node) => appendInline(content, node)));
      return content;
    }
    case 'textBold':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'bold'}]);
    case 'textItalic':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'italic'}]);
    case 'textUnderline':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'underline'}]);
    case 'textStrike':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'strike'}]);
    case 'textFixed':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'code'}]);
    case 'textSpoiler':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'spoiler'}]);
    case 'textSubscript':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'subscript'}]);
    case 'textSuperscript':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'superscript'}]);
    case 'textMarked':
      return richTextToTiptapInlineContent(text.text, [...marks, {type: 'highlight'}]);
    case 'textUrl':
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'link',
        attrs: {href: text.url}
      }]);
    case 'textEmail':
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'link',
        attrs: {href: `mailto:${text.email}`}
      }]);
    case 'textPhone':
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'link',
        attrs: {href: `tel:${text.phone}`}
      }]);
    case 'textMentionName':
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'mentionName',
        attrs: {userId: text.user_id}
      }]);
    case 'textDate':
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'formattedDate',
        attrs: {date: text.date, pFlags: {...text.pFlags}}
      }]);
    case 'textAnchor':
      if(text.text._ === 'textEmpty') {
        return [{type: 'inlineRichAnchor', attrs: {name: text.name}}];
      }
      return richTextToTiptapInlineContent(text.text, [...marks, {
        type: 'link',
        attrs: {href: `#${text.name}`, richAnchorName: text.name}
      }]);
    case 'textMath':
      return [{type: 'inlineMath', attrs: {source: text.source}, marks: marks.length ? marks : undefined}];
    case 'textCustomEmoji':
      return [{
        type: 'customEmoji',
        attrs: {
          documentId: text.document_id,
          emoji: text.alt,
          id: text.document_id
        },
        marks: marks.length ? marks : undefined
      }];
    case 'textImage':
      return plainTextToInlineContent('\ufffc', marks);
    case 'textDiff':
      return richTextToTiptapInlineContent(text.text, marks);
    case 'textButton': {
      const attrs = richButtonToAttrs(text);
      return attrs ? [{type: RICH_BUTTON_NODE_NAME, attrs}] : richTextToTiptapInlineContent(text.text, marks);
    }
    default: {
      const wrapped = text as RichText & {text?: RichText};
      if(wrapped.text) return richTextToTiptapInlineContent(wrapped.text, marks);
      return plainTextToInlineContent(`[${text._}]`, marks);
    }
  }
}

export function richTextPlainText(text: RichText): string {
  switch(text._) {
    case 'textEmpty':
      return '';
    case 'textPlain':
      return text.text;
    case 'textConcat':
      return text.texts.map(richTextPlainText).join('');
    case 'textMath':
      return text.source;
    case 'textCustomEmoji':
      return text.alt;
    case 'textImage':
      return '\ufffc';
    case 'textDiff':
      return richTextPlainText(text.text);
    default: {
      const wrapped = text as RichText & {text?: RichText};
      return wrapped.text ? richTextPlainText(wrapped.text) : `[${text._}]`;
    }
  }
}

function paragraphFromRichText(text: RichText): JSONContent {
  const content = richTextToTiptapInlineContent(text);
  return {type: 'paragraph', content: content.length ? content : undefined};
}

function headingFromRichText(text: RichText, level: number): JSONContent {
  const content = richTextToTiptapInlineContent(text);
  return {
    type: 'heading',
    attrs: {level: Math.max(1, Math.min(6, level))},
    content: content.length ? content : undefined
  };
}

function listItemContent(
  blocks: PageBlock[],
  message: StructuredRichMessage
): JSONContent[] {
  const content = pageBlocksToTiptapContent(blocks, message);
  if(!content.length || content[0].type !== 'paragraph') content.unshift({type: 'paragraph'});
  return content;
}

function unorderedListItemToTiptap(
  item: PageListItem,
  task: boolean,
  message: StructuredRichMessage
): JSONContent {
  const content = item._ === 'pageListItemText' ?
    [paragraphFromRichText(item.text)] :
    listItemContent(item.blocks, message);
  const attrs = task ? {checked: !!item.pFlags.checked} : item.pFlags.checkbox ? {
    checkbox: true,
    checked: !!item.pFlags.checked
  } : undefined;
  return {
    type: task ? 'taskItem' : 'listItem',
    attrs,
    content
  };
}

function orderedListItemToTiptap(
  item: PageListOrderedItem,
  message: StructuredRichMessage
): JSONContent {
  const content = item._ === 'pageListOrderedItemText' ?
    [paragraphFromRichText(item.text)] :
    listItemContent(item.blocks, message);
  const attrs: Record<string, unknown> = {};
  if(item.pFlags.checkbox) {
    attrs.checkbox = true;
    attrs.checked = !!item.pFlags.checked;
  }
  if(item.value !== undefined) attrs.value = item.value;
  if(item.type !== undefined) attrs.type = item.type;
  return {
    type: 'listItem',
    attrs: Object.keys(attrs).length ? attrs : undefined,
    content
  };
}

function tableCellToTiptap(cell: PageTableCell): JSONContent {
  const content = richTextToTiptapInlineContent(cell.text || EMPTY_RICH_TEXT);
  const textAlign = cell.pFlags.align_center ? 'center' : cell.pFlags.align_right ? 'right' : undefined;
  const verticalAlign = cell.pFlags.valign_middle ? 'middle' : cell.pFlags.valign_bottom ? 'bottom' : undefined;
  return {
    type: cell.pFlags.header ? 'tableHeader' : 'tableCell',
    attrs: {
      colspan: cell.colspan || 1,
      rowspan: cell.rowspan || 1,
      colwidth: null,
      align: textAlign,
      verticalAlign
    },
    content: [{type: 'paragraph', content: content.length ? content : undefined}]
  };
}

function quoteBlockToTiptap(
  block: PageBlock.pageBlockBlockquote | PageBlock.pageBlockBlockquoteBlocks,
  message: StructuredRichMessage
) {
  const blocks = block._ === 'pageBlockBlockquote' ?
    [paragraphFromRichText(block.text)] :
    pageBlocksToTiptapContent(block.blocks, message);
  const caption = richTextToTiptapInlineContent(block.caption);
  const content = blocks.length ? blocks : [{type: 'paragraph'}];
  if(caption.length || content.some((child) => (
    !!child.content?.length || child.type !== 'paragraph'
  ))) {
    content.push({
      type: 'blockquoteCaption',
      content: caption.length ? caption : undefined
    });
  }
  return {
    type: 'blockquote',
    attrs: {collapsed: block._ === 'pageBlockBlockquote' && !!block.pFlags?.collapsed, rich: true},
    content
  } as JSONContent;
}

function pullquoteBlockToTiptap(block: PageBlock.pageBlockPullquote): JSONContent {
  const text = richTextToTiptapInlineContent(block.text);
  const caption = richTextToTiptapInlineContent(block.caption);
  const content: JSONContent[] = [{
    type: 'pullquoteText',
    content: text.length ? text : undefined
  }, {
    type: 'pullquoteCaption',
    content: caption.length ? caption : undefined
  }];
  return {type: 'pullquote', content};
}

function withoutLinkMarks(content: JSONContent[]): JSONContent[] {
  return content.map((node) => {
    const marks = node.marks?.filter((mark) => mark.type !== 'link');
    return {
      ...node,
      marks: marks?.length ? marks : undefined,
      content: node.content ? withoutLinkMarks(node.content) : undefined
    };
  });
}

function detailsBlockToTiptap(
  block: PageBlock.pageBlockDetails,
  message: StructuredRichMessage
): JSONContent {
  const title = withoutLinkMarks(richTextToTiptapInlineContent(block.title));
  const blocks = pageBlocksToTiptapContent(block.blocks, message);
  return {
    type: 'details',
    attrs: {open: !!block.pFlags.open},
    content: [
      {
        type: 'detailsSummary',
        content: title.length ? title : undefined
      },
      {
        type: 'detailsBody',
        content: blocks.length ? blocks : [{type: 'paragraph'}]
      }
    ]
  };
}

function collectMediaBlockIds(
  block: PageBlock,
  photoIds: Set<string>,
  documentIds: Set<string>
) {
  switch(block._) {
    case 'pageBlockPhoto':
      photoIds.add(String(block.photo_id));
      break;
    case 'pageBlockVideo':
      documentIds.add(String(block.video_id));
      break;
    case 'pageBlockAudio':
      documentIds.add(String(block.audio_id));
      break;
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      block.items.forEach((item) => collectMediaBlockIds(item, photoIds, documentIds));
      break;
  }
}

function richMediaToTiptap(
  block: PageBlock.pageBlockAudio |
    PageBlock.pageBlockPhoto |
    PageBlock.pageBlockVideo |
    PageBlock.pageBlockCollage |
    PageBlock.pageBlockSlideshow,
  message: StructuredRichMessage
): JSONContent {
  const photoIds = new Set<string>();
  const documentIds = new Set<string>();
  collectMediaBlockIds(block, photoIds, documentIds);
  const photos = (message.photos || []).filter((photo): photo is Photo.photo => (
    photo._ === 'photo' && photoIds.has(String(photo.id))
  ));
  const documents = (message.documents || []).filter((document): document is Document.document => (
    document._ === 'document' && documentIds.has(String(document.id))
  ));
  return {
    type: 'richMedia',
    attrs: {
      block,
      captionCredit: block.caption.credit,
      photos,
      documents,
      previewUrl: '',
      previewUrls: [] as string[]
    },
    content: richTextToTiptapInlineContent(block.caption.text)
  };
}

function richMapToTiptap(
  block: PageBlock.pageBlockMap | PageBlock.inputPageBlockMap
): JSONContent {
  return {
    type: 'richMap',
    attrs: {
      block,
      captionCredit: block.caption.credit
    },
    content: richTextToTiptapInlineContent(block.caption.text)
  };
}

function pageBlockToTiptapContent(
  block: PageBlock,
  message: StructuredRichMessage
): JSONContent[] {
  switch(block._) {
    case 'pageBlockParagraph':
      return [paragraphFromRichText(block.text)];
    case 'pageBlockPreformatted': {
      const text = richTextPlainText(block.text);
      return [{
        type: 'codeBlock',
        attrs: {language: block.language || ''},
        content: text ? [{type: 'text', text}] : undefined
      }];
    }
    case 'pageBlockBlockquote':
    case 'pageBlockBlockquoteBlocks':
      return [quoteBlockToTiptap(block, message)];
    case 'pageBlockPullquote':
      return [pullquoteBlockToTiptap(block)];
    case 'pageBlockDetails':
      return [detailsBlockToTiptap(block, message)];
    case 'pageBlockList': {
      const task = !!block.items.length && block.items.every((item) => item.pFlags.checkbox);
      return [{
        type: task ? 'taskList' : 'bulletList',
        content: block.items.map((item) => unorderedListItemToTiptap(item, task, message))
      }];
    }
    case 'pageBlockOrderedList': {
      const reversed = !!block.pFlags.reversed;
      return [{
        type: 'orderedList',
        attrs: {
          start: block.start ?? (reversed ? block.items.length : 1),
          startExplicit: block.start !== undefined,
          type: block.type ?? null,
          reversed
        },
        content: block.items.map((item) => orderedListItemToTiptap(item, message))
      }];
    }
    case 'pageBlockTable': {
      const rows = block.rows.filter((row) => row.cells.length);
      if(!rows.length) return [];
      return [{
        type: CHAT_TABLE_WRAPPER_NODE_NAME,
        content: [
          {
            type: CHAT_TABLE_TITLE_NODE_NAME,
            content: richTextToTiptapInlineContent(block.title)
          },
          {
            type: 'table',
            attrs: {
              bordered: !!block.pFlags.bordered,
              striped: !!block.pFlags.striped,
              compact: !!block.pFlags.compact
            },
            content: rows.map((row) => ({
              type: 'tableRow',
              content: row.cells.map(tableCellToTiptap)
            }))
          }
        ]
      }];
    }
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6': {
      const level = Number(block._.slice('pageBlockHeading'.length));
      return [headingFromRichText(block.text, level)];
    }
    case 'pageBlockMath':
      return [{
        type: 'blockMath',
        attrs: {source: block.source}
      }];
    case 'pageBlockTitle':
      return [headingFromRichText(block.text, 1)];
    case 'pageBlockSubtitle':
    case 'pageBlockHeader':
      return [headingFromRichText(block.text, 2)];
    case 'pageBlockSubheader':
    case 'pageBlockKicker':
      return [headingFromRichText(block.text, 3)];
    case 'pageBlockThinking':
      return [{type: 'opaqueRichBlock', attrs: {block}}];
    case 'pageBlockFooter':
      return [{
        type: 'richFooter',
        content: richTextToTiptapInlineContent(block.text)
      }];
    case 'pageBlockDivider':
      return [{type: 'richDivider'}];
    case 'pageBlockButtonRow': {
      const buttons = block.buttons.map(richButtonToAttrs).filter(Boolean).slice(0, MAX_BUTTONS_PER_ROW);
      if(!buttons.length) return [];
      return [{
        type: BUTTON_ROW_NODE_NAME,
        attrs: {align: getPageButtonRowAlign(block) || null, buttons}
      }];
    }
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      return [richMapToTiptap(block)];
    case 'pageBlockAnchor':
      return [{type: 'richAnchor', attrs: {name: block.name}}];
    case 'pageBlockCollage':
      return splitOversizedRichMediaCollage(block).map((item) => (
        richMediaToTiptap(item, message)
      ));
    case 'pageBlockAudio':
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockSlideshow':
      return [richMediaToTiptap(block, message)];
    default: {
      return [{type: 'opaqueRichBlock', attrs: {block}}];
    }
  }
}

function pageBlocksToTiptapContent(
  blocks: PageBlock[],
  message: StructuredRichMessage
): JSONContent[] {
  return blocks.flatMap((block) => pageBlockToTiptapContent(block, message));
}

export function richMessageToTiptap(message: StructuredRichMessage): JSONContent {
  const content = pageBlocksToTiptapContent(message.blocks || [], message);
  return {
    type: 'doc',
    content: content.length ? content : [{type: 'paragraph'}]
  };
}

export {default as inferRichMessageNoAutolink} from '@lib/richTextProcessor/inferRichMessageNoAutolink';
