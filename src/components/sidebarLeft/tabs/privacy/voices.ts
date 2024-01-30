/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTabEventable} from '../../../sliderTab';
import PrivacySection from '../../../privacySection';
import {LangPackKey, i18n} from '../../../../lib/langPack';
import anchorCallback from '../../../../helpers/dom/anchorCallback';
import PopupPremium from '../../../popups/premium';

export default class AppPrivacyVoicesTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('privacy-tab', 'privacy-voices');
    this.setTitle('PrivacyVoiceMessages');

    const caption: LangPackKey = 'PrivacyVoiceMessagesInfo';
    new PrivacySection({
      tab: this,
      title: 'PrivacyVoiceMessagesTitle',
      inputKey: 'inputPrivacyKeyVoiceMessages',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      appendTo: this.scrollable,
      managers: this.managers,
      premiumOnly: true,
      premiumCaption: i18n('Privacy.VoiceMessagesPremiumCaption', [anchorCallback(() => {
        PopupPremium.show();
      })]),
      premiumError: 'PrivacySettings.Voice.PremiumError'
    });
  }
}
