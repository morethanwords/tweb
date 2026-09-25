import {
  InlineButtonType,
  InputRichMessage,
  PageBlock,
  PageCaption,
  PageListItem,
  PageListOrderedItem,
  RichText
} from '@layer';

export type InputRichMessageReferences = {
  userIds: Array<string | number>,
  documentIds: Array<string | number>,
  photoIds: Array<string | number>
};

function addId(ids: Map<string, string | number>, id: string | number) {
  const key = String(id);
  if(!ids.has(key)) {
    ids.set(key, id);
  }
}

export default function collectInputRichMessageReferences(
  input: InputRichMessage.inputRichMessage
): InputRichMessageReferences {
  const userIds = new Map<string, string | number>();
  const documentIds = new Map<string, string | number>();
  const photoIds = new Map<string, string | number>();

  // a profile button names its user by id; the users vector is what lets the server find them
  const visitButton = (button: {text: RichText, type: InlineButtonType}) => {
    if(button.type._ === 'inlineButtonTypeUserProfile') {
      addId(userIds, button.type.user_id);
    }
    visitText(button.text);
  };

  const visitText = (text: RichText) => {
    switch(text._) {
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
      case 'textDate':
        visitText(text.text);
        break;
      case 'textConcat':
        text.texts.forEach(visitText);
        break;
      case 'textMentionName':
        addId(userIds, text.user_id);
        visitText(text.text);
        break;
      case 'textImage':
      case 'textCustomEmoji':
        addId(documentIds, text.document_id);
        break;
      case 'textButton':
        visitButton(text);
        break;
    }
  };

  const visitCaption = (caption: PageCaption) => {
    visitText(caption.text);
    visitText(caption.credit);
  };

  const visitListItem = (item: PageListItem) => {
    if(item._ === 'pageListItemText') {
      visitText(item.text);
    } else {
      item.blocks.forEach(visitBlock);
    }
  };

  const visitOrderedListItem = (item: PageListOrderedItem) => {
    if(item._ === 'pageListOrderedItemText') {
      visitText(item.text);
    } else {
      item.blocks.forEach(visitBlock);
    }
  };

  function visitBlock(block: PageBlock) {
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
        visitText(block.text);
        break;
      case 'pageBlockAuthorDate':
        visitText(block.author);
        break;
      case 'pageBlockList':
        block.items.forEach(visitListItem);
        break;
      case 'pageBlockOrderedList':
        block.items.forEach(visitOrderedListItem);
        break;
      case 'pageBlockBlockquote':
      case 'pageBlockPullquote':
        visitText(block.text);
        visitText(block.caption);
        break;
      case 'pageBlockPhoto':
        addId(photoIds, block.photo_id);
        visitCaption(block.caption);
        break;
      case 'pageBlockEmbed':
        if(block.poster_photo_id !== undefined) {
          addId(photoIds, block.poster_photo_id);
        }
        visitCaption(block.caption);
        break;
      case 'pageBlockMap':
      case 'inputPageBlockMap':
        visitCaption(block.caption);
        break;
      case 'pageBlockVideo':
        addId(documentIds, block.video_id);
        visitCaption(block.caption);
        break;
      case 'pageBlockAudio':
        addId(documentIds, block.audio_id);
        visitCaption(block.caption);
        break;
      case 'pageBlockDocument':
        addId(documentIds, block.document_id);
        visitCaption(block.caption);
        break;
      case 'pageBlockButtonRow':
        block.buttons.forEach(visitButton);
        break;
      case 'pageBlockCover':
        visitBlock(block.cover);
        break;
      case 'pageBlockEmbedPost':
        addId(photoIds, block.author_photo_id);
        block.blocks.forEach(visitBlock);
        visitCaption(block.caption);
        break;
      case 'pageBlockCollage':
      case 'pageBlockSlideshow':
        block.items.forEach(visitBlock);
        visitCaption(block.caption);
        break;
      case 'pageBlockTable':
        visitText(block.title);
        block.rows.forEach((row) => {
          row.cells.forEach((cell) => {
            if(cell.text) {
              visitText(cell.text);
            }
          });
        });
        break;
      case 'pageBlockDetails':
        visitText(block.title);
        block.blocks.forEach(visitBlock);
        break;
      case 'pageBlockRelatedArticles':
        visitText(block.title);
        block.articles.forEach((article) => {
          if(article.photo_id !== undefined) {
            addId(photoIds, article.photo_id);
          }
        });
        break;
      case 'pageBlockBlockquoteBlocks':
        block.blocks.forEach(visitBlock);
        visitText(block.caption);
        break;
    }
  }

  input.blocks.forEach(visitBlock);

  return {
    userIds: [...userIds.values()],
    documentIds: [...documentIds.values()],
    photoIds: [...photoIds.values()]
  };
}
