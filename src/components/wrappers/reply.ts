/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Message } from "../../layer";
import getPeerColorById from "../../lib/appManagers/utils/peers/getPeerColorById";
import ReplyContainer from "../chat/replyContainer";

export default function wrapReply(
  title: Parameters<ReplyContainer['fill']>[0], 
  subtitle: Parameters<ReplyContainer['fill']>[1], 
  message?: Message.message | Message.messageService,
  setColorPeerId?: PeerId
) {
  const replyContainer = new ReplyContainer('reply');
  const fillPromise = replyContainer.fill(title, subtitle, message);

  if(setColorPeerId) {
    const hex = getPeerColorById(setColorPeerId, false);
    replyContainer.border.style.backgroundColor = hex;
    replyContainer.title.style.color = hex;
  }

  return {container: replyContainer.container, fillPromise};
}
