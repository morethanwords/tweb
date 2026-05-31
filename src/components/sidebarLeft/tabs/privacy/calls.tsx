import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';

const callCaption: LangPackKey = 'PrivacySettingsController.PhoneCallDescription';
const p2pCaption: LangPackKey = 'PrivacySettingsController.P2p.Desc';

export default privacyTab('privacy-calls', (tab) => {
  new PrivacySection({
    tab,
    title: 'WhoCanCallMe',
    inputKey: 'inputPrivacyKeyPhoneCall',
    captions: [callCaption, callCaption, callCaption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });

  new PrivacySection({
    tab,
    title: 'PrivacyP2PHeader',
    inputKey: 'inputPrivacyKeyPhoneP2P',
    captions: [p2pCaption, p2pCaption, p2pCaption],
    exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
    appendTo: tab.scrollable,
    managers: tab.managers
  });
});
