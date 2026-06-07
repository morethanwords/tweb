import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey, i18n} from '@lib/langPack';
import anchorCallback from '@helpers/dom/anchorCallback';
import PopupPremium from '@components/popups/premium';

const caption: LangPackKey = 'PrivacyVoiceMessagesInfo';

export default privacyTab('privacy-voices', (tab) => {
  new PrivacySection({
    tab,
    title: 'PrivacyVoiceMessagesTitle',
    inputKey: 'inputPrivacyKeyVoiceMessages',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers,
    premiumOnly: true,
    premiumCaption: i18n('Privacy.VoiceMessagesPremiumCaption', [anchorCallback(() => {
      PopupPremium.show();
    })]),
    premiumError: 'PrivacySettings.Voice.PremiumError'
  });
});
