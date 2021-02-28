import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";

export default class AppPrivacyLastSeenTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-last-seen');
    this.title.innerHTML = 'Last Seen & Online';

    const caption = 'You won\'t see Last Seen and online statuses for people with whom you don\'t share yours.<br>Approximate last seen will be shown instead (recently, within a week, within a month).';
    new PrivacySection({
      tab: this,
      title: 'Who can see your Last Seen time?',
      inputKey: 'inputPrivacyKeyStatusTimestamp',
      captions: [caption, caption, caption],
      exceptionTexts: ['Never Share With', 'Always Share With'],
      appendTo: this.scrollable
    });
  }
}
