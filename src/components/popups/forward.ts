/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager from "../../lib/appManagers/appImManager";
import PopupPickUser from "./pickUser";

export default class PopupForward extends PopupPickUser {
  constructor(fromPeerId: number, mids: number[], onSelect?: () => Promise<void> | void, onClose?: () => void) {
    super({
      peerTypes: ['dialogs', 'contacts'],
      onSelect: async(peerId) => {
        if(onSelect) {
          const res = onSelect();
          if(res instanceof Promise) {
            await res;
          }
        }

        appImManager.setInnerPeer(peerId);
        appImManager.chat.input.initMessagesForward(fromPeerId, mids.slice());
      },
      onClose,
      placeholder: 'ShareModal.Search.ForwardPlaceholder',
      chatRightsAction: 'send_messages'
    });
  }
}
