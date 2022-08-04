/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import clearMessageId from './clearMessageId';

/**
 * * will ignore outgoing offset
 */
export default function getServerMessageId(messageId: number) {
  return clearMessageId(messageId, true);
}
