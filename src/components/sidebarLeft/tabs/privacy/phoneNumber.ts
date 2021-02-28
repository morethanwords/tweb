import { PrivacyType } from "../../../../lib/appManagers/appPrivacyManager";
import { SliderSuperTabEventable } from "../../../sliderTab";
import PrivacySection from "../../../privacySection";

export default class AppPrivacyPhoneNumberTab extends SliderSuperTabEventable {
  protected init() {
    this.container.classList.add('privacy-tab', 'privacy-phone-number');
    this.title.innerHTML = 'Phone Number';

    const phoneCaption = 'Users who have your number saved in their contacts will also see it on Telegram.';
    const phoneSection = new PrivacySection({
      tab: this,
      title: 'Who can see your phone number?',
      inputKey: 'inputPrivacyKeyPhoneNumber',
      captions: [phoneCaption, phoneCaption, ''],
      exceptionTexts: ['Never Share With', 'Always Share With'],
      appendTo: this.scrollable,
      onRadioChange: (type) => {
        s.setRadio(PrivacyType.Everybody);
        s.radioSection.container.classList.toggle('hide', type !== PrivacyType.Nobody);
      }
    });

    const sCaption = 'Users who add your number to their contacts will see it on Telegram only if they are your contacts.';
    const s = new PrivacySection({
      tab: this,
      title: 'Who can find me by my number',
      inputKey: 'inputPrivacyKeyAddedByPhone',
      captions: [sCaption, sCaption, ''],
      noExceptions: true,
      skipTypes: [PrivacyType.Nobody]
    });

    this.scrollable.container.insertBefore(s.radioSection.container, phoneSection.radioSection.container.nextSibling);
  }
}
