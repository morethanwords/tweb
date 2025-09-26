/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {render} from 'solid-js/web';
import Row from '../rowTsx';
import {i18n} from '../../lib/langPack';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {IconTsx} from '../iconTsx';

export default class PopupAboutAd extends PopupElement {
  constructor() {
    super('popup-about-ad', {
      overlayClosable: true,
      body: true,
      scrollable: true,
      withConfirm: 'RevenueSharingAdsAlertButton',
      footer: true
    });

    this.header.remove();
    this.footer.append(this.btnConfirm);
    attachClickEvent(this.btnConfirm, () => {
      this.hide();
    });
    this.construct();
  }

  private _construct() {
    return (
      <>
        <div class="popup-about-ad-icon"><IconTsx icon="ads" /></div>
        <div class="popup-about-ad-title">{i18n('AboutRevenueSharingAds')}</div>
        <div class="popup-about-ad-subtitle">{i18n('RevenueSharingAdsAlertSubtitle')}</div>
        <Row>
          <Row.Icon icon="lock" />
          <Row.Title>{i18n('RevenueSharingAdsInfo1Title')}</Row.Title>
          <Row.Subtitle>{i18n('RevenueSharingAdsInfo1Subtitle')}</Row.Subtitle>
        </Row>
        <Row>
          <Row.Icon icon="revenue" />
          <Row.Title>{i18n('RevenueSharingAdsInfo2Title')}</Row.Title>
          <Row.Subtitle>{i18n('RevenueSharingAdsInfo2Subtitle')}</Row.Subtitle>
        </Row>
        <Row>
          <Row.Icon icon="nochannel" />
          <Row.Title>{i18n('RevenueSharingAdsInfo3Title')}</Row.Title>
          <Row.Subtitle>{i18n('RevenueSharingAdsInfo3Subtitle')}</Row.Subtitle>
        </Row>
        <div class="popup-about-ad-caption">
          <div class="popup-about-ad-caption-title">{i18n('RevenueSharingAdsInfo4Title')}</div>
          <div class="popup-about-ad-caption-subtitle">{i18n('RevenueSharingAdsInfo4Subtitle2', [i18n('RevenueSharingAdsInfo4SubtitleLearnMore1')])}</div>
        </div>
      </>
    );
  }

  private async construct() {
    const div = document.createElement('div');
    this.scrollable.append(div);
    const dispose = render(() => this._construct(), div);
    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
