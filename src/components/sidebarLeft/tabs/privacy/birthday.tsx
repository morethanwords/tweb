import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

const caption: LangPackKey = 'Privacy.BirthdayCaption';

export default privacyTab('privacy-birthday', (tab) => {
  new PrivacySection({
    tab,
    title: 'Privacy.Birthday',
    inputKey: 'inputPrivacyKeyBirthday',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });
});
