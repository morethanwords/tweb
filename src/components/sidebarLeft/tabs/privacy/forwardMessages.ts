import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";

export default class AppPrivacyForwardMessagesTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-forward-messages');
    this.title.innerHTML = 'Forward Messages';

    const caption = 'You can restrict who can add a link to your account when forwarding your messages.';
    new PrivacySection({
      tab: this,
      title: 'Who can add a link to my account when forwarding my messages?',
      inputKey: 'inputPrivacyKeyForwards',
      captions: [caption, caption, caption],
      exceptionTexts: ['Never Allow', 'Always Allow'],
      appendTo: this.scrollable
    });
  }
}
