import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

const caption: LangPackKey = 'Privacy.SavedMusicCaption';

export default privacyTab('privacy-saved-music', (tab) => {
  new PrivacySection({
    tab,
    title: 'Privacy.SavedMusic',
    inputKey: 'inputPrivacyKeySavedMusic',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });
});
