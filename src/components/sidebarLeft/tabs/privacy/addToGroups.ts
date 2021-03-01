import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";

export default class AppPrivacyAddToGroupsTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-add-to-groups');
    this.title.innerHTML = 'Groups and Channels';

    const caption = 'You can restrict who can add you to groups and channels with granular precision.';
    new PrivacySection({
      tab: this,
      title: 'Who can add me to group chats?',
      inputKey: 'inputPrivacyKeyChatInvite',
      captions: [caption, caption, caption],
      exceptionTexts: ['Never Allow', 'Always Allow'],
      appendTo: this.scrollable
    });
  }
}
