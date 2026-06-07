import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';
import PrivacyType from '@appManagers/utils/privacy/privacyType';

const caption: LangPackKey = 'PrivacySettingsController.ProfilePhoto.CustomHelp';

export default privacyTab('privacy-profile-photo', (tab) => {
  new PrivacySection({
    tab,
    title: 'PrivacyProfilePhotoTitle',
    inputKey: 'inputPrivacyKeyProfilePhoto',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
    appendTo: tab.scrollable,
    skipTypes: [PrivacyType.Nobody],
    managers: tab.managers
  });
});
