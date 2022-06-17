/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MESSAGE_ID_OFFSET, MESSAGE_ID_INCREMENT } from ".";

export default function clearMessageId(messageId: number, toServer?: boolean) {
  const q = MESSAGE_ID_OFFSET;
  if(messageId < q) { // id 0 -> mid 0xFFFFFFFF, so 0xFFFFFFFF must convert to 0
    return messageId;
  }

  const l = MESSAGE_ID_INCREMENT - 1;
  const used = messageId & l;
  if(used !== l) {
    messageId -= used + 1;
  }

  return toServer ? (messageId - q) / MESSAGE_ID_INCREMENT : messageId;
}
