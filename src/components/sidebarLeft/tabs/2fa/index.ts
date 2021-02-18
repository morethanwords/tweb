import { generateSection, SettingSection } from "../..";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";

export default class AppTwoStepVerificationTab extends SliderSuperTab {
  public passwordState: AccountPassword;

  constructor(slider: SidebarSlider) {
    super(slider);
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
    if(this.passwordState.pFlags.has_password) {
      section.caption.innerHTML = 'You have enabled Two-Step verification.<br/>You\'ll need the password you set up here to log in to your Telegram account';

      const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'Change Password'});
      const btnRemovePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'Turn Password Off'});
      const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: 'Set Recovery Email'});

      c.append(btnChangePassword, btnRemovePassword, btnSetRecoveryEmail);
    } else {
      section.caption.innerHTML = 'You can set a password that will be required when you log in on a new device in addition to the code you get in the SMS.';

      const btnSetPassword = Button('btn-primary', {text: 'SET PASSWORD'});
      c.append(btnSetPassword);
    }

    this.scrollable.container.append(section.container);
  }
}
