/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ReportReason} from '../../layer';
import InputField from '../inputField';
import {toastNew} from '../toast';
import wrapStickerEmoji from '../wrappers/stickerEmoji';
import PopupPeer from './peer';

export default class PopupReportMessagesConfirm extends PopupPeer {
  public static STICKER_EMOJI = '👮‍♀️';
  constructor(peerId: PeerId, mids: number[], reason: ReportReason['_'], onConfirm?: () => void) {
    super('popup-report-messages-confirm', {
      noTitle: true,
      descriptionLangKey: 'ReportInfo',
      buttons: [{
        langKey: 'ReportChat',
        callback: () => {
          if(!inputField.isValid()) {
            return;
          }

          onConfirm && onConfirm();
          this.managers.appMessagesManager.reportMessages(peerId, mids, reason, inputField.value).then((bool) => {
            if(!bool) return;

            toastNew({
              langPackKey: 'ReportSentInfo'
            });
          });
        }
      }],
      body: true
    });

    const div = document.createElement('div');
    const size = 100;
    wrapStickerEmoji({
      div,
      emoji: PopupReportMessagesConfirm.STICKER_EMOJI,
      width: size,
      height: size
    }).then(({render}) => render).finally(() => {
      this.show();
    });

    this.header.replaceWith(div);

    const inputField = new InputField({
      label: 'ReportHint',
      maxLength: 512,
      placeholder: 'ReportChatDescription'
    });

    inputField.input.addEventListener('input', () => {
      this.buttons[0].element.toggleAttribute('disabled', !inputField.isValid());
    });

    this.body.append(inputField.container);
  }
}
