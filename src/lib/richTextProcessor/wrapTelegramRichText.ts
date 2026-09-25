import {RichText, TextWithEntities, MessageEntity} from '@layer';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';
import {encodeInlineMath} from '@helpers/math/mathMarker';

type Options = {
  webPageId: Long,
  url: string,
  randomId: string,
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

function processRichText(richText: RichText, options: Options): TextWithEntities {
  switch(richText._) {
    case 'textEmpty':
      return {
        _: 'textWithEntities',
        text: '',
        entities: []
      };
    case 'textPlain':
      return {
        _: 'textWithEntities',
        text: richText.text,
        entities: []
      };
    case 'textConcat': {
      let text = '';
      const entities: MessageEntity[] = [];
      for(const part of richText.texts) {
        const partResult = processRichText(part, options);
        for(const entity of partResult.entities) {
          entities.push({
            ...entity,
            offset: entity.offset + text.length
          });
        }
        text += partResult.text;
      }
      return {
        _: 'textWithEntities',
        text,
        entities
      };
    }
    case 'textBold':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBold',
        offset,
        length
      }), options);
    case 'textItalic':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityItalic',
        offset,
        length
      }), options);
    case 'textUnderline':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityUnderline',
        offset,
        length
      }), options);
    case 'textStrike':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityStrike',
        offset,
        length
      }), options);
    case 'textFixed':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityCode',
        offset,
        length
      }), options);
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
      }), options);
    }
    case 'textEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length,
        richTextTarget: richText.email
      } as MessageEntity), options);
    case 'textMarked':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityHighlight',
        offset,
        length
      }), options);
    case 'textPhone':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityPhone',
        offset,
        length,
        richTextTarget: richText.phone
      } as MessageEntity), options);
    case 'textMath':
      // Carry inline math as a base64 marker (like master's markdown path) so the IV's
      // RichTextRenderer -> hydrateInlineMath() renders it with Temml. Consumers that want plain
      // text (e.g. reply/search summaries) decode the marker back to the raw LaTeX source.
      return {
        _: 'textWithEntities',
        text: encodeInlineMath(richText.source),
        entities: []
      };
    case 'textImage':
      return wrapEntity({_: 'textPlain', text: '\x01'}, (offset, length) => ({
        _: 'messageEntityCustomEmoji',
        document_id: richText.document_id,
        offset,
        length,
        w: richText.w,
        h: richText.h
      }), options);
    case 'textCustomEmoji':
      return wrapEntity({_: 'textPlain', text: richText.alt || '\x01'}, (offset, length) => ({
        _: 'messageEntityCustomEmoji',
        document_id: richText.document_id,
        offset,
        length
      }), options);
    case 'textSpoiler':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySpoiler',
        offset,
        length
      }), options);
    case 'textMention':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityMention',
        offset,
        length
      }), options);
    case 'textHashtag':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityHashtag',
        offset,
        length
      }), options);
    case 'textBotCommand':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBotCommand',
        offset,
        length
      }), options);
    case 'textCashtag':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityCashtag',
        offset,
        length
      }), options);
    case 'textAutoUrl':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityUrl',
        offset,
        length
      }), options);
    case 'textAutoEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length
      }), options);
    case 'textAutoPhone':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityPhone',
        offset,
        length
      }), options);
    case 'textBankCard':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityBankCard',
        offset,
        length
      }), options);
    case 'textMentionName':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityMentionName',
        offset,
        length,
        user_id: richText.user_id
      }), options);
    case 'textDate':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityFormattedDate',
        pFlags: richText.pFlags,
        offset,
        length,
        date: richText.date
      }), options);
    case 'textSubscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySubscript',
        offset,
        length
      } as any), options);
    case 'textSuperscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySuperscript',
        offset,
        length
      } as any), options);
    case 'textAnchor': {
      // const url = options?.url && new URL(options.url);
      // if(url) url.hash = richText.name;
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityAnchor',
        offset,
        length,
        name: (options?.randomId || '') + richText.name,
        richTextReference: length > 0
        // url: 'tg://iv?' + (url ?
        //   'url=' + encodeURIComponent(url.toString()) :
        //   'anchor=' + encodeURIComponent('#' + richText.name)
        // )
      } as MessageEntity), options);
    }
    case 'textDiff': {
      const updated = processRichText(richText.text, options);
      if(!options?.displayTextDiff) return updated;

      const old = processRichText(richText.old_text, options);
      const updatedOffset = old.text.length;
      return {
        _: 'textWithEntities',
        text: old.text + updated.text,
        entities: [
          {
            _: 'messageEntityDiffDelete',
            offset: 0,
            length: old.text.length
          },
          ...old.entities,
          {
            _: 'messageEntityDiffInsert',
            offset: updatedOffset,
            length: updated.text.length
          },
          ...updated.entities.map((entity) => ({
            ...entity,
            offset: entity.offset + updatedOffset
          }))
        ]
      };
    }
    case 'textButton': {
      // layer 229's inline page button. The entity only marks where it is; the page that shows
      // it decides what it does. A link button also carries the link itself, so opening it goes
      // through the same checks as any other link in the text.
      const label = processRichText(richText.text, options);
      const length = label.text.length;
      if(!length) return label;
      const entities: MessageEntity[] = [{_: 'messageEntityRichButton', offset: 0, length, button: richText}];
      if(richText.type._ === 'inlineButtonTypeUrl') {
        entities.push({_: 'messageEntityTextUrl', offset: 0, length, url: richText.type.url});
      }
      return {
        _: 'textWithEntities',
        text: label.text,
        entities: [...entities, ...label.entities]
      };
    }
    default:
      return {
        _: 'textWithEntities',
        text: '',
        entities: []
      };
  }
}

function wrapEntity(
  innerRichText: RichText,
  createEntity: (offset: number, length: number) => MessageEntity,
  options: Options
): TextWithEntities {
  const innerResult = processRichText(innerRichText, options);
  const entity = createEntity(0, innerResult.text.length);
  return {
    _: 'textWithEntities',
    text: innerResult.text,
    entities: [entity, ...innerResult.entities]
  };
}
