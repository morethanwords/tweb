/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appChatsManager from "../../lib/appManagers/appChatsManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager, { PeerType } from "../../lib/appManagers/appPeersManager";
import { LangPackKey } from "../../lib/langPack";
import PeerTitle from "../peerTitle";
import PopupPeer, { PopupPeerButtonCallbackCheckboxes, PopupPeerOptions } from "./peer";

export default class PopupDeleteDialog {
  constructor(peerId: number, peerType: PeerType = appPeersManager.getDialogType(peerId), onSelect?: (promise: Promise<any>) => void) {
    const peerTitleElement = new PeerTitle({
      peerId,
      onlyFirstName: true
    }).element;

    /* const callbackFlush = (checked: PopupPeerButtonCallbackCheckboxes) => {
      const promise = appMessagesManager.flushHistory(peerId, checkboxes ? !checked[checkboxes[0].text] : undefined);
      onSelect && onSelect(promise);
    }; */

    const callbackLeave = (checked: PopupPeerButtonCallbackCheckboxes) => {
      const promise = appChatsManager.leave(-peerId).then(() => {
        return appMessagesManager.flushHistory(-peerId);
      });
      
      onSelect && onSelect(promise);
    };

    const callbackDelete = (checked: PopupPeerButtonCallbackCheckboxes) => {
      let promise: Promise<any>;

      if(peerId > 0) {
        promise = appMessagesManager.flushHistory(peerId, false, checkboxes ? checked[checkboxes[0].text] : undefined);
      } else {
        if(checked[checkboxes[0].text]) {
          promise = appChatsManager.delete(-peerId);
        } else {
          return callbackLeave(checked);
        }
      }
      
      onSelect && onSelect(promise);
    };

    let title: LangPackKey, description: LangPackKey, descriptionArgs: any[], buttons: PopupPeerOptions['buttons'], checkboxes: PopupPeerOptions['checkboxes'];
    switch(peerType) {
      case 'channel': {
        title = 'LeaveChannelMenu';
        description = 'ChannelLeaveAlertWithName';
        descriptionArgs = [peerTitleElement];
        buttons = [{
          langKey: 'LeaveChannel',
          isDanger: true,
          callback: callbackLeave
        }];

        break;
      }

      /* case 'megagroup': {
        title = 'Leave Group?';
        description = `Are you sure you want to leave this group?`;
        buttons = [{
          text: 'LEAVE ' + peerTitleElement,
          isDanger: true,
          callback: callbackLeave
        }];

        break;
      } */

      case 'chat': {
        title = 'DeleteChatUser';
        description = 'AreYouSureDeleteThisChatWithUser';
        descriptionArgs = [peerTitleElement];

        checkboxes = [{
          text: 'DeleteMessagesOptionAlso',
          textArgs: [
            new PeerTitle({
              peerId,
              onlyFirstName: true
            }).element
          ]
        }];

        buttons = [{
          langKey: 'DeleteChatUser',
          isDanger: true,
          callback: callbackDelete
        }];

        break;
      }

      case 'saved': {
        title = 'DeleteChatUser';
        description = 'AreYouSureDeleteThisChatSavedMessages';
        buttons = [{
          langKey: 'DeleteChatUser',
          isDanger: true,
          callback: callbackDelete
        }];

        break;
      }

      case 'megagroup':
      case 'group': {
        if(appChatsManager.hasRights(-peerId, 'delete_chat')) {
          title = 'DeleteMegaMenu';
          description = 'AreYouSureDeleteAndExit';
          buttons = [{
            langKey: 'DeleteMegaMenu',
            isDanger: true,
            callback: callbackDelete
          }];

          checkboxes = [{
            text: 'DeleteChat.DeleteGroupForAll'
          }];
        } else {
          title = 'LeaveMegaMenu';
          description = 'AreYouSureDeleteAndExitName';
          descriptionArgs = [peerTitleElement];
          buttons = [{
            langKey: 'DeleteChatUser',
            isDanger: true,
            callback: callbackLeave
          }];
        }

        break;
      }
    }

    new PopupPeer('popup-delete-chat', {
      peerId,
      titleLangKey: title,
      descriptionLangKey: description,
      descriptionLangArgs: descriptionArgs,
      buttons,
      checkboxes
    }).show();
  }
}
