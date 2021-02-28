import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";
import { PrivacyType } from "../../../../lib/appManagers/appPrivacyManager";

export default class AppPrivacyProfilePhotoTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-profile-photo');
    this.title.innerHTML = 'Profile Photo';

    const caption = 'You can restrict who can see your profile photo with granular precision.';
    new PrivacySection({
      tab: this,
      title: 'Who can see your profile photo?',
      inputKey: 'inputPrivacyKeyChatInvite',
      captions: [caption, caption, caption],
      exceptionTexts: ['Never Share With', 'Always Share With'],
      appendTo: this.scrollable,
      skipTypes: [PrivacyType.Nobody]
    });
  }
}
