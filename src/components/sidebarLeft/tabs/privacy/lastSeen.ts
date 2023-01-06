/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTabEventable} from '../../../sliderTab';
import PrivacySection from '../../../privacySection';
import {LangPackKey} from '../../../../lib/langPack';

export default class AppPrivacyLastSeenTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('privacy-tab', 'privacy-last-seen');
    this.setTitle('PrivacyLastSeen');

    const caption: LangPackKey = 'PrivacySettingsController.LastSeenDescription';
    new PrivacySection({
      tab: this,
      title: 'LastSeenTitle',
      inputKey: 'inputPrivacyKeyStatusTimestamp',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: this.scrollable,
      managers: this.managers
    });
  }
}
