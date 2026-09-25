import type {PageBlock, RichText} from '@layer';
import concatRichText from '@lib/richTextProcessor/concatRichText';

export function inputRichText(text: RichText): RichText {
  switch(text._) {
    case 'textMention':
    case 'textHashtag':
    case 'textBotCommand':
    case 'textCashtag':
    case 'textAutoUrl':
    case 'textAutoEmail':
    case 'textAutoPhone':
    case 'textBankCard':
    case 'textDiff':
      return inputRichText(text.text);
    case 'textConcat':
      return concatRichText(text.texts.map(inputRichText));
    case 'textUrl':
      return {
        ...text,
        text: inputRichText(text.text),
        webpage_id: 0
      };
    case 'textBold':
    case 'textItalic':
    case 'textUnderline':
    case 'textStrike':
    case 'textFixed':
    case 'textEmail':
    case 'textSubscript':
    case 'textSuperscript':
    case 'textMarked':
    case 'textPhone':
    case 'textAnchor':
    case 'textSpoiler':
    case 'textMentionName':
    case 'textDate':
    case 'textButton':
      return {...text, text: inputRichText(text.text)};
    default:
      return text;
  }
}

function inputPageCaption(caption: PageBlock.pageBlockPhoto['caption']) {
  return {
    _: 'pageCaption' as const,
    text: inputRichText(caption.text),
    credit: inputRichText(caption.credit)
  };
}

export function inputPageBlock(block: PageBlock): PageBlock {
  switch(block._) {
    case 'pageBlockParagraph':
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6':
    case 'pageBlockPreformatted':
    case 'pageBlockThinking':
    case 'pageBlockFooter':
      return {...block, text: inputRichText(block.text)};
    case 'pageBlockBlockquote':
    case 'pageBlockPullquote':
      return {...block, text: inputRichText(block.text), caption: inputRichText(block.caption)};
    case 'pageBlockBlockquoteBlocks':
      return {...block, blocks: block.blocks.map(inputPageBlock), caption: inputRichText(block.caption)};
    case 'pageBlockDetails':
      return {...block, blocks: block.blocks.map(inputPageBlock), title: inputRichText(block.title)};
    case 'pageBlockList':
      return {...block, items: block.items.map((item) => item._ === 'pageListItemText' ?
        {...item, text: inputRichText(item.text)} : {...item, blocks: item.blocks.map(inputPageBlock)})};
    case 'pageBlockOrderedList':
      return {...block, items: block.items.map((item) => {
        const result = item._ === 'pageListOrderedItemText' ?
          {...item, text: inputRichText(item.text)} : {...item, blocks: item.blocks.map(inputPageBlock)};
        delete result.num;
        return result;
      })};
    case 'pageBlockTable':
      return {...block, title: inputRichText(block.title), rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => cell.text ? {...cell, text: inputRichText(cell.text)} : {...cell})
      }))};
    case 'pageBlockPhoto':
      return {
        _: 'pageBlockPhoto',
        pFlags: {spoiler: block.pFlags.spoiler},
        photo_id: block.photo_id,
        caption: inputPageCaption(block.caption)
      };
    case 'pageBlockVideo':
      return {
        _: 'pageBlockVideo',
        pFlags: {spoiler: block.pFlags.spoiler},
        video_id: block.video_id,
        caption: inputPageCaption(block.caption)
      };
    case 'pageBlockAudio':
      return {...block, caption: inputPageCaption(block.caption)};
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      return {
        ...block,
        items: block.items.map(inputPageBlock),
        caption: inputPageCaption(block.caption)
      };
    case 'pageBlockMap':
      return {
        _: 'inputPageBlockMap',
        geo: block.geo._ === 'geoPoint' ? {
          _: 'inputGeoPoint',
          lat: block.geo.lat,
          long: block.geo.long,
          accuracy_radius: block.geo.accuracy_radius
        } : {_: 'inputGeoPointEmpty'},
        zoom: block.zoom,
        w: block.w,
        h: block.h,
        caption: inputPageCaption(block.caption)
      };
    case 'inputPageBlockMap':
      return {...block, caption: inputPageCaption(block.caption)};
    case 'pageBlockButtonRow':
      return {...block, buttons: block.buttons.map((button) => ({...button, text: inputRichText(button.text)}))};
    default:
      return block;
  }
}
