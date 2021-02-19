import { SettingSection } from "../..";
import { attachClickEvent } from "../../../../helpers/dom";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import Button from "../../../button";
import PopupConfirmAction from "../../../popups/confirmAction";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import AppTwoStepVerificationEnterPasswordTab from "./enterPassword";

export default class AppTwoStepVerificationTab extends SliderSuperTab {
  public state: AccountPassword;
  public plainPassword: string;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification');
    this.title.innerHTML = 'Two-Step Verification';

    const section = new SettingSection({
      caption: ' ',
      noDelimiter: true
    });

    const emoji = '🔐';
    const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
    const stickerContainer = document.createElement('div');

    wrapSticker({
      doc,
      div: stickerContainer,
      loop: false,
      play: true,
      width: 168,
      height: 168,
      emoji
    }).then(() => {
      // this.animation = player;
    });

    section.content.append(stickerContainer);

    const c = section.generateContentElement();
    if(this.state.pFlags.has_password) {
      section.caption.innerHTML = 'You have enabled Two-Step verification.<br/>You\'ll need the password you set up here to log in to your Telegram account';

      const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'Change Password'});
      const btnDisablePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'Turn Password Off'});
      const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: 'Set Recovery Email'});

      attachClickEvent(btnDisablePassword, () => {
        const popup = new PopupConfirmAction('popup-disable-password', [{
          text: 'DISABLE',
          callback: () => {
            passwordManager.updateSettings({currentPassword: this.plainPassword});
          },
          isDanger: true,
        }], {
          title: 'Warning',
          text: 'Are you sure you want to disable your password?'
        });

        popup.show();
      });

      c.append(btnChangePassword, btnDisablePassword, btnSetRecoveryEmail);
    } else {
      section.caption.innerHTML = 'You can set a password that will be required when you log in on a new device in addition to the code you get in the SMS.';

      const btnSetPassword = Button('btn-primary', {text: 'SET PASSWORD'});
      c.append(btnSetPassword);

      attachClickEvent(btnSetPassword, (e) => {
        const tab = new AppTwoStepVerificationEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.open();
      });
    }

    this.scrollable.container.append(section.container);
  }
}
