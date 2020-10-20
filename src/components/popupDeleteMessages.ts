import appChatsManager from "../lib/appManagers/appChatsManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import $rootScope from "../lib/rootScope";
import { PopupButton } from "./popup";
import PopupPeer from "./popupPeer";

export default class PopupDeleteMessages {
  constructor(mids: number[], onConfirm?: () => void) {
    const peerID = $rootScope.selectedPeerID;
    const firstName = appPeersManager.getPeerTitle(peerID, false, true);

    mids = mids.slice();
    const callback = (revoke: boolean) => {
      onConfirm && onConfirm();
      appMessagesManager.deleteMessages(mids, revoke);
    };

    let title: string, description: string, buttons: PopupButton[];
    title = `Delete Message${mids.length == 1 ? '' : 's'}?`;
    description = `Are you sure you want to delete ${mids.length == 1 ? 'this message' : 'these messages'}?`;

    if(peerID == $rootScope.myID) {
      buttons = [{
        text: 'DELETE',
        isDanger: true,
        callback: () => callback(false)
      }];
    } else {
      buttons = [{
        text: 'DELETE JUST FOR ME',
        isDanger: true,
        callback: () => callback(false)
      }];

      if(peerID > 0) {
        buttons.push({
          text: 'DELETE FOR ME AND ' + firstName,
          isDanger: true,
          callback: () => callback(true)
        });
      } else if(appChatsManager.hasRights(-peerID, 'deleteRevoke')) {
        buttons.push({
          text: 'DELETE FOR ALL',
          isDanger: true,
          callback: () => callback(true)
        });
      }
    }

    buttons.push({
      text: 'CANCEL',
      isCancel: true
    });

    const popup = new PopupPeer('popup-delete-chat', {
      peerID: peerID,
      title: title,
      description: description,
      buttons: buttons
    });

    popup.show();
  }
}