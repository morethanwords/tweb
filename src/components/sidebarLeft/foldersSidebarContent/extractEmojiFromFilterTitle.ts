import {MessageEntity, TextWithEntities} from '../../../layer';

export type ExtractEmojiFromFilterTitleResult = {
  text: TextWithEntities.textWithEntities;
  docId?: DocId;
};

function canBeRemoved(len: number, entity: MessageEntity.messageEntityCustomEmoji) {
  return entity.offset === 0 || entity.offset + entity.length === len;
}

export default function extractEmojiFromFilterTitle(textWithEntities: TextWithEntities.textWithEntities): ExtractEmojiFromFilterTitleResult {
  const {text, entities} = textWithEntities;

  const emojis = entities.filter(entity => entity._ === 'messageEntityCustomEmoji');
  const [emoji] = emojis;

  if(emojis.length !== 1 || !canBeRemoved(text.length, emoji)) return {
    text: textWithEntities
  };

  const resultingTextWithEntities: TextWithEntities.textWithEntities = {
    _: 'textWithEntities',
    text: (text.slice(0, emoji.offset) + text.slice(emoji.offset + emoji.length)).trim(),
    entities: []
  };

  return {
    text: resultingTextWithEntities,
    docId: emoji.document_id
  };
}
