import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

const caption: LangPackKey = 'PrivacySettingsController.Forwards.CustomHelp';

export default privacyTab('privacy-forward-messages', (tab) => {
  new PrivacySection({
    tab,
    title: 'PrivacyForwardsTitle',
    inputKey: 'inputPrivacyKeyForwards',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });
});
