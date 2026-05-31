import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';
import PrivacyType from '@appManagers/utils/privacy/privacyType';

const caption: LangPackKey = 'Privacy.BioCaption';

export default privacyTab('privacy-about', (tab) => {
  new PrivacySection({
    tab,
    title: 'Privacy.Bio',
    inputKey: 'inputPrivacyKeyAbout',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    skipTypes: [PrivacyType.Nobody],
    managers: tab.managers
  });
});
