/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { PrivacyType } from "../../../../lib/appManagers/appPrivacyManager";
import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";
import { i18n, LangPackKey } from "../../../../lib/langPack";
import anchorCopy from "../../../../helpers/dom/anchorCopy";
import appUsersManager from "../../../../lib/appManagers/appUsersManager";

export default class AppPrivacyPhoneNumberTab extends SliderSuperTabEventable {
  protected init() {
    this.header.classList.add('with-border');
    this.container.classList.add('privacy-tab', 'privacy-phone-number');
    this.setTitle('PrivacyPhone');

    const formatted = '+' + appUsersManager.getSelf().phone;
    const captionEl = document.createElement('div');
    captionEl.append(
      i18n('PrivacyPhoneInfo'), 
      document.createElement('br'), 
      document.createElement('br'), 
      i18n('PrivacyPhoneInfo4'),
      document.createElement('br'),
      anchorCopy({
        mePath: formatted
      })
    );

    const phoneSection = new PrivacySection({
      tab: this,
      title: 'PrivacyPhoneTitle',
      inputKey: 'inputPrivacyKeyPhoneNumber',
      captions: [captionEl, captionEl, ''],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: this.scrollable,
      onRadioChange: (type) => {
        s.setRadio(PrivacyType.Everybody);
        s.radioSection.container.classList.toggle('hide', type !== PrivacyType.Nobody);
      }
    });

    const sCaption: LangPackKey = 'PrivacyPhoneInfo3';
    const s = new PrivacySection({
      tab: this,
      title: 'PrivacyPhoneTitle2',
      inputKey: 'inputPrivacyKeyAddedByPhone',
      captions: [sCaption, sCaption, ''],
      noExceptions: true,
      skipTypes: [PrivacyType.Nobody]
    });

    this.scrollable.container.insertBefore(s.radioSection.container, phoneSection.radioSection.container.nextSibling);
  }
}
