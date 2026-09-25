import type {InputRichMessage, PageBlock, RichMessage, RichText} from '@layer';

const AUTOLINK_CANDIDATE = /(?:https?:\/\/|tg:\/\/|tonsite:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.\w+/i;

function inspectAutolinkRichText(
  text: RichText,
  state: {auto: boolean, candidate: boolean},
  protectedContext = false
) {
  switch(text._) {
    case 'textPlain':
      if(!protectedContext && AUTOLINK_CANDIDATE.test(text.text)) state.candidate = true;
      return;
    case 'textConcat':
      text.texts.forEach((child) => inspectAutolinkRichText(child, state, protectedContext));
      return;
    case 'textMention':
    case 'textHashtag':
    case 'textBotCommand':
    case 'textCashtag':
    case 'textAutoUrl':
    case 'textAutoEmail':
    case 'textAutoPhone':
    case 'textBankCard':
      state.auto = true;
      inspectAutolinkRichText(text.text, state, true);
      return;
    case 'textUrl':
    case 'textEmail':
    case 'textPhone':
    case 'textMentionName':
    case 'textFixed':
    case 'textAnchor':
    case 'textButton':
      inspectAutolinkRichText(text.text, state, true);
      return;
    case 'textEmpty':
    case 'textImage':
    case 'textMath':
    case 'textCustomEmoji':
      return;
    case 'textDiff':
      inspectAutolinkRichText(text.text, state, protectedContext);
      return;
    default:
      inspectAutolinkRichText(text.text, state, protectedContext);
  }
}

function inspectAutolinkBlock(block: PageBlock, state: {auto: boolean, candidate: boolean}) {
  const inspectText = (text?: RichText) => text && inspectAutolinkRichText(text, state);
  const inspectCaption = (caption: PageBlock.pageBlockPhoto['caption']) => {
    inspectText(caption.text);
    inspectText(caption.credit);
  };
  switch(block._) {
    case 'pageBlockParagraph':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockFooter':
    case 'pageBlockThinking':
      inspectText(block.text);
      return;
    case 'pageBlockPreformatted':
      return;
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      inspectText(block.text);
      inspectText(block.caption);
      return;
    case 'pageBlockBlockquoteBlocks':
      inspectText(block.caption);
      block.blocks.forEach((child) => inspectAutolinkBlock(child, state));
      return;
    case 'pageBlockDetails':
      inspectText(block.title);
      block.blocks.forEach((child) => inspectAutolinkBlock(child, state));
      return;
    case 'pageBlockList':
    case 'pageBlockOrderedList':
      block.items.forEach((item) => {
        if(item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText') inspectText(item.text);
        else item.blocks.forEach((child) => inspectAutolinkBlock(child, state));
      });
      return;
    case 'pageBlockTable':
      inspectText(block.title);
      block.rows.forEach((row) => row.cells.forEach((cell) => inspectText(cell.text)));
      return;
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      inspectCaption(block.caption);
      return;
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      inspectCaption(block.caption);
      block.items.forEach((item) => inspectAutolinkBlock(item, state));
      return;
    // a button's label is its own; nothing in it links by itself
    case 'pageBlockButtonRow':
      block.buttons.forEach((button) => inspectAutolinkRichText(button.text, state, true));
      return;
    default:
      return;
  }
}

export default function inferRichMessageNoAutolink(message: RichMessage | InputRichMessage.inputRichMessage) {
  if(message._ === 'inputRichMessage') return !!message.pFlags.noautolink;
  const state = {auto: false, candidate: false};
  message.blocks.forEach((block) => inspectAutolinkBlock(block, state));
  return state.candidate && !state.auto;
}
