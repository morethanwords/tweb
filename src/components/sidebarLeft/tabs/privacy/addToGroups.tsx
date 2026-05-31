import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

const caption: LangPackKey = 'PrivacySettingsController.GroupDescription';

export default privacyTab('privacy-add-to-groups', (tab) => {
  new PrivacySection({
    tab,
    title: 'WhoCanAddMe',
    inputKey: 'inputPrivacyKeyChatInvite',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });
});
