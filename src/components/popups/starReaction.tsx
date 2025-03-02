/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import I18n, {i18n} from '../../lib/langPack';
import LimitLine from '../limit';
import wrapPeerTitle from '../wrappers/peerTitle';
import {StarsBalance} from './stars';
import {createEffect, createSignal} from 'solid-js';
import {easeOutCircApply} from '../../helpers/easing/easeOutCirc';
import RowTsx from '../rowTsx';
import CheckboxField from '../checkboxField';
import {replaceButtonIcon} from '../button';

export default class PopupStarReaction extends PopupElement {
  constructor(private peerId: PeerId, private mid: number) {
    super('popup-stars popup-star-reaction', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      footer: true,
      withConfirm: true
      // title: true
    });

    this.footer.classList.add('abitlarger');

    this.construct();
  }

  private _construct(peerTitle: HTMLElement) {
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);

    const sendText = new I18n.IntlElement({key: 'PaidReaction.Send'});

    this.btnConfirm.append(sendText.element);
    replaceButtonIcon(this.btnConfirm, 'star');
    this.header.append(StarsBalance() as HTMLElement);

    const maximumStars = 2500;
    const [stars, setStars] = createSignal<number>();

    const updateProgress = (progress: number) => {
      const v = easeOutCircApply(1 - progress, 1);
      const stars = Math.max(1, Math.round((1 - v) * maximumStars));
      limitLine.setProgress(progress, '' + stars);
      setStars(stars);
    };

    const value = 0.1983;
    const limitLine = new LimitLine({
      progress: true,
      hint: {
        icon: 'star',
        noStartEnd: true
      },
      slider: updateProgress,
      sliderValue: value
    });

    updateProgress(value);
    limitLine._setHintActive();

    const checkboxField = new CheckboxField({
      text: 'StarsReactionShowMeInTopSenders'
    });

    createEffect(() => {
      sendText.compareAndUpdate({
        args: [stars()]
      });
    });

    return (
      <>
        <div class="popup-stars-slider">
          {limitLine.container}
        </div>
        <div class="popup-stars-title">{i18n('StarsReactionTitle')}</div>
        <div class="popup-stars-subtitle">{i18n('StarsReactionText', [peerTitle])}</div>
        <div class="popup-star-reaction-senders">
          <div class="popup-star-reaction-senders-delimiter">
            <div class="popup-star-reaction-senders-line"></div>
            <span class="popup-star-reaction-senders-text">
              {i18n('StarsReactionTopSenders')}
            </span>
            <div class="popup-star-reaction-senders-line"></div>
          </div>
        </div>
        <div class="popup-star-reaction-checkbox">
          <RowTsx
            classList={{'popup-star-reaction-checkbox-row': true}}
            checkboxField={checkboxField.label}
          />
        </div>
      </>
    );
  }

  private async construct() {
    const [peerTitle] = await Promise.all([
      wrapPeerTitle({peerId: this.peerId})
    ]);

    this.appendSolid(() => this._construct(peerTitle));
    this.show();
  }
}
