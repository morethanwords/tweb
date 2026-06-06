import {MessageEntity} from '@layer';
import getEmojiEntityFromEmoji from './getEmojiEntityFromEmoji';

type Args = {
  docId?: DocId;
  emoji: string;
};

export function getMessageEntityForEmojiWithDocId({docId, emoji}: Args): MessageEntity {
  if(!docId) return getEmojiEntityFromEmoji(emoji);

  return {
    _: 'messageEntityCustomEmoji',
    document_id: docId,
    length: emoji?.length ?? 0,
    offset: 0
  };
}
