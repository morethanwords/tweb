import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";

export default class AppPrivacyCallsTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-calls');
    this.title.innerHTML = 'Calls';

    const caption = 'You can restrict who can call you with granular precision.';
    new PrivacySection({
      tab: this,
      title: 'Who can call me?',
      inputKey: 'inputPrivacyKeyPhoneCall',
      captions: [caption, caption, caption],
      exceptionTexts: ['Never Allow', 'Always Allow'],
      appendTo: this.scrollable
    });

    {
      const caption = 'Disabling peer-to-peer will relay all calls through Telegram servers to avoid revealing your IP address, but will slightly decrease audio quality.';
      new PrivacySection({
        tab: this,
        title: 'Peer to peer?',
        inputKey: 'inputPrivacyKeyPhoneP2P',
        captions: [caption, caption, caption],
        exceptionTexts: ['Never Allow', 'Always Allow'],
        appendTo: this.scrollable
      });
    }
  }
}
