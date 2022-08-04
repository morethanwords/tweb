/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';
import spoiler from './spoiler';

export default function encodeSpoiler(text: string, entity: MessageEntity.messageEntitySpoiler) {
  const before = text.slice(0, entity.offset);
  const spoilerBefore = text.slice(entity.offset, entity.offset + entity.length);
  const spoilerAfter = spoiler(spoilerBefore)/*  '▚'.repeat(entity.length) */;
  const after = text.slice(entity.offset + entity.length);
  text = before + spoilerAfter + after;
  return {text, entityText: spoilerAfter};
};
