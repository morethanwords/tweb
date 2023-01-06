/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTabEventable} from '../../../sliderTab';
import PrivacySection from '../../../privacySection';
import {LangPackKey} from '../../../../lib/langPack';

export default class AppPrivacyForwardMessagesTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('privacy-tab', 'privacy-forward-messages');
    this.setTitle('PrivacySettings.Forwards');

    const caption: LangPackKey = 'PrivacySettingsController.Forwards.CustomHelp';
    new PrivacySection({
      tab: this,
      title: 'PrivacyForwardsTitle',
      inputKey: 'inputPrivacyKeyForwards',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      appendTo: this.scrollable,
      managers: this.managers
    });
  }
}
