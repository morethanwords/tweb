import { SettingSection } from "../..";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import InputField from "../../../inputField";
import { attachClickEvent } from "../../../../helpers/dom";
import PopupConfirmAction from "../../../popups/confirmAction";
import { putPreloader } from "../../../misc";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import AppTwoStepVerificationSetTab from "./passwordSet";

export default class AppTwoStepVerificationEmailConfirmationTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;
  public hint: string;
  public email: string;
  public length: number;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-email-confirmation');
    this.title.innerHTML = 'Recovery Email';

    const section = new SettingSection({
      caption: ' ',
      noDelimiter: true
    });

    const emoji = '📬';
    const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
    const stickerContainer = document.createElement('div');

    if(doc) {
      wrapSticker({
        doc,
        div: stickerContainer,
        loop: false,
        play: true,
        width: 160,
        height: 160,
        emoji
      }).then(() => {
        // this.animation = player;
      });
    } else {
      stickerContainer.classList.add('media-sticker-wrapper');
    }

    section.content.append(stickerContainer);

    const inputContent = section.generateContentElement();

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const inputField = this.inputField = new InputField({
      name: 'recovery-email-code',
      label: 'Code'
    });

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'CONTINUE'});
    const btnSkip = Button('btn-primary btn-primary-transparent primary', {text: 'SKIP'});

    const goNext = () => {
      new AppTwoStepVerificationSetTab(this.slider).open();
    };

    attachClickEvent(btnContinue, (e) => {
      
    });

    attachClickEvent(btnSkip, (e) => {
      const popup = new PopupConfirmAction('popup-skip-email', [{
        text: 'CANCEL',
        isCancel: true
      }, {
        text: 'SKIP',
        callback: () => {
          //inputContent.classList.add('sidebar-left-section-disabled');
          btnContinue.setAttribute('disabled', 'true');
          btnSkip.setAttribute('disabled', 'true');
          putPreloader(btnSkip);
          passwordManager.updateSettings({
            hint: this.hint, 
            currentPassword: this.plainPassword,
            newPassword: this.newPassword
          }).then(() => {
            goNext();
          }, (err) => {
            btnContinue.removeAttribute('disabled');
            btnSkip.removeAttribute('disabled');
          });
        },
        isDanger: true,
      }], {
        title: 'Warning',
        text: 'No, seriously.<br/><br/>If you forget your password, you will lose access to your Telegram account. There will be no way to restore it.'
      });

      popup.show();
    });

    inputWrapper.append(inputField.container, btnContinue, btnSkip);

    inputContent.append(inputWrapper);

    this.scrollable.container.append(section.container);
  }

  onOpenAfterTimeout() {
    this.inputField.input.focus();
  }
}
