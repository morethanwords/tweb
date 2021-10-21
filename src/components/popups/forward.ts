/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager from "../../lib/appManagers/appImManager";
import PopupPickUser from "./pickUser";

export default class PopupForward extends PopupPickUser {
  constructor(
    peerIdMids: {[frompeerId: PeerId]: number[]}, 
    onSelect?: (peerId: PeerId) => Promise<void> | void, 
    onClose?: () => void, 
    overrideOnSelect = false
  ) {
    super({
      peerTypes: ['dialogs', 'contacts'],
      onSelect: overrideOnSelect ? onSelect : async(peerId) => {
        if(onSelect) {
          const res = onSelect(peerId);
          if(res instanceof Promise) {
            await res;
          }
        }

        appImManager.setInnerPeer(peerId);
        appImManager.chat.input.initMessagesForward(peerIdMids);
      },
      onClose,
      placeholder: 'ShareModal.Search.ForwardPlaceholder',
      chatRightsAction: 'send_messages',
      selfPresence: 'ChatYourSelf'
    });
  }
}
