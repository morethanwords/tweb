/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import { MessageEntity } from "../../layer";
import RichTextProcessor from "../../lib/richtextprocessor";
import getRichElementValue from "./getRichElementValue";

export default function getRichValue(field: HTMLElement, withEntities = true) {
  const lines: string[] = [];
  const line: string[] = [];

  const entities: MessageEntity[] = withEntities ? [] : undefined;
  getRichElementValue(field, lines, line, undefined, undefined, entities);
  if(line.length) {
    lines.push(line.join(''));
  }

  let value = lines.join('\n');
  value = value.replace(/\u00A0/g, ' ');

  if(entities) {
    RichTextProcessor.combineSameEntities(entities);
  }

  //console.log('getRichValue:', value, entities);

  return {value, entities};
}

MOUNT_CLASS_TO.getRichValue = getRichValue;
