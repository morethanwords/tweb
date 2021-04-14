/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";
import { PrivacyType } from "../../../../lib/appManagers/appPrivacyManager";
import { LangPackKey } from "../../../../lib/langPack";

export default class AppPrivacyProfilePhotoTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-profile-photo');
    this.setTitle('PrivacyProfilePhoto');

    const caption: LangPackKey = 'PrivacySettingsController.ProfilePhoto.CustomHelp';
    new PrivacySection({
      tab: this,
      title: 'PrivacyProfilePhotoTitle',
      inputKey: 'inputPrivacyKeyProfilePhoto',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: this.scrollable,
      skipTypes: [PrivacyType.Nobody]
    });
  }
}
