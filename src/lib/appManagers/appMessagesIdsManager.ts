/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";

export class AppMessagesIdsManager {
  private static MESSAGE_ID_INCREMENT = 0x10000;
  private static MESSAGE_ID_OFFSET = 0xFFFFFFFF;

  private tempNum = 0;

  public generateMessageId(messageId: number, temp = false) {
    const q = AppMessagesIdsManager.MESSAGE_ID_OFFSET;
    const num = temp ? ++this.tempNum : 0;
    if(messageId >= q) {
      if(temp) {
        return messageId + (num & (AppMessagesIdsManager.MESSAGE_ID_INCREMENT - 1));
      }

      return messageId;
    }

    return q + (messageId * AppMessagesIdsManager.MESSAGE_ID_INCREMENT + (num & (AppMessagesIdsManager.MESSAGE_ID_INCREMENT - 1)));
  }

  /**
   * * will ignore outgoing offset
   */
  public getServerMessageId(messageId: number) {
    return this.clearMessageId(messageId, true);
  }

  public clearMessageId(messageId: number, toServer?: boolean) {
    const q = AppMessagesIdsManager.MESSAGE_ID_OFFSET;
    if(messageId < q) { // id 0 -> mid 0xFFFFFFFF, so 0xFFFFFFFF must convert to 0
      return messageId;
    }

    const l = AppMessagesIdsManager.MESSAGE_ID_INCREMENT - 1;
    const used = messageId & l;
    if(used !== l) {
      messageId -= used + 1;
    }

    return toServer ? (messageId - q) / AppMessagesIdsManager.MESSAGE_ID_INCREMENT : messageId;
  }

  public incrementMessageId(messageId: number, increment: number) {
    return this.generateMessageId(this.getServerMessageId(messageId) + increment);
  }
}
