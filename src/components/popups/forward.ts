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
      placeholder: 'Forward to...',
      chatRightsAction: 'send_messages'
    });
  }
}
