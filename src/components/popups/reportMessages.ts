/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import whichChild from '../../helpers/dom/whichChild';
import preloadAnimatedEmojiSticker from '../../helpers/preloadAnimatedEmojiSticker';
import {ReportReason} from '../../layer';
import {LangPackKey} from '../../lib/langPack';
import Button from '../button';
import PopupPeer from './peer';
import PopupReportMessagesConfirm from './reportMessagesConfirm';

export default class PopupReportMessages extends PopupPeer {
  constructor(peerId: PeerId, mids: number[], onConfirm?: () => void) {
    super('popup-report-messages', {titleLangKey: 'ChatTitle.ReportMessages', buttons: [], body: true});

    mids = mids.slice();

    const buttons: [LangPackKey, ReportReason['_']][] = [
      ['ReportChatSpam', 'inputReportReasonSpam'],
      ['ReportChatViolence', 'inputReportReasonViolence'],
      ['ReportChatChild', 'inputReportReasonChildAbuse'],
      ['ReportChatPornography', 'inputReportReasonPornography'],
      ['ReportChatOther', 'inputReportReasonOther'],
      ['ReportChatPersonalDetails', 'inputReportReasonPersonalDetails'],
      ['ReportChatIllegalDrugs', 'inputReportReasonIllegalDrugs']
    ];

    const className = 'btn-primary btn-transparent';
    buttons.forEach((b) => {
      const button = Button(className, {/* icon: 'edit',  */text: b[0]});
      this.body.append(button);
    });

    const preloadStickerPromise = preloadAnimatedEmojiSticker(PopupReportMessagesConfirm.STICKER_EMOJI);

    attachClickEvent(this.body, (e) => {
      const target = findUpClassName(e.target, 'btn-primary');
      const reason = buttons[whichChild(target)][1];

      preloadStickerPromise.then(() => {
        this.hide();

        PopupElement.createPopup(PopupReportMessagesConfirm, peerId, mids, reason, onConfirm);
      });
    }, {listenerSetter: this.listenerSetter});

    // this.body.style.margin = '0 -1rem';
    this.buttonsEl.style.marginTop = '.5rem';

    this.show();
  }
}
