import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey, i18n} from '@lib/langPack';
import anchorCallback from '@helpers/dom/anchorCallback';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

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
      hotReloadGuard.showPremiumPopup();
    })]),
    premiumError: 'PrivacySettings.Voice.PremiumError'
  });
});
