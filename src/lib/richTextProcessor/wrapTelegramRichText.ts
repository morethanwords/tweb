import {RichText, TextWithEntities, MessageEntity} from '../../layer';
import wrapTextWithEntities from './wrapTextWithEntities';

export default function wrapTelegramRichText(richText: RichText): TextWithEntities {
  return wrapTextWithEntities(processRichText(richText));
}

function processRichText(richText: RichText): TextWithEntities {
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
        const partResult = processRichText(part);
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
      }));
    case 'textItalic':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityItalic',
        offset,
        length
      }));
    case 'textUnderline':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityUnderline',
        offset,
        length
      }));
    case 'textStrike':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityStrike',
        offset,
        length
      }));
    case 'textFixed':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityCode',
        offset,
        length
      }));
    case 'textUrl':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityTextUrl',
        offset,
        length,
        url: richText.webpage_id ? 'tg://iv?url=' + encodeURIComponent(richText.url) : richText.url
      }));
    case 'textEmail':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityEmail',
        offset,
        length
      }));
    case 'textMarked':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityHighlight',
        offset,
        length
      }));
    case 'textPhone':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityPhone',
        offset,
        length
      }));
    case 'textImage':
      // Placeholder for image
      return {
        _: 'textWithEntities',
        text: ' ',
        entities: [{
          _: 'messageEntityImage',
          offset: 0,
          length: 1,
          document_id: richText.document_id
        } as any]
      };
    case 'textSubscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySubscript',
        offset,
        length
      } as any));
    case 'textSuperscript':
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntitySuperscript',
        offset,
        length
      } as any));
    case 'textAnchor':
      debugger;
      return wrapEntity(richText.text, (offset, length) => ({
        _: 'messageEntityTextUrl',
        offset,
        length,
        url: '#' + richText.name
      }));
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
  createEntity: (offset: number, length: number) => MessageEntity
): TextWithEntities {
  const innerResult = processRichText(innerRichText);
  const entity = createEntity(0, innerResult.text.length);
  return {
    _: 'textWithEntities',
    text: innerResult.text,
    entities: [entity, ...innerResult.entities]
  };
}
