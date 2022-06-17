/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import generateMessageId from "./generateMessageId";
import getServerMessageId from "./getServerMessageId";

export default function incrementMessageId(messageId: number, increment: number) {
  return generateMessageId(getServerMessageId(messageId) + increment);
}
