/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MESSAGE_ID_OFFSET, MESSAGE_ID_INCREMENT } from ".";

export default function generateMessageId(messageId: number) {
  const q = MESSAGE_ID_OFFSET;
  if(messageId >= q) {
    return messageId;
  }

  return q + (messageId * MESSAGE_ID_INCREMENT);
}
