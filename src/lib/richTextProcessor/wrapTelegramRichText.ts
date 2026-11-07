import {RichText, TextWithEntities, MessageEntity} from '@layer';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';
import {encodeInlineMath} from '@helpers/math/mathMarker';
import type {LocalTextWithEntities} from '@types';

type Options = {
  webPageId: Long,
  url: string,
  anchorPrefix: string,
  displayTextDiff?: boolean
};

export default function wrapTelegramRichText(
  richText: RichText,
  options?: Options
): TextWithEntities {
  const textWithEntities = wrapTextWithEntities(processRichText(richText, options));

  // if(!options) {
  //   return textWithEntities;
  // }

  // * convert textUrl to textAnchor
  // textWithEntities.entities.forEach((entity) => {
  //   if(entity._ === 'messageEntityTextUrl') {
  //     try {
  //       let url = new URL(entity.url);
  //       if(url.protocol !== 'tg:' || url.host !== 'iv') {
  //         return;
  //       }

  //       url = new URL(decodeURIComponent(url.searchParams.get('url')));
  //       const hash = url.hash;
  //       url.hash = '';
  //       if(url.toString() === options.url) {
  //         debugger;
  //       }
  //     } catch(err) {}
  //   }
  // });

  return textWithEntities;
}

// Every part of a rich text adds to one output, the text and entities made so far, where it stands: a part that
// returned its own, to be copied into its parent's at its offset, was copied again at every level above it.
function processRichText(richText: RichText, options: Options): TextWithEntities {
  const output: LocalTextWithEntities = {text: '', entities: []};
  appendRichText(richText, options, output);
  return {
    _: 'textWithEntities',
    text: output.text,
    entities: output.entities
  };
}

function appendRichText(richText: RichText, options: Options, output: LocalTextWithEntities): void {
  switch(richText._) {
    case 'textEmpty':
      return;
    case 'textPlain':
      output.text += richText.text;
      return;
    case 'textConcat': {
      for(const part of richText.texts) {
        appendRichText(part, options, output);
      }
      return;
    }
    case 'textBold':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBold',
        offset,
        length
      }), options, output);
    case 'textItalic':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityItalic',
        offset,
        length
      }), options, output);
    case 'textUnderline':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityUnderline',
        offset,
        length
      }), options, output);
    case 'textStrike':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityStrike',
        offset,
        length
      }), options, output);
    case 'textFixed':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityCode',
        offset,
        length
      }), options, output);
    case 'textUrl': {
      // fetchLong only returns a number for longs inside the safe-integer range — a bare truthy
      // check would take a stringified '0' for a real webpage
      const hasWebPage = !!richText.webpage_id && richText.webpage_id !== '0';
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityTextUrl',
        offset,
        length,
        url: hasWebPage ?
          'tg://iv?url=' + encodeURIComponent(richText.url) :
          richText.url,
        safe: hasWebPage
      }), options, output);
    }
    case 'textEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length,
        richTextTarget: richText.email
      } as MessageEntity), options, output);
    case 'textMarked':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityHighlight',
        offset,
        length
      }), options, output);
    case 'textPhone':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityPhone',
        offset,
        length,
        richTextTarget: richText.phone
      } as MessageEntity), options, output);
    case 'textMath':
      // Carry inline math as a base64 marker (like master's markdown path) so the IV's
      // RichTextRenderer -> hydrateInlineMath() renders it with Temml. Consumers that want plain
      // text (e.g. reply/search summaries) decode the marker back to the raw LaTeX source.
      output.text += encodeInlineMath(richText.source);
      return;
    case 'textImage':
      return wrapEntity({_: 'textPlain', text: '\x01'}, (offset, length) => ({
        _: 'messageEntityCustomEmoji',
        document_id: richText.document_id,
        offset,
        length,
        w: richText.w,
        h: richText.h
      }), options, output);
    case 'textCustomEmoji':
      return wrapEntity({_: 'textPlain', text: richText.alt || '\x01'}, (offset, length) => ({
        _: 'messageEntityCustomEmoji',
        document_id: richText.document_id,
        offset,
        length
      }), options, output);
    case 'textSpoiler':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySpoiler',
        offset,
        length
      }), options, output);
    case 'textMention':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityMention',
        offset,
        length
      }), options, output);
    case 'textHashtag':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityHashtag',
        offset,
        length
      }), options, output);
    case 'textBotCommand':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBotCommand',
        offset,
        length
      }), options, output);
    case 'textCashtag':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityCashtag',
        offset,
        length
      }), options, output);
    case 'textAutoUrl':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityUrl',
        offset,
        length
      }), options, output);
    case 'textAutoEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length
      }), options, output);
    case 'textAutoPhone':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityPhone',
        offset,
        length
      }), options, output);
    case 'textBankCard':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBankCard',
        offset,
        length
      }), options, output);
    case 'textTonAddress':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityTonAddress',
        offset,
        length
      }), options, output);
    case 'textMentionName':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityMentionName',
        offset,
        length,
        user_id: richText.user_id
      }), options, output);
    case 'textDate':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityFormattedDate',
        pFlags: richText.pFlags,
        offset,
        length,
        date: richText.date
      }), options, output);
    case 'textSubscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySubscript',
        offset,
        length
      } as any), options, output);
    case 'textSuperscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySuperscript',
        offset,
        length
      } as any), options, output);
    case 'textAnchor': {
      // * an anchor is a place of a page that its links go to, and its name is the server's as given: it is an
      // * element's id only on a page, made the page's own by its prefix. Text drawn anywhere else (a chat list row,
      // * a reply, a caption in the media viewer) keeps its text only - a bare id would shadow the app's own ids
      if(!options?.anchorPrefix) {
        return appendRichText(richText.text, options, output);
      }

      // const url = options?.url && new URL(options.url);
      // if(url) url.hash = richText.name;
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityAnchor',
        offset,
        length,
        name: options.anchorPrefix + richText.name,
        richTextReference: length > 0
        // url: 'tg://iv?' + (url ?
        //   'url=' + encodeURIComponent(url.toString()) :
        //   'anchor=' + encodeURIComponent('#' + richText.name)
        // )
      } as MessageEntity), options, output);
    }
    case 'textDiff': {
      if(!options?.displayTextDiff) return appendRichText(richText.text, options, output);

      // the old text, then the new one
      wrapEntity(richText.old_text, (offset, length) => ({
        _: 'messageEntityDiffDelete',
        offset,
        length
      }), options, output);
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityDiffInsert',
        offset,
        length
      }), options, output);
    }
    case 'textButton': {
      // layer 229's inline page button. The entity only marks where it is; the page that shows
      // it decides what it does. A link button also carries the link itself, so opening it goes
      // through the same checks as any other link in the text.
      const index = output.entities.length;
      const offset = output.text.length;
      appendRichText(richText.text, options, output);
      const length = output.text.length - offset;
      if(!length) return;
      const entities: MessageEntity[] = [{_: 'messageEntityRichButton', offset, length, button: richText}];
      if(richText.type._ === 'inlineButtonTypeUrl') {
        entities.push({_: 'messageEntityTextUrl', offset, length, url: richText.type.url});
      }
      // before the label's own, as an entity is before those inside it
      output.entities.splice(index, 0, ...entities);
      return;
    }
    default:
      return;
  }
}

function wrapEntity(
  innerRichText: RichText,
  createEntity: (offset: number, length: number) => MessageEntity,
  options: Options,
  output: LocalTextWithEntities
): void {
  const offset = output.text.length;
  // * its place before the entities inside it, which come next
  const index = output.entities.push(undefined) - 1;
  appendRichText(innerRichText, options, output);
  output.entities[index] = createEntity(offset, output.text.length - offset);
}
