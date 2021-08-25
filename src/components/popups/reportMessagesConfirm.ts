/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { ReportReason } from "../../layer";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appStickersManager from "../../lib/appManagers/appStickersManager";
import InputField from "../inputField";
import { toastNew } from "../toast";
import { wrapSticker } from "../wrappers";
import PopupPeer from "./peer";

export default class PopupReportMessagesConfirm extends PopupPeer {
  public static STICKER_EMOJI = '👮‍♀️';
  constructor(peerId: number, mids: number[], reason: ReportReason['_'], onConfirm?: () => void) {
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
          appMessagesManager.reportMessages(peerId, mids, reason, inputField.value).then(bool => {
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
    const doc = appStickersManager.getAnimatedEmojiSticker(PopupReportMessagesConfirm.STICKER_EMOJI);
    const size = 100;
    wrapSticker({
      doc,
      div,
      emoji: PopupReportMessagesConfirm.STICKER_EMOJI,
      width: size,
      height: size,
      loop: false,
      play: true
    }).finally(() => {
      this.show();
    });

    this.header.append(div);

    const inputField = new InputField({
      label: 'ReportHint',
      maxLength: 512,
      placeholder: 'ReportChatDescription'
    });

    this.body.append(inputField.container);
  }
}
