import {MessageEntity, TextWithEntities} from '../../../layer';
import parseEntities from '../../../lib/richTextProcessor/parseEntities';


export type ExtractEmojiFromFilterTitleResult = {
  text: TextWithEntities.textWithEntities;
  docId?: DocId;
  emoji?: string;
};

function canBeRemoved(len: number, entity: MessageEntity.messageEntityCustomEmoji  | MessageEntity.messageEntityEmoji) {
  return entity.offset === 0 || entity.offset + entity.length === len;
}

export default function extractEmojiFromFilterTitle(textWithEntities: TextWithEntities.textWithEntities): ExtractEmojiFromFilterTitleResult {
  const {text, entities} = textWithEntities;

  const emojis = entities.filter(entity => entity._ === 'messageEntityCustomEmoji');
  const otherEmojis = parseEntities(text).filter(entity => entity._ === 'messageEntityEmoji');
  const includedEmojis = emojis.length ? emojis : otherEmojis;
  const [emojiEntity] = includedEmojis;

  if(includedEmojis.length !== 1 || !canBeRemoved(text.length, emojiEntity)) return {
    text: textWithEntities
  };

  const resultingTextWithEntities: TextWithEntities.textWithEntities = {
    _: 'textWithEntities',
    text: (text.slice(0, emojiEntity.offset) + text.slice(emojiEntity.offset + emojiEntity.length)).trim(),
    entities: []
  };

  let docId: DocId;
  let emoji: string;

  if(emojiEntity._ === 'messageEntityCustomEmoji') docId = emojiEntity.document_id;
  if(emojiEntity._ === 'messageEntityEmoji') emoji = text.slice(emojiEntity.offset, emojiEntity.offset + emojiEntity.length);

  return {
    text: resultingTextWithEntities,
    docId,
    emoji
  };
}
