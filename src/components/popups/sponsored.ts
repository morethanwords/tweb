/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import safeWindowOpen from '../../helpers/dom/safeWindowOpen';
import I18n, {i18n} from '../../lib/langPack';
import PopupPeer from './peer';

export default class PopupSponsored extends PopupPeer {
  constructor() {
    super('popup-sponsored', {
      titleLangKey: 'Chat.Message.Sponsored.What',
      descriptionLangKey: 'Chat.Message.Ad.Text',
      descriptionLangArgs: [i18n('Chat.Message.Sponsored.Link')],
      buttons: [{
        langKey: 'OK',
        isCancel: true
      }, {
        langKey: 'Chat.Message.Ad.ReadMore',
        callback: () => {
          safeWindowOpen(I18n.format('Chat.Message.Sponsored.Link', true));
        },
        isCancel: true
      }],
      scrollable: true
    });

    this.scrollable.append(this.description);

    this.show();
  }
}
