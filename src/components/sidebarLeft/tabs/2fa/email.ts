import { SettingSection } from "../..";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import InputField from "../../../inputField";
import { attachClickEvent, cancelEvent, canFocus } from "../../../../helpers/dom";
import PopupConfirmAction from "../../../popups/confirmAction";
import { putPreloader } from "../../../misc";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import AppTwoStepVerificationSetTab from "./passwordSet";
import AppTwoStepVerificationEmailConfirmationTab from "./emailConfirmation";
import RichTextProcessor from "../../../../lib/richtextprocessor";

export default class AppTwoStepVerificationEmailTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;
  public hint: string;
  public isFirst = false;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-email');
    this.title.innerHTML = 'Recovery Email';

    const section = new SettingSection({
      caption: '',
      noDelimiter: true
    });

    const emoji = '💌';
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
      name: 'recovery-email',
      label: 'Recovery Email',
      plainText: true
    });

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return onContinueClick();
      }
    });

    inputField.input.addEventListener('input', (e) => {
      inputField.input.classList.remove('error');
    });

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'CONTINUE'});
    const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'SKIP'});

    const goNext = () => {
      new AppTwoStepVerificationSetTab(this.slider).open();
    };

    const onContinueClick = () => {
      const email = inputField.value.trim();
      const match = RichTextProcessor.matchEmail(email);
      if(!match || match[0].length !== email.length) {
        inputField.input.classList.add('error');
        return;
      }

      toggleButtons(true);
      const d = putPreloader(btnContinue);

      passwordManager.updateSettings({
        hint: this.hint,
        currentPassword: this.plainPassword,
        newPassword: this.newPassword,
        email
      }).then((value) => {
        goNext();
      }, (err) => {
        if(err.type.includes('EMAIL_UNCONFIRMED')) {
          const symbols = +err.type.match(/^EMAIL_UNCONFIRMED_(\d+)/)[1];

          const tab = new AppTwoStepVerificationEmailConfirmationTab(this.slider);
          tab.state = this.state;
          tab.email = email;
          tab.length = symbols;
          tab.open();
        } else {
          console.log('password set error', err);
        }

        toggleButtons(false);
        d.remove();
      });
    };
    attachClickEvent(btnContinue, onContinueClick);

    const toggleButtons = (freeze: boolean) => {
      if(freeze) {
        btnContinue.setAttribute('disabled', 'true');
        btnSkip.setAttribute('disabled', 'true');
      } else {
        btnContinue.removeAttribute('disabled');
        btnSkip.removeAttribute('disabled');
      }
    };

    attachClickEvent(btnSkip, (e) => {
      const popup = new PopupConfirmAction('popup-skip-email', [{
        text: 'CANCEL',
        isCancel: true
      }, {
        text: 'SKIP',
        callback: () => {
          //inputContent.classList.add('sidebar-left-section-disabled');
          toggleButtons(true);
          putPreloader(btnSkip);
          passwordManager.updateSettings({
            hint: this.hint, 
            currentPassword: this.plainPassword,
            newPassword: this.newPassword,
            email: ''
          }).then(() => {
            goNext();
          }, (err) => {
            toggleButtons(false);
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
    if(!canFocus(this.isFirst)) return;
    this.inputField.input.focus();
  }
}
