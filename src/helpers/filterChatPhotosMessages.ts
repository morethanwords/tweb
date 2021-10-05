/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Message, MessageAction } from "../layer";
import type { MyMessage } from "../lib/appManagers/appMessagesManager";
import { forEachReverse } from "./array";

export default function filterChatPhotosMessages(value: {
  count: number;
  next_rate: number;
  offset_id_offset: number;
  history: MyMessage[];
}) {
  forEachReverse(value.history, (message, idx, arr) => {
    if(!((message as Message.messageService).action as MessageAction.messageActionChatEditPhoto).photo) {
      arr.splice(idx, 1);
      if(value.count !== undefined) {
        --value.count;
      }
    }
  });
}
