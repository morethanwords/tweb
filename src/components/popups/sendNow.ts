/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupPeer from './peer';

export default class PopupSendNow extends PopupPeer {
  constructor(peerId: PeerId, mids: number[], onConfirm?: () => void) {
    super('popup-delete-chat', {
      title: `Send Message${mids.length > 1 ? 's' : ''} Now`,
      description: mids.length > 1 ? 'Send ' + mids.length + ' messages now?' : 'Send message now?',
      buttons: [{
        langKey: 'Send',
        callback: () => {
          onConfirm && onConfirm();
          this.managers.appMessagesManager.sendScheduledMessages(peerId, mids);
        }
      }]
    });

    this.show();
  }
}
