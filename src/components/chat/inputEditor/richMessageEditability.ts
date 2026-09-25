import type {PageBlock, PageButton, PageListItem, PageListOrderedItem, RichMessage, RichText} from '@layer';
import {getOrderedListTypePresentation} from '@lib/richTextProcessor/orderedList';
import {richButtonFromInlineType} from '@components/chat/inputEditor/richButtonModel';

function isEmptyRichText(text: RichText) {
  return text._ === 'textEmpty' ||
    text._ === 'textPlain' && !text.text ||
    text._ === 'textConcat' && text.texts.every(isEmptyRichText);
}

function isPlainRichText(text: RichText) {
  return text._ === 'textEmpty' ||
    text._ === 'textPlain' ||
    text._ === 'textConcat' && text.texts.every(isPlainRichText);
}

type RichTextMark =
  'bold' |
  'date' |
  'fixed' |
  'italic' |
  'marked' |
  'mentionName' |
  'spoiler' |
  'strike' |
  'subscript' |
  'superscript' |
  'underline' |
  'url';

function withMark(
  text: RichText & {text: RichText},
  marks: ReadonlySet<RichTextMark>,
  mark: RichTextMark
) {
  if(
    marks.has(mark) ||
    marks.has('fixed') ||
    marks.has('date') ||
    (mark === 'fixed' || mark === 'date') && marks.size > 0 ||
    mark === 'subscript' && marks.has('superscript') ||
    mark === 'superscript' && marks.has('subscript') ||
    ['date', 'mentionName', 'url'].includes(mark) &&
      [...marks].some((existing) => ['date', 'mentionName', 'url'].includes(existing))
  ) return false;

  return isEditableRichText(text.text, new Set([...marks, mark]));
}

/** What the composer keeps on a button's label: text, custom emoji and dates, as desktop does. */
function isEditableButtonLabel(text: RichText): boolean {
  switch(text._) {
    case 'textEmpty':
    case 'textPlain':
    case 'textCustomEmoji':
      return true;
    case 'textConcat':
      return text.texts.every(isEditableButtonLabel);
    case 'textDate':
      return Number.isInteger(text.date) && isPlainRichText(text.text);
    default:
      return false;
  }
}

/** A button the composer can author back: its kind is one a user may put into a message. */
function isEditableButton(button: PageButton | RichText.textButton) {
  return !!richButtonFromInlineType(button.type, button.style) &&
    !isEmptyRichText(button.text) &&
    isEditableButtonLabel(button.text);
}

function isEditableRichText(text: RichText, marks: ReadonlySet<RichTextMark> = new Set()): boolean {
  switch(text._) {
    case 'textButton':
      return !marks.size && isEditableButton(text);
    case 'textEmpty':
    case 'textPlain':
      return true;
    case 'textMath':
      return !!text.source && !marks.has('fixed') && !marks.has('date');
    case 'textCustomEmoji':
      return !marks.has('fixed') && !marks.has('date');
    case 'textConcat':
      return text.texts.every((child) => isEditableRichText(child, marks));
    case 'textBold':
      return withMark(text, marks, 'bold');
    case 'textItalic':
      return withMark(text, marks, 'italic');
    case 'textUnderline':
      return withMark(text, marks, 'underline');
    case 'textStrike':
      return withMark(text, marks, 'strike');
    case 'textFixed':
      return withMark(text, marks, 'fixed');
    case 'textSubscript':
      return withMark(text, marks, 'subscript');
    case 'textSuperscript':
      return withMark(text, marks, 'superscript');
    case 'textMarked':
      return withMark(text, marks, 'marked');
    case 'textSpoiler':
      return withMark(text, marks, 'spoiler');
    case 'textUrl':
      return !isEmptyRichText(text.text) && withMark(text, marks, 'url');
    case 'textEmail':
    case 'textPhone':
      return !isEmptyRichText(text.text) && withMark(text, marks, 'url');
    case 'textAnchor':
      return !!text.name && (
        isEmptyRichText(text.text) ||
        withMark(text, marks, 'url')
      );
    case 'textMentionName':
      return !isEmptyRichText(text.text) && withMark(text, marks, 'mentionName');
    case 'textDate':
      return Number.isInteger(text.date) && !isEmptyRichText(text.text) && withMark(text, marks, 'date');
    case 'textImage':
      return false;
    case 'textDiff':
      return isEditableRichText(text.text, marks);
    case 'textMention':
    case 'textHashtag':
    case 'textBotCommand':
    case 'textCashtag':
    case 'textAutoUrl':
    case 'textAutoEmail':
    case 'textAutoPhone':
    case 'textBankCard':
      return isEditableRichText(text.text, marks);
  }
}

function isEditableListItem(item: PageListItem) {
  return item._ === 'pageListItemText' ?
    isEditableRichText(item.text) :
    isEditableListItemBlocks(item.blocks);
}

function isEditableListItemBlocks(blocks: PageBlock[]) {
  return blocks.length > 0 && blocks.every(isEditableBlock);
}

function isOptionalInteger(value?: number) {
  return value === undefined || Number.isInteger(value);
}

function isOptionalOrderedListType(value?: string) {
  return value === undefined || !!getOrderedListTypePresentation(value);
}

function isEditableOrderedListItem(item: PageListOrderedItem) {
  if(
    item.pFlags.checked && !item.pFlags.checkbox ||
    item.num !== undefined && typeof(item.num) !== 'string' ||
    !isOptionalOrderedListType(item.type) ||
    !isOptionalInteger(item.value)
  ) return false;

  return item._ === 'pageListOrderedItemText' ?
    isEditableRichText(item.text) :
    isEditableListItemBlocks(item.blocks);
}

function isEditableBlockquote(
  block: PageBlock.pageBlockBlockquote | PageBlock.pageBlockBlockquoteBlocks
) {
  if(!isEditableRichText(block.caption)) return false;
  return block._ === 'pageBlockBlockquote' ?
    isEditableRichText(block.text) :
    block.blocks.length > 0 &&
      !(block.blocks.length === 1 && block.blocks[0]._ === 'pageBlockParagraph') &&
      block.blocks.every(isEditableBlock);
}

function isValidSpan(value?: number) {
  return value === undefined || Number.isInteger(value) && value >= 1;
}

function isSafeOpaqueRichText(text: RichText): boolean {
  switch(text._) {
    case 'textImage':
      return false;
    case 'textConcat':
      return text.texts.every(isSafeOpaqueRichText);
    case 'textEmpty':
    case 'textPlain':
    case 'textMath':
    case 'textCustomEmoji':
      return true;
    case 'textDiff':
      return isSafeOpaqueRichText(text.text);
    default:
      return isSafeOpaqueRichText(text.text);
  }
}

function isSafeOpaqueCaption(caption: PageBlock.pageBlockPhoto['caption']) {
  return isSafeOpaqueRichText(caption.text) && isSafeOpaqueRichText(caption.credit);
}

function isEditableBlock(block: PageBlock): boolean {
  switch(block._) {
    case 'pageBlockParagraph':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
      return isEditableRichText(block.text);
    case 'pageBlockPreformatted':
      return isPlainRichText(block.text);
    case 'pageBlockBlockquote':
    case 'pageBlockBlockquoteBlocks':
      return isEditableBlockquote(block);
    case 'pageBlockPullquote':
      return isEditableRichText(block.text) && isEditableRichText(block.caption);
    case 'pageBlockDetails':
      return isEditableRichText(block.title) &&
        block.blocks.length > 0 &&
        block.blocks.every(isEditableBlock);
    case 'pageBlockList': {
      if(!block.items.length) return false;
      if(block.items.some((item) => item.pFlags.checked && !item.pFlags.checkbox)) return false;
      return block.items.every(isEditableListItem);
    }
    case 'pageBlockOrderedList': {
      if(
        !block.items.length ||
        !isOptionalInteger(block.start) ||
        !isOptionalOrderedListType(block.type)
      ) return false;
      return block.items.every(isEditableOrderedListItem);
    }
    case 'pageBlockTable':
      return isEditableRichText(block.title) && !!block.rows.length && block.rows.every((row) => (
        !!row.cells.length && row.cells.every((cell) => (
          !(cell.pFlags.align_center && cell.pFlags.align_right) &&
          !(cell.pFlags.valign_middle && cell.pFlags.valign_bottom) &&
          isValidSpan(cell.colspan) &&
          isValidSpan(cell.rowspan) &&
          (!cell.text || isEditableRichText(cell.text))
        ))
      ));
    case 'pageBlockMath':
      return !!block.source;
    case 'pageBlockFooter':
      return isSafeOpaqueRichText(block.text);
    case 'pageBlockDivider':
      return true;
    case 'pageBlockButtonRow':
      return block.buttons.length > 0 && block.buttons.every(isEditableButton);
    case 'pageBlockAnchor':
      return !!block.name;
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
      return isSafeOpaqueCaption(block.caption);
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      return isSafeOpaqueCaption(block.caption) && block.items.every((item) => (
        (item._ === 'pageBlockPhoto' || item._ === 'pageBlockVideo') &&
        isEditableBlock(item)
      ));
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      return isSafeOpaqueCaption(block.caption);
    default:
      return false;
  }
}

export default function canSafelyEditRichMessage(message: RichMessage) {
  return !message.pFlags.part && message.blocks.every(isEditableBlock);
}
