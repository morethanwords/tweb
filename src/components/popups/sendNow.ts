/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { PopupButton } from ".";
import PopupPeer from "./peer";

export default class PopupSendNow {
  constructor(peerId: number, mids: number[], onConfirm?: () => void) {
    let title: string, description: string, buttons: PopupButton[] = [];

    title = `Send Message${mids.length > 1 ? 's' : ''} Now`;
    description = mids.length > 1 ? 'Send ' + mids.length + ' messages now?' : 'Send message now?';

    const callback = () => {
      onConfirm && onConfirm();
      appMessagesManager.sendScheduledMessages(peerId, mids);
    };

    buttons.push({
      langKey: 'Send',
      callback
    });

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      title,
      description,
      buttons
    });

    popup.show();
  }
}