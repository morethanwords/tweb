import { PopupButton } from ".";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager, { PeerType } from "../../lib/appManagers/appPeersManager";
import PopupPeer from "./peer";

export default class PopupDeleteDialog {
  constructor(peerId: number, peerType: PeerType = appPeersManager.getDialogType(peerId)) {
    let firstName = appPeersManager.getPeerTitle(peerId, false, true);

    let callbackFlush = (justClear?: true) => {
      appMessagesManager.flushHistory(peerId, justClear);
    };

    let callbackLeave = () => {
      appChatsManager.leave(-peerId);
    };

    let title: string, description: string, buttons: PopupButton[];
    switch(peerType) {
      case 'channel': {
        title = 'Leave Channel?';
        description = `Are you sure you want to leave this channel?`;
        buttons = [{
          text: 'LEAVE ' + firstName,
          isDanger: true,
          callback: callbackLeave
        }];

        break;
      }

      case 'megagroup': {
        title = 'Leave Group?';
        description = `Are you sure you want to leave this group?`;
        buttons = [{
          text: 'LEAVE ' + firstName,
          isDanger: true,
          callback: callbackLeave
        }];

        break;
      }

      case 'chat': {
        title = 'Delete Chat?';
        description = `Are you sure you want to delete chat with <b>${firstName}</b>?`;
        buttons = [{
          text: 'DELETE FOR ME AND ' + firstName,
          isDanger: true,
          callback: () => callbackFlush()
        }, {
          text: 'DELETE JUST FOR ME',
          isDanger: true,
          callback: () => callbackFlush(true)
        }];

        break;
      }

      case 'saved': {
        title = 'Delete Saved Messages?';
        description = `Are you sure you want to delete all your saved messages?`;
        buttons = [{
          text: 'DELETE SAVED MESSAGES',
          isDanger: true,
          callback: () => callbackFlush()
        }];

        break;
      }

      case 'group': {
        title = 'Delete and leave Group?';
        description = `Are you sure you want to delete all message history and leave <b>${firstName}</b>?`;
        buttons = [{
          text: 'DELETE AND LEAVE ' + firstName,
          isDanger: true,
          callback: () => callbackLeave()
        }];

        break;
      }
    }

    buttons.push({
      text: 'CANCEL',
      isCancel: true
    });

    let popup = new PopupPeer('popup-delete-chat', {
      peerId,
      title,
      description,
      buttons
    });

    popup.show();
  }
}