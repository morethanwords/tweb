import {MessageEntity} from '@layer';
import spoiler from '@lib/richTextProcessor/spoiler';

export default function encodeSpoiler(text: string, entity: MessageEntity.messageEntitySpoiler) {
  const before = text.slice(0, entity.offset);
  const spoilerBefore = text.slice(entity.offset, entity.offset + entity.length);
  const spoilerAfter = spoiler(spoilerBefore)/*  '▚'.repeat(entity.length) */;
  const after = text.slice(entity.offset + entity.length);
  text = before + spoilerAfter + after;
  return {text, entityText: spoilerAfter};
};
