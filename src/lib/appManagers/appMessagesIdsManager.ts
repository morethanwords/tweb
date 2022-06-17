/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MESSAGE_ID_INCREMENT } from "./utils/messageId";
import generateMessageId from "./utils/messageId/generateMessageId";

export class AppMessagesIdsManager {
  private tempNum = 0;

  public generateTempMessageId(messageId: number) {
    const num = ++this.tempNum;
    return generateMessageId(messageId) + (num & (MESSAGE_ID_INCREMENT - 1));
  }
}
