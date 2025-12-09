import {RichText, TextWithEntities, MessageEntity} from '../../layer';
import wrapTextWithEntities from './wrapTextWithEntities';

type Options = {
  webPageId: Long,
  url: string,
  randomId: string
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
    case 'textUrl':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityTextUrl',
        offset,
        length,
        url: richText.webpage_id ?
          'tg://iv?url=' + encodeURIComponent(richText.url) :
          richText.url
      }), options);
    case 'textEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length
      }), options);
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
        length
      }), options);
    case 'textImage':
      return wrapEntity({_: 'textPlain', text: '\x01'}, (offset, length) => ({
        _: 'messageEntityCustomEmoji',
        document_id: richText.document_id,
        offset,
        length,
        w: richText.w,
        h: richText.h
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
        name: (options?.randomId || '') + richText.name
        // url: 'tg://iv?' + (url ?
        //   'url=' + encodeURIComponent(url.toString()) :
        //   'anchor=' + encodeURIComponent('#' + richText.name)
        // )
      }), options);
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
