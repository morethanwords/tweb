import {SliderSuperTabEventable} from '@components/sliderTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

export default class AppPrivacySavedMusicTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('privacy-tab', 'privacy-saved-music');
    this.setTitle('PrivacySavedMusic');

    const caption: LangPackKey = 'Privacy.SavedMusicCaption';
    new PrivacySection({
      tab: this,
      title: 'Privacy.SavedMusic',
      inputKey: 'inputPrivacyKeySavedMusic',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      appendTo: this.scrollable,
      managers: this.managers
    });
  }
}
