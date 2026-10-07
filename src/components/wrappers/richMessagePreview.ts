import type {MyDocument} from '@appManagers/appDocsManager';
import type {MessageEntity, MessageMedia, PageBlock, PageListItem, PageListOrderedItem, RichMessage, RichText, TextWithEntities} from '@layer';
import getAudioAttribute from '@appManagers/utils/docs/getAudioAttribute';
import I18n, {LangPackKey} from '@lib/langPack';
import {getOrderedListItemNumber, wrapSummaryRichText} from '@lib/richMessage';
import sortEntities from '@lib/richTextProcessor/sortEntities';
import {sliceTextWithEntities, sliceTextWithEntitiesAtGraphemeBoundaries} from '@lib/richTextProcessor/sliceTextWithEntities';

type Preview = TextWithEntities.textWithEntities;

// Android's two spaces between blocks, the first one unbreakable so HTML does not fold them into one
const SEPARATOR = '\u00A0 ';

/**
 * A rich message in one line, the way Android writes it for a reply, a chat list row and a draft
 * (`MessageObject.formatRichMessage`): blocks two spaces apart, headings and quotes in bold, a list
 * item behind its bullet, number or checkbox, media by its kind. A formula, a table, an audio, a
 * file and a checkbox get an icon inside the text, over the character Android puts under its image.
 */
export default function getRichMessagePreview(richMessage: RichMessage, maxLength = 150): Preview {
  const preview: Preview = {_: 'textWithEntities', text: '', entities: []};
  appendJoined(preview, richMessage.blocks || [], (block) => appendBlock(preview, richMessage, block));
  trim(preview);
  truncate(preview, maxLength);
  sortEntities(preview.entities);
  return preview;
}

/**
 * The photo or video a reply to a rich message shows, as Android picks it (`MessageObject.findVideo`,
 * `findPhoto`): the first video, or the first photo when there is none, among the top blocks and the
 * items of the first collage or slideshow. A video without a thumbnail shows nothing.
 */
export function getRichMessagePreviewMedia(richMessage: RichMessage): MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument {
  const video = findRichMedia(richMessage?.blocks, 'pageBlockVideo');
  if(video) {
    const document = findDocument(richMessage, video.video_id);
    return document?.thumbs?.length ? {_: 'messageMediaDocument', pFlags: {spoiler: video.pFlags.spoiler}, document} : undefined;
  }

  const photo = findRichMedia(richMessage?.blocks, 'pageBlockPhoto');
  const found = photo && richMessage.photos?.find((item) => item.id === photo.photo_id);
  return found && {_: 'messageMediaPhoto', pFlags: {spoiler: photo.pFlags.spoiler}, photo: found};
}

function findRichMedia<T extends 'pageBlockPhoto' | 'pageBlockVideo'>(blocks: PageBlock[], type: T): Extract<PageBlock, {_: T}> {
  for(const block of blocks || []) {
    if(block._ === type) {
      return block as Extract<PageBlock, {_: T}>;
    } else if(block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow') {
      return findRichMedia(block.items, type);
    }
  }
}

function appendBlock(preview: Preview, richMessage: RichMessage, block: PageBlock) {
  switch(block._) {
    case 'pageBlockTitle':
    case 'pageBlockHeader':
    case 'pageBlockSubheader':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      appendRichText(preview, block.text, 'messageEntityBold');
      break;
    case 'pageBlockParagraph':
    case 'pageBlockFooter':
    case 'pageBlockKicker':
      appendRichText(preview, block.text);
      break;
    case 'pageBlockPreformatted':
      appendRichText(preview, block.text, 'messageEntityCode');
      break;
    case 'pageBlockBlockquoteBlocks':
      appendJoined(preview, block.blocks, (block) => appendBlock(preview, richMessage, block));
      break;
    case 'pageBlockDetails':
      appendRichText(preview, block.title);
      break;
    case 'pageBlockAuthorDate':
      appendRichText(preview, block.author);
      break;
    case 'pageBlockMath':
      appendIcon(preview, 'formula', 'fx');
      appendText(preview, ' ' + label('AccDescrIVFormula'));
      break;
    case 'pageBlockMap':
      appendText(preview, label('Map'));
      if(hasText(block.caption?.text)) {
        appendText(preview, SEPARATOR);
        appendRichText(preview, block.caption.text);
      }
      break;
    case 'pageBlockList':
      appendJoined(preview, block.items, (item) => {
        if(item.pFlags.checkbox) appendCheckbox(preview, item.pFlags.checked);
        else appendText(preview, '• ');
        appendListItem(preview, richMessage, item);
      });
      break;
    case 'pageBlockOrderedList':
      appendJoined(preview, block.items, (item, index) => {
        appendText(preview, getOrderedListItemNumber(block, index) + '. ');
        if(item.pFlags.checkbox) appendCheckbox(preview, item.pFlags.checked);
        appendListItem(preview, richMessage, item);
      });
      break;
    case 'pageBlockTable':
      appendIcon(preview, 'table', '⊞');
      appendText(preview, ' ');
      if(hasText(block.title)) appendRichText(preview, block.title);
      else appendText(preview, label('AccDescrIVTable'));
      break;
    case 'pageBlockAudio': {
      const document = findDocument(richMessage, block.audio_id);
      const attribute = getAudioAttribute(document);
      const name = (attribute?.performer && attribute.title ? `${attribute.performer} – ${attribute.title}` : attribute?.title) ||
        document?.file_name;
      if(name) {
        appendIcon(preview, 'note_filled', '🎵');
        appendText(preview, ' ' + name);
      }
      break;
    }
    case 'pageBlockDocument': {
      const document = findDocument(richMessage, block.document_id);
      if(document) {
        appendIcon(preview, 'document', '📎');
        appendText(preview, ' ' + (document.file_name || label('AttachDocument')));
      }
      break;
    }
    case 'pageBlockCover':
      appendBlock(preview, richMessage, block.cover);
      break;
    case 'pageBlockPhoto':
      appendText(preview, label('AttachPhoto'));
      break;
    case 'pageBlockVideo':
      appendText(preview, label('AttachVideo'));
      break;
    case 'pageBlockCollage':
      appendText(preview, label('AccDescrCollage'));
      break;
    case 'pageBlockSlideshow':
      appendText(preview, label('AccDescrIVSlideshow'));
      break;
    case 'pageBlockUnsupported':
      appendText(preview, label('UnsupportedAttachment'));
      break;
    case 'pageBlockButtonRow':
      appendJoined(preview, block.buttons, (button) => appendRichText(preview, button.text));
      break;
  }
}

function appendListItem(preview: Preview, richMessage: RichMessage, item: PageListItem | PageListOrderedItem) {
  if('text' in item) appendRichText(preview, item.text);
  else appendJoined(preview, item.blocks, (block) => appendBlock(preview, richMessage, block));
}

/** Appends what each item gives, a separator apart; an item that gives nothing leaves no gap. */
function appendJoined<T>(preview: Preview, items: T[], append: (item: T, index: number) => void) {
  let joined = false;
  items.forEach((item, index) => {
    const length = preview.text.length;
    if(joined) preview.text += SEPARATOR;
    const start = preview.text.length;
    append(item, index);
    if(preview.text.length === start) preview.text = preview.text.slice(0, length);
    else joined = true;
  });
}

function appendRichText(preview: Preview, richText: RichText, style?: 'messageEntityBold' | 'messageEntityCode') {
  const {text, entities} = wrapSummaryRichText(richText);
  if(!text.trim()) {
    return;
  }

  const offset = preview.text.length;
  // one line: a line break is a space there, the same length, so no entity moves
  preview.text += text.replace(/\n/g, ' ');
  for(const entity of entities || []) {
    preview.entities.push({...entity, offset: entity.offset + offset});
  }

  if(style) {
    preview.entities.push({_: style, offset, length: text.length});
  }
}

function appendText(preview: Preview, text: string) {
  preview.text += text;
}

function appendIcon(preview: Preview, icon: Icon, text: string) {
  preview.entities.push({_: 'messageEntityIcon', offset: preview.text.length, length: text.length, icon});
  preview.text += text;
}

function appendCheckbox(preview: Preview, checked: boolean) {
  appendIcon(preview, checked ? 'checkboxon' : 'checkboxempty', checked ? '✅' : '☑️');
  appendText(preview, ' ');
}

/** Drops the blank a first block starts with or a last one ends with, moving the entities along. */
function trim(preview: Preview) {
  const start = preview.text.length - preview.text.trimStart().length;
  preview.text = preview.text.trim();
  const end = preview.text.length;
  preview.entities = preview.entities.map((entity): MessageEntity => {
    const offset = Math.max(0, entity.offset - start);
    return {...entity, offset, length: Math.min(end, entity.offset + entity.length - start) - offset};
  }).filter((entity) => entity.length > 0);
}

/**
 * Cuts the text at `maxLength` and adds an ellipsis, never through an emoji, a link or a custom
 * emoji (`sliceTextWithEntities`), nor through an icon, which goes with the text it stands for.
 */
function truncate(preview: Preview, maxLength: number) {
  if(preview.text.length <= maxLength) {
    return;
  }

  let end = maxLength;
  for(const entity of preview.entities) {
    if(entity._ === 'messageEntityIcon' && entity.offset < end && entity.offset + entity.length > end) {
      end = entity.offset;
    }
  }

  const sliced = sliceTextWithEntities(preview.text, preview.entities, 0, end);
  // and not on the blank between two words
  const {text, entities} = sliceTextWithEntitiesAtGraphemeBoundaries(sliced.text, sliced.entities, 0, sliced.text.trimEnd().length);
  preview.text = text + '…';
  preview.entities = entities;
}

function hasText(richText: RichText) {
  return !!richText && !!wrapSummaryRichText(richText).text.trim();
}

function findDocument(richMessage: RichMessage, id: string | number) {
  return richMessage.documents?.find((document) => document.id === id) as MyDocument;
}

function label(key: LangPackKey) {
  return I18n.format(key, true);
}
